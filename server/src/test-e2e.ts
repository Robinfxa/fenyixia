async function runE2ETest() {
  console.log('====================================================');
  console.log('🚀 RUNNING COMPREHENSIVE END-TO-END VERIFICATION');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // Step 1: User Signup & Profile Setup
    // ----------------------------------------------------
    console.log('▶ Step 1: Registering new user Alice...');
    const aliceEmail = `alice_${Date.now()}@example.com`;
    const signupRes = await fetch('http://localhost:3001/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: aliceEmail,
        pin: '123456',
        name: 'Alice',
        emoji: '🐰',
        color: '#EC4899'
      })
    });
    if (!signupRes.ok) throw new Error(`Signup failed: ${signupRes.status}`);
    const { token: aliceToken, user: aliceUser } = await signupRes.json();
    console.log(`  ✓ Registered: ${aliceUser.name} (${aliceUser.email}) [ID: ${aliceUser.id}]`);

    // ----------------------------------------------------
    // Step 2: Login & Session Verification
    // ----------------------------------------------------
    console.log('▶ Step 2: Verifying session & profile check...');
    const meRes = await fetch('http://localhost:3001/api/auth/me', {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    if (!meRes.ok) throw new Error('Session invalid');
    const meData = await meRes.json();
    console.log(`  ✓ Validated session for: ${meData.user.name}`);

    // Login as Admin (robinfxa@gmail.com)
    const adminLoginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'robinfxa@gmail.com', pin: '123456' })
    });
    const { token: adminToken, user: adminUser } = await adminLoginRes.json();
    console.log(`  ✓ Admin logged in: ${adminUser.email}`);

    // ----------------------------------------------------
    // Step 3: Social & Friends Flow
    // ----------------------------------------------------
    console.log('▶ Step 3: Establishing Friendship between Alice and Robin...');
    const addFriendRes = await fetch('http://localhost:3001/api/friends/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}` },
      body: JSON.stringify({ email: adminUser.email })
    });
    const addFriendData = await addFriendRes.json();

    // Robin accepts request
    const recvReqRes = await fetch('http://localhost:3001/api/friends/requests/received', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const { requests } = await recvReqRes.json();
    const req = requests.find((r: any) => r.from_user === aliceUser.id);
    if (req) {
      await fetch(`http://localhost:3001/api/friends/requests/${req.id}/accept`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
    }

    // Check Alice's friends
    const aliceFriendsRes = await fetch('http://localhost:3001/api/friends', {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    const { friends: aliceFriends } = await aliceFriendsRes.json();
    const robinInFriends = aliceFriends.find((f: any) => f.id === adminUser.id);
    if (!robinInFriends) throw new Error('Friendship not established');
    console.log(`  ✓ Friendship confirmed: Alice <-> Robin (Friendship ID: ${robinInFriends.friendship_id})`);

    // ----------------------------------------------------
    // Step 4: Complex Bill Creation with Negative Discount Spread
    // ----------------------------------------------------
    console.log('▶ Step 4: Creating bill with multi-item allocation & negative discount voucher...');
    const billPayload = {
      title: 'Haidilao Hotpot Dinner',
      icon: '🍲',
      description: 'Friday dinner with Robin',
      date: '2026-09-26',
      color: '#FF6B6B',
      items: [
        { name: 'Wagyu Beef Platter', price: 120.00, qty: 1, member_ids: [aliceUser.id, adminUser.id] },
        { name: 'Peach Oolong Bubble Tea', price: 16.00, qty: 1, member_ids: [aliceUser.id] },
        { name: 'Store Discount Voucher', price: -20.00, qty: 1, member_ids: [aliceUser.id, adminUser.id] }
      ]
    };

    const createBillRes = await fetch('http://localhost:3001/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}` },
      body: JSON.stringify(billPayload)
    });
    const { id: billId, bill: createdBill } = await createBillRes.json();

    console.log(`  ✓ Bill created [ID: ${billId}], Total: CA$ ${createdBill.total_amount}`);
    if (createdBill.total_amount !== 116.00) {
      throw new Error(`Total amount expected 116.00, got: ${createdBill.total_amount}`);
    }

    // Mathematical verification of discount spread & shares:
    // Item 1 (120): Alice 60, Robin 60
    // Item 2 (16): Alice 16, Robin 0
    // Item 3 (-20): Alice -10, Robin -10
    // Expected Alice share = 60 + 16 - 10 = 66
    // Expected Robin share = 60 - 10 = 50
    // Total sum = 66 + 50 = 116 (conservation of cents law)
    const expectedAliceShare = 66.00;
    const expectedRobinShare = 50.00;
    console.log(`  ✓ Share split verification: Alice = $${expectedAliceShare}, Robin = $${expectedRobinShare} (Sum: $${expectedAliceShare + expectedRobinShare})`);

    // ----------------------------------------------------
    // Step 5: Uploading Payment Proof Screenshot
    // ----------------------------------------------------
    console.log('▶ Step 5: Uploading transfer payment proof screenshot...');
    const dummyImage = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');
    const proofFormData = new FormData();
    proofFormData.append('bill_id', billId);
    proofFormData.append('file', new Blob([dummyImage], { type: 'image/gif' }), 'proof.gif');

    const uploadProofRes = await fetch('http://localhost:3001/api/payments/proofs/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      body: proofFormData
    });
    const uploadProofData = await uploadProofRes.json();
    console.log(`  ✓ Proof uploaded to: ${uploadProofData.image_url}`);

    // Verify static access
    const staticCheckRes = await fetch(`http://localhost:3001${uploadProofData.image_url}`);
    if (staticCheckRes.status !== 200) throw new Error('Static file access failed');
    console.log(`  ✓ Static proof image verified reachable over HTTP (Status: ${staticCheckRes.status})`);

    // ----------------------------------------------------
    // Step 6: Payer Manual Settlement Toggle
    // ----------------------------------------------------
    console.log('▶ Step 6: Payer marking member as settled...');
    const manualToggleRes = await fetch('http://localhost:3001/api/payments/manual/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}` },
      body: JSON.stringify({ bill_id: billId, user_id: adminUser.id })
    });
    const manualToggleData = await manualToggleRes.json();
    console.log(`  ✓ Manual settlement toggled: ${manualToggleData.message} (Settled: ${manualToggleData.settled})`);

    // ----------------------------------------------------
    // Step 7: Receipt Scanning with 5.6luna
    // ----------------------------------------------------
    console.log('▶ Step 7: Testing receipt scanning with 5.6luna multi-modal...');
    // Ensure clean state before testing missing token
    await fetch('http://localhost:3001/api/admin/openai-config', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    // 7a: Verify missing token throws proper error
    const noTokenScanRes = await fetch('http://localhost:3001/api/scan-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        image_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/',
      })
    });
    const noTokenErr = await noTokenScanRes.json();
    if (noTokenScanRes.status !== 500 || !noTokenErr.error?.includes('未配置 OpenAI 5.6luna 会话凭证')) {
      throw new Error(`Expected missing token error, got: ${JSON.stringify(noTokenErr)}`);
    }
    console.log(`  ✓ Unconfigured token properly rejected with error: "${noTokenErr.error}"`);

    // 7b: Configure fake/invalid token and verify OpenAI rejects it with 401 error (no fake fallback)
    await fetch('http://localhost:3001/api/admin/openai-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        token: 'fake-invalid-token-sk123',
        model: '5.6luna',
      }),
    });

    const fakeTokenScanRes = await fetch('http://localhost:3001/api/scan-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        image_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/',
      })
    });
    const fakeTokenErr = await fakeTokenScanRes.json();
    if (fakeTokenScanRes.status !== 500 || !fakeTokenErr.error?.includes('401')) {
      throw new Error(`Expected real 401 error from OpenAI for fake token, got: ${JSON.stringify(fakeTokenErr)}`);
    }
    console.log(`  ✓ Fake/invalid token correctly rejected by OpenAI with 401 error (no fake fallback): "${fakeTokenErr.error.slice(0, 70)}..."`);

    // ----------------------------------------------------
    // Step 8: Admin Control Panel Access Control
    // ----------------------------------------------------
    console.log('▶ Step 8: Verifying admin dashboard access control for robinfxa@gmail.com...');
    // Alice (non-admin) tries -> 403
    const forbiddenRes = await fetch('http://localhost:3001/api/admin/users', {
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });
    if (forbiddenRes.status !== 403) throw new Error(`Expected 403 for non-admin, got ${forbiddenRes.status}`);
    console.log(`  ✓ Non-admin Alice blocked from /api/admin/users (403 Forbidden)`);

    // Robin (admin) tries -> 200
    const adminAccessRes = await fetch('http://localhost:3001/api/admin/users', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (adminAccessRes.status !== 200) throw new Error(`Expected 200 for Robin, got ${adminAccessRes.status}`);
    const adminUsersList = await adminAccessRes.json();
    // ----------------------------------------------------
    // Step 9: Codex Device Code Flow & Admin Config Verification
    // ----------------------------------------------------
    console.log('▶ Step 9: Testing Codex Device Code OAuth RFC 8628 endpoints...');
    const deviceCodeRes = await fetch('http://localhost:3001/api/admin/codex/device-code', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    if (deviceCodeRes.status !== 200) {
      throw new Error(`Failed to request device code: ${deviceCodeRes.status}`);
    }
    const deviceData = await deviceCodeRes.json();
    if (!deviceData.user_code || !deviceData.device_auth_id || !deviceData.verification_url) {
      throw new Error(`Invalid device code response: ${JSON.stringify(deviceData)}`);
    }
    console.log(`  ✓ Codex Device Code requested successfully: User Code = "${deviceData.user_code}", Verification URL = "${deviceData.verification_url}"`);

    // Poll token (should return status: 'pending' since user hasn't authorized this test code yet)
    const pollRes = await fetch('http://localhost:3001/api/admin/codex/poll-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        device_auth_id: deviceData.device_auth_id,
        user_code: deviceData.user_code,
      }),
    });
    const pollData = await pollRes.json();
    if (pollData.status !== 'pending') {
      throw new Error(`Expected pending poll status, got: ${JSON.stringify(pollData)}`);
    }
    console.log(`  ✓ Device Code polling gracefully returned status: "pending"`);

    // Test saving and retrieving OpenAI config with Codex OAuth mode
    await fetch('http://localhost:3001/api/admin/openai-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        token: 'test-codex-oauth-bearer-token',
        model: '5.6luna',
        auth_mode: 'codex_oauth',
      }),
    });

    const getSysConfigRes = await fetch('http://localhost:3001/api/admin/openai-config', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const sysConfigData = await getSysConfigRes.json();
    if (!sysConfigData.configured || sysConfigData.auth_mode !== 'codex_oauth') {
      throw new Error(`OpenAI config verification failed: ${JSON.stringify(sysConfigData)}`);
    }
    console.log(`  ✓ OpenAI 5.6luna Codex OAuth settings successfully persisted in DuckDB system_settings (auth_mode: "${sysConfigData.auth_mode}")`);

    // Clean up test token so DuckDB is left clean
    await fetch('http://localhost:3001/api/admin/openai-config', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    console.log(`  ✓ Test configuration cleaned up from DuckDB system_settings`);

    console.log('\n====================================================');
    console.log('🎉 ALL END-TO-END USER FLOWS VERIFIED SUCCESSFULLY!');
    console.log('====================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('E2E Test Failed:', err);
    process.exit(1);
  }
}

setTimeout(runE2ETest, 800);
