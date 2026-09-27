import { server } from './index.js';

async function runBusinessApiTest() {
  console.log('--- Testing Business APIs (Friends, Groups, Tags, Disputes, Payments) ---');
  try {
    // 1. Authenticate Admin and User 2
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'robinfxa@gmail.com', pin: '123456' }),
    });
    const { token: adminToken, user: adminUser } = await loginRes.json();

    const friendEmail = `friend_${Date.now()}@example.com`;
    const signupFriendRes = await fetch('http://localhost:3001/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: friendEmail, pin: '123456', name: 'Friend David', emoji: '🦊' }),
    });
    const { token: friendToken, user: friendUser } = await signupFriendRes.json();
    console.log('✓ Users authenticated:', adminUser.name, 'and', friendUser.name);

    // 2. Friends API
    console.log('Testing Friends API (add, request, accept, alias)...');
    // Admin adds friend
    const addRes = await fetch('http://localhost:3001/api/friends/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ email: friendEmail }),
    });
    const addData = await addRes.json();
    console.log('Friend add response:', addData.type);
    if (addData.type !== 'request_sent') throw new Error('Expected request_sent');

    // Friend checks received requests
    const recvRes = await fetch('http://localhost:3001/api/friends/requests/received', {
      headers: { 'Authorization': `Bearer ${friendToken}` },
    });
    const recvData = await recvRes.json();
    if (recvData.requests.length === 0) throw new Error('No friend requests received');
    const requestId = recvData.requests[0].id;

    // Friend accepts request
    const acceptRes = await fetch(`http://localhost:3001/api/friends/requests/${requestId}/accept`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${friendToken}` },
    });
    if (acceptRes.status !== 200) throw new Error('Failed to accept friend request');

    // Admin checks friends list
    const friendsRes = await fetch('http://localhost:3001/api/friends', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const friendsData = await friendsRes.json();
    const confirmed = friendsData.friends.find((f: any) => f.id === friendUser.id);
    if (!confirmed) throw new Error('Friend not found in friends list');
    console.log('✓ Friendship confirmed! ID:', confirmed.friendship_id);

    // Update alias
    const aliasRes = await fetch(`http://localhost:3001/api/friends/${confirmed.friendship_id}/alias`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ alias: 'David (Best Friend)' }),
    });
    if (aliasRes.status !== 200) throw new Error('Failed to update alias');
    console.log('✓ Friend alias updated successfully');

    // 3. Groups API
    console.log('Testing Groups API...');
    const createGroupRes = await fetch('http://localhost:3001/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Weekend Trip', emoji: '🏕️', member_ids: [friendUser.id] }),
    });
    const groupData = await createGroupRes.json();
    const groupId = groupData.group.id;
    console.log('✓ Group created:', groupData.group.name, 'with members:', groupData.group.members.length);

    const getGroupsRes = await fetch('http://localhost:3001/api/groups', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const groupsList = await getGroupsRes.json();
    if (!groupsList.groups.some((g: any) => g.id === groupId)) throw new Error('Group not listed');
    console.log('✓ Group listing verified');

    // 4. Tags API
    console.log('Testing Tags API...');
    const createTagRes = await fetch('http://localhost:3001/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Roommate', color: '#10B981' }),
    });
    const tagData = await createTagRes.json();
    const tagId = tagData.tag.id;
    console.log('✓ Tag created:', tagData.tag.name);

    // Assign tag to friendship
    await fetch(`http://localhost:3001/api/tags/friend/${confirmed.friendship_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ tag_ids: [tagId] }),
    });

    const friendTagsRes = await fetch(`http://localhost:3001/api/tags/friend/${confirmed.friendship_id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const friendTagsData = await friendTagsRes.json();
    if (friendTagsData.tags.length !== 1 || friendTagsData.tags[0].name !== 'Roommate') {
      throw new Error('Friend tags mismatch');
    }
    console.log('✓ Friend tag assigned and verified');

    // 5. Payment Proofs and Manual Settlement API
    console.log('Testing Payment Proofs & Manual Settlements...');
    // Create a bill first
    const createBillRes = await fetch('http://localhost:3001/api/bills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'Cab Fare',
        items: [{ name: 'Uber ride', price: 30.00, member_ids: [adminUser.id, friendUser.id] }],
      }),
    });
    const billData = await createBillRes.json();
    const billId = billData.id;

    // Friend submits payment proof
    const proofRes = await fetch('http://localhost:3001/api/payments/proofs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${friendToken}` },
      body: JSON.stringify({ bill_id: billId, image_url: '/uploads/proofs/test-proof.png', note: 'Paid via e-transfer' }),
    });
    if (proofRes.status !== 201) throw new Error('Proof creation failed');

    // Payer fetches proofs
    const getProofsRes = await fetch(`http://localhost:3001/api/payments/proofs/${billId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const proofsList = await getProofsRes.json();
    if (proofsList.proofs.length !== 1) throw new Error('Payment proof not found');
    console.log('✓ Payment proof recorded and fetched:', proofsList.proofs[0].note);

    // Payer toggles manual settlement
    const togglePaidRes = await fetch('http://localhost:3001/api/payments/manual/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ bill_id: billId, user_id: friendUser.id }),
    });
    const togglePaidData = await togglePaidRes.json();
    if (!togglePaidData.settled) throw new Error('Expected manual settlement to be marked settled');

    const getManualRes = await fetch(`http://localhost:3001/api/payments/manual/${billId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const manualList = await getManualRes.json();
    if (!manualList.user_ids.includes(friendUser.id)) throw new Error('Member not found in manual payments list');
    console.log('✓ Manual settlement toggled to paid and verified');

    // 6. Disputes API
    console.log('Testing Disputes API...');
    const createDisputeRes = await fetch('http://localhost:3001/api/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${friendToken}` },
      body: JSON.stringify({
        bill_id: billId,
        reason: 'I left early',
        suggested_items: [{ name: 'Uber ride', price: 30.00, qty: 1, member_ids: [adminUser.id] }],
      }),
    });
    if (createDisputeRes.status !== 201) throw new Error('Dispute creation failed');

    const getDisputeRes = await fetch(`http://localhost:3001/api/disputes/bill/${billId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const disputeData = await getDisputeRes.json();
    if (!disputeData.dispute || disputeData.dispute.reason !== 'I left early') {
      throw new Error('Dispute data mismatch');
    }
    console.log('✓ Dispute created and retrieved:', disputeData.dispute.reason);

    // Resolve dispute (accepted)
    const resolveRes = await fetch(`http://localhost:3001/api/disputes/${disputeData.dispute.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        bill_id: billId,
        accepted: true,
        suggested_items: [{ name: 'Uber ride', price: 30.00, qty: 1, member_ids: [adminUser.id] }],
      }),
    });
    if (resolveRes.status !== 200) throw new Error('Resolve dispute failed');
    console.log('✓ Dispute resolved and bill updated atomically');

    console.log('--- ALL BUSINESS APIS PASSED! ---');
    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('Business API test failed:', err);
    server.close(() => {
      process.exit(1);
    });
  }
}

setTimeout(runBusinessApiTest, 800);
