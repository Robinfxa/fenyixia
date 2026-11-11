import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import duckdb from 'duckdb';
import { getDbPath, runExclusive } from './index.js';

const execFileAsync = promisify(execFile);

const BACKUP_FILE_RE = /^fenyixia-backup-(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})(?:-(\d+))?\.tar\.gz$/;

export interface BackupConfig {
  backupDir: string;
  retentionDays: number;
  timeZone: string;
  scheduleHour: number;
  uploadsDir: string;
}

export interface BackupOptions {
  backupDir?: string;
  retentionDays?: number;
  timeZone?: string;
  uploadsDir?: string;
  trigger?: string;
  now?: Date;
}

export interface BackupSummary {
  filename: string;
  filepath: string;
  sha256Path: string;
  sha256: string;
  sizeBytes: number;
  dbSizeBytes: number;
  uploadsBytes: number;
  uploadsFiles: number;
  tableCount: number;
  dateStr: string;
  localTime: string;
  timeZone: string;
  trigger: string;
  deletedOldBackups: string[];
  durationMs: number;
}

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  dateStr: string;
  hasSha256: boolean;
}

export function getBackupConfig(overrides?: BackupOptions): BackupConfig {
  const backupDir = overrides?.backupDir
    ? path.resolve(overrides.backupDir)
    : process.env.BACKUP_DIR
      ? path.resolve(process.env.BACKUP_DIR)
      : path.join(os.homedir(), 'backups', 'fenyixia');

  const rawRetention = overrides?.retentionDays ?? Number(process.env.BACKUP_RETENTION_DAYS);
  const retentionDays = Number.isFinite(rawRetention) && rawRetention >= 1 ? Math.floor(rawRetention) : 30;

  const timeZone = overrides?.timeZone || process.env.BACKUP_TZ || 'America/Toronto';

  const rawHour = process.env.BACKUP_HOUR;
  const parsedHour = rawHour !== undefined && rawHour !== '' ? Number(rawHour) : 3;
  const scheduleHour = Number.isFinite(parsedHour)
    ? Math.min(23, Math.max(0, Math.floor(parsedHour)))
    : 3;

  const uploadsDir = overrides?.uploadsDir
    ? path.resolve(overrides.uploadsDir)
    : process.env.UPLOADS_DIR
      ? path.resolve(process.env.UPLOADS_DIR)
      : path.resolve(process.cwd(), 'uploads');

  return { backupDir, retentionDays, timeZone, scheduleHour, uploadsDir };
}

export function getZonedTimeParts(date: Date = new Date(), timeZone = 'America/Toronto') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  const hourStr = String(hour).padStart(2, '0');
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const stamp = `${dateStr}_${hourStr}-${map.minute}-${map.second}`;

  return {
    dateStr,
    stamp,
    hour,
    minute,
    localIsoLike: `${dateStr} ${hourStr}:${map.minute}:${map.second}`,
  };
}

function getDirStats(dirPath: string): { files: number; bytes: number } {
  if (!fs.existsSync(dirPath)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(full).size;
      }
    }
  }
  return { files, bytes };
}

async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function verifyDuckDbSnapshot(dbFilePath: string): Promise<number> {
  const bkpDb = await new Promise<duckdb.Database>((resolve, reject) => {
    const instance = new duckdb.Database(dbFilePath, duckdb.OPEN_READONLY, (err) => {
      if (err) return reject(err);
      resolve(instance);
    });
  });

  try {
    const conn = bkpDb.connect();
    const row = await new Promise<{ table_count: number | bigint }>((resolve, reject) => {
      conn.all(
        "SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'main'",
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve(rows[0] || { table_count: 0 });
        }
      );
    });
    return Number(row.table_count);
  } finally {
    await new Promise<void>((resolve) => {
      bkpDb.close(() => resolve());
    });
  }
}

export function hasBackupForDate(backupDir: string, dateStr: string): boolean {
  if (!fs.existsSync(backupDir)) return false;
  const prefix = `fenyixia-backup-${dateStr}_`;
  return fs.readdirSync(backupDir).some((name) => name.startsWith(prefix) && name.endsWith('.tar.gz'));
}

