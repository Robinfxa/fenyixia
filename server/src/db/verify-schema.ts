import { initDb, db, getConn } from './index.js';

async function verify() {
  console.log('--- Starting DuckDB Schema & Concurrency Verification ---');
  await initDb(':memory:');

  // 1. Check all tables exist
  const tables = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name`
  );
  console.log(`Found ${tables.length} tables in DuckDB:`, tables.map(t => t.table_name));

  const requiredTables = [
    'users', 'bills', 'bill_items', 'bill_item_members',
    'friendships', 'friend_requests', 'invitations',
    'groups', 'group_members', 'user_tags', 'friend_tags',
    'payment_proofs', 'manual_payments', 'bill_disputes',
    'bill_reactions', 'receipt_scans', 'api_tokens', 'token_usage'
  ];

  for (const req of requiredTables) {
    if (!tables.some(t => t.table_name === req)) {
      throw new Error(`Missing required table: ${req}`);
    }
  }
  console.log('✓ All 18 tables verified present!');

  // 2. Check admin user
  const admin = await db.queryOne('SELECT * FROM users WHERE email = ?', 'robinfxa@gmail.com');
  if (!admin || admin.email !== 'robinfxa@gmail.com') {
    throw new Error('Admin user was not properly seeded');
  }
  console.log('✓ Admin user verified:', admin.name, `(${admin.email})`);

  // 3. Test ACID Transaction with multiple related records
  console.log('Testing atomic bill creation transaction...');
  const testBillId = 'bill-test-001';
  const testItemId = 'item-test-001';
  const testUserId = admin.id;

  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO bills (id, title, total_amount, date, payer_id) VALUES (?, ?, ?, ?, ?)`,
      testBillId, 'Dinner at Richmond Hill', 88.50, '2026-09-26', testUserId
    );
    await tx.run(
      `INSERT INTO bill_items (id, bill_id, name, price, qty, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      testItemId, testBillId, 'Steak', 88.50, 1, 0
    );
    await tx.run(
      `INSERT INTO bill_item_members (item_id, user_id) VALUES (?, ?)`,
      testItemId, testUserId
    );
  });

  const bill = await db.queryOne('SELECT * FROM bills WHERE id = ?', testBillId);
  const items = await db.query('SELECT * FROM bill_items WHERE bill_id = ?', testBillId);
  const members = await db.query('SELECT * FROM bill_item_members WHERE item_id = ?', testItemId);
  if (!bill || items.length !== 1 || members.length !== 1) {
    throw new Error('Transaction data not persisted properly');
  }
  console.log('✓ Atomic bill insertion successful!');

  // 4. Test Transaction Rollback
  console.log('Testing transaction rollback on error...');
  let rolledBack = false;
  try {
    await db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO bills (id, title, total_amount, date, payer_id) VALUES (?, ?, ?, ?, ?)`,
        'bill-fail-001', 'Should Fail', 10.00, '2026-09-26', testUserId
      );
      // Simulate an error mid-transaction
      throw new Error('Simulated failure during item creation');
    });
  } catch (err: any) {
    if (err.message === 'Simulated failure during item creation') {
      rolledBack = true;
    } else {
      throw err;
    }
  }

  const failedBill = await db.queryOne('SELECT * FROM bills WHERE id = ?', 'bill-fail-001');
  if (failedBill !== null || !rolledBack) {
    throw new Error('Transaction was NOT rolled back, orphan record found!');
  }
  console.log('✓ Transaction rollback verified: zero orphaned records created!');

  // 5. Test Concurrent Writes serialization through AsyncMutex
  console.log('Testing 10 concurrent writes with AsyncMutex...');
  const concurrentWrites = Array.from({ length: 10 }, (_, i) => {
    return db.run(
      `INSERT INTO users (id, name, email) VALUES (?, ?, ?)`,
      `user-concurrent-${i}`, `User ${i}`, `user${i}@test.com`
    );
  });

  await Promise.all(concurrentWrites);
  const concurrentUsers = await db.query('SELECT COUNT(*) as count FROM users WHERE email LIKE ?', '%@test.com');
  console.log(`✓ 10 concurrent writes completed with no lock conflicts! Count:`, concurrentUsers[0].count);

  console.log('--- ALL DUCKDB SCHEMA AND TRANSACTION TESTS PASSED! ---');
  process.exit(0);
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
