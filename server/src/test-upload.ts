import { server } from './index.js';
import fs from 'node:fs';
import path from 'node:path';

async function runUploadTest() {
  console.log('--- Testing File Upload & Static Serving ---');
  try {
    // 1. Prepare dummy receipt image
    const dummyImageBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
    ]);

    // Test /api/upload/receipt
    const receiptBlob = new Blob([dummyImageBytes], { type: 'image/png' });
    const receiptFormData = new FormData();
    receiptFormData.append('file', receiptBlob, 'test-receipt.png');

    console.log('POSTing to /api/upload/receipt...');
    const uploadRes = await fetch('http://localhost:3001/api/upload/receipt', {
      method: 'POST',
      body: receiptFormData,
    });

    if (!uploadRes.ok) {
      throw new Error(`Upload failed with status: ${uploadRes.status} ${await uploadRes.text()}`);
    }

    const uploadData = await uploadRes.json();
    console.log('Upload response:', uploadData);
    if (!uploadData.url || !uploadData.url.startsWith('/uploads/receipts/')) {
      throw new Error('Invalid URL returned: ' + uploadData.url);
    }

    // 2. Fetch the uploaded file back via static HTTP route
    console.log(`GETting uploaded static file from http://localhost:3001${uploadData.url}...`);
    const staticRes = await fetch(`http://localhost:3001${uploadData.url}`);
    if (staticRes.status !== 200) {
      throw new Error(`Failed to fetch static file: status ${staticRes.status}`);
    }

    const fetchedBytes = Buffer.from(await staticRes.arrayBuffer());
    if (fetchedBytes.length !== dummyImageBytes.length) {
      throw new Error(`Byte length mismatch: expected ${dummyImageBytes.length}, got ${fetchedBytes.length}`);
    }
    console.log(`✓ Receipt upload & static serving verified! (${fetchedBytes.length} bytes)`);

    // 3. Test /api/upload/proof
    const proofFormData = new FormData();
    proofFormData.append('file', receiptBlob, 'test-proof.png');
    const proofRes = await fetch('http://localhost:3001/api/upload/proof', {
      method: 'POST',
      body: proofFormData,
    });
    const proofData = await proofRes.json();
    if (!proofData.url || !proofData.url.startsWith('/uploads/proofs/')) {
      throw new Error('Invalid proof URL returned: ' + proofData.url);
    }

    const proofStaticRes = await fetch(`http://localhost:3001${proofData.url}`);
    if (proofStaticRes.status !== 200) {
      throw new Error(`Failed to fetch static proof: status ${proofStaticRes.status}`);
    }
    console.log(`✓ Proof upload & static serving verified!`);

    console.log('--- ALL UPLOAD TESTS PASSED! ---');
    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('Upload test failed:', err);
    server.close(() => {
      process.exit(1);
    });
  }
}

// Wait for server to bind
setTimeout(runUploadTest, 800);