export function listBackups(backupDir = getBackupConfig().backupDir): BackupEntry[] {
  if (!fs.existsSync(backupDir)) return [];
  const entries: BackupEntry[] = [];
  for (const filename of fs.readdirSync(backupDir)) {
    const match = filename.match(BACKUP_FILE_RE);
    if (!match) continue;
    const full = path.join(backupDir, filename);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    entries.push({
      filename,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      dateStr: match[1],
      hasSha256: fs.existsSync(`${full}.sha256`),
    });
  }
  return entries.sort((a, b) => b.filename.localeCompare(a.filename));
}

export function cleanupExpiredBackups(
  backupDir: string,
  retentionDays: number,
  todayDateStr: string,
  minKeep = 1
): string[] {
  const backups = listBackups(backupDir);
  if (backups.length <= minKeep) return [];

  const [ty, tm, td] = todayDateStr.split('-').map(Number);
  const todayEpochDays = Math.floor(Date.UTC(ty, tm - 1, td) / 86_400_000);
  const deleted: string[] = [];

  backups.forEach((entry, index) => {
    if (index < minKeep) return;
    const [fy, fm, fd] = entry.dateStr.split('-').map(Number);
    const fileEpochDays = Math.floor(Date.UTC(fy, fm - 1, fd) / 86_400_000);
    const ageDays = todayEpochDays - fileEpochDays;

    if (ageDays >= retentionDays) {
      const archivePath = path.join(backupDir, entry.filename);
      const shaPath = `${archivePath}.sha256`;
      try {
        if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
        if (fs.existsSync(shaPath)) fs.unlinkSync(shaPath);
        deleted.push(entry.filename);
      } catch (err) {
        console.warn(`[Backup] Failed to remove expired backup ${entry.filename}:`, err);
      }
    }
  });

  return deleted;
}

function cleanupStaleTempArtifacts(backupDir: string) {
  const cutoff = Date.now() - 60 * 60 * 1000;
  try {
    for (const name of fs.readdirSync(backupDir)) {
      if (!name.startsWith('.tmp-')) continue;
      const full = path.join(backupDir, name);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    }
  } catch {}
}

let inFlightBackup: Promise<BackupSummary> | null = null;

export async function runDatabaseBackup(options?: BackupOptions): Promise<BackupSummary> {
  if (inFlightBackup) {
    return inFlightBackup;
  }

  inFlightBackup = executeBackup(options).finally(() => {
    inFlightBackup = null;
  });
  return inFlightBackup;
}

