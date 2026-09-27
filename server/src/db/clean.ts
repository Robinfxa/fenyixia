import { initDb, db, closeDb } from './index.js';

async function main() {
  await initDb();
  console.log('Cleaning all test data from database...');
  await db.run("DELETE FROM users WHERE email != 'robinfxa@gmail.com'");
  await db.run('DELETE FROM bills');
  await db.run('DELETE FROM bill_items');
  await db.run('DELETE FROM bill_item_members');
  await db.run('DELETE FROM friendships');
  await db.run('DELETE FROM friend_requests');
  await db.run('DELETE FROM invitations');
  await db.run('DELETE FROM groups');
  await db.run('DELETE FROM group_members');
  await db.run('DELETE FROM user_tags');
  await db.run('DELETE FROM friend_tags');
  await db.run('DELETE FROM payment_proofs');
  await db.run('DELETE FROM manual_payments');
  await db.run('DELETE FROM bill_disputes');
  await db.run('DELETE FROM bill_reactions');
  await db.run('DELETE FROM receipt_scans');
  await db.run('DELETE FROM api_tokens');
  await db.run('DELETE FROM token_usage');
  await db.run('CHECKPOINT;');
  await db.run('VACUUM;');
  console.log('✓ Database cleaned and vacuumed! Retained clean admin account.');
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('Clean failed:', err);
  process.exit(1);
});

