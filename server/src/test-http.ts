import { server } from './index.js';

async function testHttp() {
  console.log('Testing HTTP server...');
  try {
    const res = await fetch('http://localhost:3001/health');
    const data = await res.json();
    console.log('Response status:', res.status);
    console.log('Response body:', data);
    if (res.status === 200 && data.status === 'ok') {
      console.log('HTTP Server Test PASSED!');
      server.close(() => {
        process.exit(0);
      });
    } else {
      console.error('HTTP Server Test FAILED - unexpected response');
      process.exit(1);
    }
  } catch (err) {
    console.error('HTTP Server Test FAILED with error:', err);
    process.exit(1);
  }
}

// Give server 500ms to bind
setTimeout(testHttp, 500);