async function executeBackup(options?: BackupOptions): Promise<BackupSummary> {
  const startMs = Date.now();
  const cfg = getBackupConfig(options);
  const now = options?.now || new Date();
  const zoned = getZonedTimeParts(now, cfg.timeZone);
  const trigger = options?.trigger || 'manual';

  fs.mkdirSync(cfg.backupDir, { recursive: true, mode: 0o700 });
  cleanupStaleTempArtifacts(cfg.backupDir);

  let baseName = `fenyixia-backup-${zoned.stamp}`;
  let suffix = 1;
  while (fs.existsSync(path.join(cfg.backupDir, `${baseName}.tar.gz`))) {
    baseName = `fenyixia-backup-${zoned.stamp}-${suffix++}`;
  }

  const archiveName = `${baseName}.tar.gz`;
  const finalArchivePath = path.join(cfg.backupDir, archiveName);
  const finalShaPath = `${finalArchivePath}.sha256`;

  const stagingDir = path.join(cfg.backupDir, `.tmp-${baseName}-${crypto.randomUUID().slice(0, 8)}`);
  const tmpArchivePath = path.join(cfg.backupDir, `.tmp-${archiveName}`);
  const tmpShaPath = path.join(cfg.backupDir, `.tmp-${archiveName}.sha256`);

  fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });

  try {
    const stagingDbPath = path.join(stagingDir, 'fenyixia.duckdb');
    const escapedStagingDb = stagingDbPath.replace(/'/g, "''");
    const alias = `bkp_${Date.now()}`;

    // 1. Acquire DB write mutex, flush WAL, and create consistent standalone DuckDB copy
    await runExclusive(async (ctx) => {
      const dbRow = await ctx.queryOne<{ db: string }>('SELECT current_database() AS db');
      const mainCatalog = dbRow?.db || 'memory';

      await ctx.run('CHECKPOINT;');
      let attached = false;
      try {
        await ctx.run(`ATTACH '${escapedStagingDb}' AS "${alias}";`);
        attached = true;
        await ctx.run(`COPY FROM DATABASE "${mainCatalog}" TO "${alias}";`);
        await ctx.run(`CHECKPOINT "${alias}";`);
      } finally {
        if (attached) {
          try {
            await ctx.run(`DETACH "${alias}";`);
          } catch (detachErr) {
            console.warn('[Backup] DETACH warning:', detachErr);
          }
        }
      }
    });

    // 2. Verify snapshot readability in an isolated read-only DuckDB instance
    const tableCount = await verifyDuckDbSnapshot(stagingDbPath);
    const dbSizeBytes = fs.statSync(stagingDbPath).size;

    // 3. Stage uploads directory safely
    const stagedUploadsDir = path.join(stagingDir, 'uploads');
    if (fs.existsSync(cfg.uploadsDir)) {
      fs.cpSync(cfg.uploadsDir, stagedUploadsDir, { recursive: true });
    } else {
      fs.mkdirSync(stagedUploadsDir, { recursive: true });
    }
    const uploadsStats = getDirStats(stagedUploadsDir);

    // 4. Write backup manifest
    const manifest = {
      app: 'fenyixia',
      created_at_utc: now.toISOString(),
      local_time: zoned.localIsoLike,
      timezone: cfg.timeZone,
      trigger,
      source_db_path: getDbPath() || null,
      db_size_bytes: dbSizeBytes,
      table_count: tableCount,
      uploads_files: uploadsStats.files,
      uploads_bytes: uploadsStats.bytes,
      duckdb_verified: true,
    };
    fs.writeFileSync(path.join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });

    // 5. Pack tar.gz atomically
    await execFileAsync('tar', ['-czf', tmpArchivePath, '-C', stagingDir, '.'], {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });

    const sha256 = await computeFileSha256(tmpArchivePath);
    fs.writeFileSync(tmpShaPath, `${sha256}  ${archiveName}\n`, { mode: 0o600 });

    fs.chmodSync(tmpArchivePath, 0o600);
    fs.renameSync(tmpArchivePath, finalArchivePath);
    fs.renameSync(tmpShaPath, finalShaPath);

    const sizeBytes = fs.statSync(finalArchivePath).size;
    const deletedOldBackups = cleanupExpiredBackups(cfg.backupDir, cfg.retentionDays, zoned.dateStr);
    const durationMs = Date.now() - startMs;

    console.log(
      `[Backup] Completed (${trigger}): ${finalArchivePath} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB, ${uploadsStats.files} upload files, ${durationMs}ms)` +
        (deletedOldBackups.length > 0 ? `, pruned ${deletedOldBackups.length} expired` : '')
    );

    return {
      filename: archiveName,
      filepath: finalArchivePath,
      sha256Path: finalShaPath,
      sha256,
      sizeBytes,
      dbSizeBytes,
      uploadsBytes: uploadsStats.bytes,
      uploadsFiles: uploadsStats.files,
      tableCount,
      dateStr: zoned.dateStr,
      localTime: zoned.localIsoLike,
      timeZone: cfg.timeZone,
      trigger,
      deletedOldBackups,
      durationMs,
    };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(tmpArchivePath, { force: true });
    fs.rmSync(tmpShaPath, { force: true });
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;

/**
 * In-process daily backup fallback scheduler.
 * Primary OS systemd timer triggers at HH:00 in BACKUP_TZ; if no backup for today exists
 * by HH:05 (e.g. non-systemd environments), this scheduler automatically runs it.
 */
export function startBackupScheduler(): void {
  if (process.env.BACKUP_ENABLED === 'false') {
    console.log('[Backup] In-process backup scheduler disabled via BACKUP_ENABLED=false');
    return;
  }
  if (schedulerTimer) return;

  const cfg = getBackupConfig();
  console.log(
    `[Backup] Scheduler active: daily at ${String(cfg.scheduleHour).padStart(2, '0')}:00 ${cfg.timeZone}, dir=${cfg.backupDir}, retain=${cfg.retentionDays}d`
  );

  const tick = async () => {
    try {
      const currentCfg = getBackupConfig();
      const parts = getZonedTimeParts(new Date(), currentCfg.timeZone);
      if (parts.hour === currentCfg.scheduleHour && parts.minute >= 5) {
        if (!hasBackupForDate(currentCfg.backupDir, parts.dateStr)) {
          await runDatabaseBackup({ trigger: 'scheduled-fallback' });
        }
      }
    } catch (err) {
      console.error('[Backup] Scheduled fallback failed:', err);
    }
  };

  schedulerTimer = setInterval(() => {
    void tick();
  }, 60_000);
  schedulerTimer.unref();
}

export function stopBackupScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
