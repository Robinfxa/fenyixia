import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import duckdb from 'duckdb';
import { closeDb, db, initDb } from './index.js';
import {
  cleanupExpiredBackups,
  getZonedTimeParts,
  hasBackupForDate,
  listBackups,
  runDatabaseBackup,
} from './backup.js';

async function runTests() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fenyixia-bkp-test-'));
  const dbPath = path.join(workDir, 'fenyixia.duckdb');
  const uploadsDir = path.join(workDir, 'uploads');
  const backupDir = path.join(workDir, 'backups');
  const restoreDir = path.join(workDir, 'restored');

  try {
    // 1. Verify EST (UTC-5) and EDT (UTC-4) timezone formatting for 03:00 Eastern
    const winter = getZonedTimeParts(new Date('2026-11-11T08:00:00Z'), 'America/Toronto');
    assert.equal(winter.dateStr, '2026-11-11');
    assert.equal(winter.hour, 3);
    assert.equal(winter.stamp, '2026-11-11_03-00-00');

    const summer = getZonedTimeParts(new Date('2026-07-15T07:00:00Z'), 'America/Toronto');
    assert.equal(summer.dateStr, '2026-07-15');
    assert.equal(summer.hour, 3);
    assert.equal(summer.stamp, '2026-07-15_03-00-00');
    console.log('✓ Timezone DST test passed');

    // 2. Initialize real DuckDB + populate sample uploads & records
    fs.mkdirSync(path.join(uploadsDir, 'receipts'), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, 'proofs'), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, 'receipts', 'receipt-1.jpg'), 'fake-jpg-bytes');
    fs.writeFileSync(path.join(uploadsDir, 'proofs', 'proof-1.png'), 'fake-png-bytes');

    await initDb(dbPath);
    await db.run(
      `INSERT INTO bills (id, title, total_amount, date, payer_id)
       VALUES (?, ?, ?, ?, ?)`,
      'bill-backup-1',
      'Backup Test Dinner',
      88.5,
      '2026-11-11',
      '00000000-0000-0000-0000-000000000001'
    );

    // 3. Seed old backup archives to test 30-day retention cleanup
    fs.mkdirSync(backupDir, { recursive: true });
    const seedNames = [
      'fenyixia-backup-2026-10-10_03-00-00.tar.gz', // 32 days old -> delete
      'fenyixia-backup-2026-10-12_03-00-00.tar.gz', // 30 days old -> delete
      'fenyixia-backup-2026-10-13_03-00-00.tar.gz', // 29 days old -> keep
      'fenyixia-backup-2026-11-10_03-00-00.tar.gz', // 1 day old -> keep
    ];
    for (const name of seedNames) {
      fs.writeFileSync(path.join(backupDir, name), 'dummy');
      fs.writeFileSync(path.join(backupDir, `${name}.sha256`), 'dummy');
    }

    // 4. Trigger real backup while DB is open + concurrent writes/reads
    const fixedNow = new Date('2026-11-11T08:00:00Z'); // 03:00:00 America/Toronto
    const [bkpA, bkpB] = await Promise.all([
      runDatabaseBackup({
        backupDir,
        uploadsDir,
        retentionDays: 30,
        timeZone: 'America/Toronto',
        trigger: 'test-run',
        now: fixedNow,
      }),
      runDatabaseBackup({
        backupDir,
        uploadsDir,
        retentionDays: 30,
        timeZone: 'America/Toronto',
        trigger: 'test-concurrent',
        now: fixedNow,
      }),
      db.query('SELECT count(*) AS cnt FROM bills'),
    ]);

    // In-flight coalescing should return identical result for overlapping calls
    assert.equal(bkpA.filename, bkpB.filename);
    assert.equal(bkpA.filename, 'fenyixia-backup-2026-11-11_03-00-00.tar.gz');
    assert.ok(fs.existsSync(bkpA.filepath));
    assert.ok(fs.existsSync(bkpA.sha256Path));
    assert.equal(bkpA.uploadsFiles, 2);
    assert.ok(bkpA.tableCount >= 20);
    assert.equal(hasBackupForDate(backupDir, '2026-11-11'), true);

    // Check SHA256 file integrity
    const rawSha = fs.readFileSync(bkpA.sha256Path, 'utf8').trim();
    const expectedSha = crypto
      .createHash('sha256')
      .update(fs.readFileSync(bkpA.filepath))
      .digest('hex');
    assert.equal(rawSha, `${expectedSha}  ${bkpA.filename}`);

    // Check 30-day retention pruned 2026-10-10 & 2026-10-12 and kept 2026-10-13, 2026-11-10, 2026-11-11
    assert.deepEqual(bkpA.deletedOldBackups.sort(), [
      'fenyixia-backup-2026-10-10_03-00-00.tar.gz',
      'fenyixia-backup-2026-10-12_03-00-00.tar.gz',
    ]);
    assert.equal(fs.existsSync(path.join(backupDir, 'fenyixia-backup-2026-10-12_03-00-00.tar.gz.sha256')), false);
    const remaining = listBackups(backupDir).map((b) => b.filename);
    assert.deepEqual(remaining, [
      'fenyixia-backup-2026-11-11_03-00-00.tar.gz',
      'fenyixia-backup-2026-11-10_03-00-00.tar.gz',
      'fenyixia-backup-2026-10-13_03-00-00.tar.gz',
    ]);
    console.log('✓ Backup archive, SHA-256, coalescing, and 30-day retention tests passed');

    // 5. Extract archive & restore DuckDB + uploads into fresh directory and verify data
    fs.mkdirSync(restoreDir, { recursive: true });
    execFileSync('tar', ['-xzf', bkpA.filepath, '-C', restoreDir]);

    assert.equal(
      fs.readFileSync(path.join(restoreDir, 'uploads', 'receipts', 'receipt-1.jpg'), 'utf8'),
      'fake-jpg-bytes'
    );
    assert.equal(
      fs.readFileSync(path.join(restoreDir, 'uploads', 'proofs', 'proof-1.png'), 'utf8'),
      'fake-png-bytes'
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(restoreDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.duckdb_verified, true);
    assert.equal(manifest.uploads_files, 2);

    const restoredDb = new duckdb.Database(path.join(restoreDir, 'fenyixia.duckdb'), duckdb.OPEN_READONLY);
    const restoredConn = restoredDb.connect();
    const restoredBills = await new Promise<any[]>((resolve, reject) => {
      restoredConn.all('SELECT id, title, CAST(total_amount AS DOUBLE) AS total FROM bills', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    await new Promise<void>((resolve) => restoredDb.close(() => resolve()));

    assert.equal(restoredBills.length, 1);
    assert.equal(restoredBills[0].id, 'bill-backup-1');
    assert.equal(restoredBills[0].title, 'Backup Test Dinner');
    assert.equal(restoredBills[0].total, 88.5);
    console.log('✓ Full DuckDB + uploads restore verification passed');

    // 6. Safety guard: cleanupExpiredBackups keeps at least 1 newest backup even if >30 days old
    const guardDir = path.join(workDir, 'guard');
    fs.mkdirSync(guardDir, { recursive: true });
    fs.writeFileSync(path.join(guardDir, 'fenyixia-backup-2025-01-01_03-00-00.tar.gz'), 'only-one');
    const deletedGuard = cleanupExpiredBackups(guardDir, 30, '2026-11-11', 1);
    assert.deepEqual(deletedGuard, []);
    assert.equal(fs.existsSync(path.join(guardDir, 'fenyixia-backup-2025-01-01_03-00-00.tar.gz')), true);
    console.log('✓ Min-keep safety guard passed');
  } finally {
    await closeDb();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('❌ Backup tests failed:', err);
  process.exit(1);
});
