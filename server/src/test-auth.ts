import { server } from './index.js';

async function runAuthTest() {
  console.log('--- Testing Auth Routes & JWT Middleware ---');
  try {
    // 1. Test /api/auth/me without token -> must be 401
    console.log('1. Testing /api/auth/me without token (expecting 401)...');
    const unauthRes = await fetch('http://localhost:3001/api/auth/me');
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got: ${unauthRes.status}`);
    }
    console.log('✓ 401 Unauthorized correctly enforced without token');

    // 2. Test Signup
    console.log('2. Testing /api/auth/signup...');
    const testEmail = `test_${Date.now()}@example.com`;
    const signupRes = await fetch('http://localhost:3001/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        pin: '654321',
        name: 'Tester Bob',
        emoji: '🦁',
        color: '#10B981'
      })
    });

    if (signupRes.status !== 200) {
      throw new Error(`Signup failed: ${signupRes.status} ${await signupRes.text()}`);
    }

    const signupData = await signupRes.json();
    console.log('Signup result:', signupData.user);
    if (!signupData.token || signupData.user.email !== testEmail) {
      throw new Error('Invalid signup response structure');
    }
    const token = signupData.token;
    console.log('✓ Signup successful, JWT token issued');

    // 3. Test /api/auth/me with valid Bearer token
    console.log('3. Testing /api/auth/me with Bearer token...');
    const meRes = await fetch('http://localhost:3001/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (meRes.status !== 200) {
      throw new Error(`Auth/me failed: ${meRes.status}`);
    }
    const meData = await meRes.json();
    if (meData.user.name !== 'Tester Bob') {
      throw new Error('User name mismatch in /api/auth/me');
    }
    console.log('✓ Bearer token verified, user info:', meData.user.name);

    // 4. Test Login with wrong PIN -> expecting 401
    console.log('4. Testing login with wrong PIN...');
    const wrongLoginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, pin: '000000' })
    });
    if (wrongLoginRes.status !== 401) {
      throw new Error(`Expected 401 for wrong PIN, got: ${wrongLoginRes.status}`);
    }
    console.log('✓ Invalid PIN correctly rejected with 401');

    // 5. Test Login with correct PIN -> expecting 200
    console.log('5. Testing login with correct PIN...');
    const correctLoginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, pin: '654321' })
    });
    if (correctLoginRes.status !== 200) {
      throw new Error(`Login failed with correct PIN: ${correctLoginRes.status}`);
    }
    console.log('✓ Correct PIN authenticated successfully');

    // 6. Test Admin login with robinfxa@gmail.com and default pin 123456
    console.log('6. Testing admin login (robinfxa@gmail.com)...');
    const adminLoginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'robinfxa@gmail.com', pin: '123456' })
    });
    if (adminLoginRes.status !== 200) {
      throw new Error(`Admin login failed: ${adminLoginRes.status}`);
    }
    console.log('✓ Admin login successful');

    console.log('--- ALL AUTH TESTS PASSED! ---');
    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('Auth test failed:', err);
    server.close(() => {
      process.exit(1);
    });
  }
}

setTimeout(runAuthTest, 800);
