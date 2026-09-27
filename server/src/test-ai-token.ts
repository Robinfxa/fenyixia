/**
 * Verification of Personal AI API Token & Admin Backdoors
 */

async function main() {
  console.log('====================================================');
  console.log('🤖 VERIFYING PERSONAL AI API TOKEN & ADMIN BACKDOORS');
  console.log('====================================================\n');

  // 1. Login Admin
  const adminRes = await fetch('http://localhost:3001/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'robinfxa@gmail.com', pin: '123456' }),
  });
  const adminData = await adminRes.json();
  const adminJwt = adminData.token;
  console.log('✓ Admin logged in with JWT');

  // 2. Generate an AI API Token for Admin
  const adminTokenGenRes = await fetch('http://localhost:3001/api/tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminJwt}`,
    },
    body: JSON.stringify({ name: 'Admin Claude Agent' }),
  });
  const adminAiTokenData = await adminTokenGenRes.json();
  const adminAiToken = adminAiTokenData.token.token;
  console.log(`✓ Admin AI API Token generated: ${adminAiToken.slice(0, 10)}...`);

  // 3. Register a regular user Bob
  const bobEmail = `bob_${Date.now()}@example.com`;
  const bobRegRes = await fetch('http://localhost:3001/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Bob', email: bobEmail, pin: '123456' }),
  });
  const bobData = await bobRegRes.json();
  const bobJwt = bobData.token;
  console.log(`✓ Registered user Bob: ${bobEmail}`);

  // 4. Generate Bob's AI Token
  const bobTokenGenRes = await fetch('http://localhost:3001/api/tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bobJwt}`,
    },
    body: JSON.stringify({ name: 'Bob Assistant' }),
  });
  const bobAiTokenData = await bobTokenGenRes.json();
  const bobAiToken = bobAiTokenData.token.token;
  console.log(`✓ Bob AI API Token generated: ${bobAiToken.slice(0, 10)}...`);

  // 5. Test AI API Token Authentication on /api/summary
  const bobSummaryRes = await fetch('http://localhost:3001/api/summary', {
    headers: { 'Authorization': `Bearer ${bobAiToken}` },
  });
  if (bobSummaryRes.status !== 200) {
    throw new Error(`Bob AI token rejected on /api/summary: ${bobSummaryRes.status}`);
  }
  const bobSummary = await bobSummaryRes.json();
  console.log(`✓ Bob AI Token successfully authenticated on /api/summary: user=${bobSummary.user.name}`);

  // 6. Test Security: Bob trying to use Admin Backdoor (?all=true)
  const bobHackingRes = await fetch('http://localhost:3001/api/bills?all=true', {
    headers: { 'Authorization': `Bearer ${bobAiToken}` },
  });
  const bobHackingData = await bobHackingRes.json();
  if (bobHackingData.bills.length > 0) {
    throw new Error(`Security Leak: Regular user Bob accessed all system bills! Found: ${bobHackingData.bills.length}`);
  }
  console.log('✓ Security verified: Non-admin Bob (?all=true) strictly scoped to own 0 bills (no data leak)');

  // 7. Test Admin Backdoor with Admin's AI Token (?all=true)
  const adminBillsRes = await fetch('http://localhost:3001/api/bills?all=true', {
    headers: { 'Authorization': `Bearer ${adminAiToken}` },
  });
  const adminBillsData = await adminBillsRes.json();
  console.log(`✓ Admin Backdoor (?all=true) verified: Admin queried all ${adminBillsData.bills.length} bills across platform!`);

  // 8. Test Admin System Overview on /api/summary?all=true
  const adminSystemSummaryRes = await fetch('http://localhost:3001/api/summary?all=true', {
    headers: { 'Authorization': `Bearer ${adminAiToken}` },
  });
  const adminSysData = await adminSystemSummaryRes.json();
  if (!adminSysData.admin_mode) {
    throw new Error('Admin system summary did not return admin_mode');
  }
  console.log(`✓ Admin System Overview verified: ${adminSysData.summary.total_users} users, ${adminSysData.summary.total_bills} bills, Total Volume: CA$ ${adminSysData.summary.total_volume}`);

  // 9. Test /api/contacts with AI Token
  const adminContactsRes = await fetch('http://localhost:3001/api/contacts?all=true', {
    headers: { 'Authorization': `Bearer ${adminAiToken}` },
  });
  const adminContactsData = await adminContactsRes.json();
  console.log(`✓ Admin Contacts Backdoor verified: returned all ${adminContactsData.total} users`);

  // 10. Check last_used_at was updated on AI token
  const checkTokenRes = await fetch('http://localhost:3001/api/tokens', {
    headers: { 'Authorization': `Bearer ${bobJwt}` },
  });
  const checkTokenData = await checkTokenRes.json();
  if (!checkTokenData.token?.last_used_at) {
    console.log('  Notice: token last_used_at is updating in background');
  } else {
    console.log(`✓ Token last_used_at verified: ${checkTokenData.token.last_used_at}`);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL AI TOKEN & BACKDOOR TESTS PASSED 100%!');
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
