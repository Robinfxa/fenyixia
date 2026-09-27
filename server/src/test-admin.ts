import { server } from './index.js';

async function runAdminTest() {
  console.log('--- Testing Admin Permissions & Robin Access ---');
  try {
    // 1. Regular user signup and attempt to access /api/admin/users
    const regularRes = await fetch('http://localhost:3001/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `regular_${Date.now()}@test.com`, pin: '123456', name: 'Regular Guy' }),
    });
    const { token: regularToken } = await regularRes.json();

    const forbidRes = await fetch('http://localhost:3001/api/admin/users', {
      headers: { 'Authorization': `Bearer ${regularToken}` },
    });
    console.log('Regular user status code:', forbidRes.status);
    if (forbidRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for non-admin, got: ${forbidRes.status}`);
    }
    console.log('✓ Non-admin successfully blocked with 403 Forbidden');

    // 2. Admin user robinfxa@gmail.com accesses /api/admin/users
    const adminLoginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'robinfxa@gmail.com', pin: '123456' }),
    });
    const { token: adminToken } = await adminLoginRes.json();

    const allowRes = await fetch('http://localhost:3001/api/admin/users', {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    console.log('Admin user status code:', allowRes.status);
    if (allowRes.status !== 200) {
      throw new Error(`Expected 200 OK for robinfxa@gmail.com, got: ${allowRes.status}`);
    }
    const adminData = await allowRes.json();
    console.log(`✓ Admin access granted to robinfxa@gmail.com! Found ${adminData.users.length} users.`);

    console.log('--- ALL ADMIN PERMISSION TESTS PASSED! ---');
    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('Admin test failed:', err);
    server.close(() => {
      process.exit(1);
    });
  }
}

setTimeout(runAdminTest, 800);
