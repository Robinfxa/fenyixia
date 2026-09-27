import { server } from './index.js';

async function runBillsTest() {
  console.log('--- Testing Bills CRUD & Concurrent Transactions ---');
  try {
    // 1. Login as Admin
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'robinfxa@gmail.com', pin: '123456' }),
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    const adminUser = loginData.user;
    console.log('✓ Admin authenticated:', adminUser.email);

    // 2. Create another user to be a bill member
    const memberSignupRes = await fetch('http://localhost:3001/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `member_${Date.now()}@example.com`,
        pin: '123456',
        name: 'Member Charlie',
        emoji: '🐼'
      })
    });
    const memberData = await memberSignupRes.json();
    const memberUser = memberData.user;
    console.log('✓ Second member created:', memberUser.name);

    // 3. Create Bill with multiple items (including negative discount)
    console.log('Creating atomic bill with items & discount...');
    const createBillRes = await fetch('http://localhost:3001/api/bills', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Hotpot Party',
        icon: '🍲',
        description: 'Friday dinner with Charlie',
        date: '2026-09-26',
        items: [
          {
            name: 'Beef Hotpot Combo',
            price: 70.00,
            qty: 1,
            member_ids: [adminUser.id, memberUser.id]
          },
          {
            name: 'Store Discount Voucher',
            price: -10.00,
            qty: 1,
            member_ids: [adminUser.id, memberUser.id]
          }
        ]
      })
    });

    if (createBillRes.status !== 201) {
      throw new Error(`Failed to create bill: ${createBillRes.status} ${await createBillRes.text()}`);
    }

    const createdBillData = await createBillRes.json();
    const billId = createdBillData.id;
    console.log('✓ Bill created with ID:', billId, 'Total:', createdBillData.bill.total_amount);
    if (createdBillData.bill.total_amount !== 60.00) {
      throw new Error(`Expected total 60.00, got: ${createdBillData.bill.total_amount}`);
    }

    // 4. Fetch My Bills
    console.log('Fetching my bills...');
    const listRes = await fetch('http://localhost:3001/api/bills', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const listData = await listRes.json();
    const found = listData.bills.find((b: any) => b.id === billId);
    if (!found || found.items.length !== 2) {
      throw new Error('Created bill not found in /api/bills or item count mismatch');
    }
    console.log('✓ Bill found in list with', found.items.length, 'items');
    console.log('  Item 1 members:', found.items[0].members.map((m: any) => m.user.name));

    // 5. Update Bill
    console.log('Updating bill items...');
    const updateRes = await fetch(`http://localhost:3001/api/bills/${billId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Hotpot Party (Updated)',
        items: [
          {
            name: 'Beef Hotpot Combo',
            price: 80.00,
            qty: 1,
            member_ids: [adminUser.id, memberUser.id]
          }
        ]
      })
    });
    if (updateRes.status !== 200) {
      throw new Error(`Update bill failed: ${updateRes.status}`);
    }
    const updateData = await updateRes.json();
    if (updateData.bill.total_amount !== 80.00 || updateData.bill.items.length !== 1) {
      throw new Error('Update did not reflect correct items and total');
    }
    console.log('✓ Bill updated successfully');

    // 6. Toggle Settled
    console.log('Toggling settled status...');
    const settleRes = await fetch(`http://localhost:3001/api/bills/${billId}/settled`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ settled: true })
    });
    const settleData = await settleRes.json();
    if (!settleData.settled) {
      throw new Error('Failed to toggle settled');
    }
    console.log('✓ Settled flag updated to true');

    // 7. Concurrent writes test: 5 concurrent bills
    console.log('Testing 5 concurrent bill creations with mutex serialization...');
    const concurrentPromises = Array.from({ length: 5 }, (_, i) => {
      return fetch('http://localhost:3001/api/bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: `Concurrent Bill ${i}`,
          items: [{ name: `Item ${i}`, price: 10 + i, member_ids: [adminUser.id] }]
        })
      });
    });

    const concurrentResults = await Promise.all(concurrentPromises);
    for (const res of concurrentResults) {
      if (res.status !== 201) {
        throw new Error(`Concurrent bill creation failed with status: ${res.status}`);
      }
    }
    console.log('✓ All 5 concurrent bill creation transactions succeeded!');

    // 8. Delete Bill
    console.log('Deleting test bill...');
    const deleteRes = await fetch(`http://localhost:3001/api/bills/${billId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (deleteRes.status !== 200) {
      throw new Error(`Failed to delete bill: ${deleteRes.status}`);
    }
    console.log('✓ Bill deleted cleanly');

    console.log('--- ALL BILLS CRUD & CONCURRENCY TESTS PASSED! ---');
    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('Bills test failed:', err);
    server.close(() => {
      process.exit(1);
    });
  }
}

setTimeout(runBillsTest, 800);
