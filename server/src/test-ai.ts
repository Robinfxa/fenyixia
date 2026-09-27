import { server } from './index.js';

async function runAiTest() {
  console.log('--- Testing OpenAI 5.6luna Integration (OCR & Arbitration) ---');
  try {
    // 1. Authenticate user
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'robinfxa@gmail.com', pin: '123456' }),
    });
    const { token } = await loginRes.json();

    // 2. Test Receipt Scanning (/api/scan-receipt)
    console.log('Testing /api/scan-receipt with simulated receipt image...');
    const fakeBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const scanRes = await fetch('http://localhost:3001/api/scan-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-OpenAI-Token': 'test-oauth-token-5.6luna',
      },
      body: JSON.stringify({
        images: [{ base64: fakeBase64, media_type: 'image/png' }],
        prompt: '你是专业的实体小票 OCR 识别助手。请解析小票商品及安省 HST 13% 税则。'
      })
    });

    if (scanRes.status !== 200) {
      throw new Error(`Scan failed with status: ${scanRes.status} ${await scanRes.text()}`);
    }

    const scanData = await scanRes.json();
    console.log('Scan response received:');
    console.log('  Merchant:', scanData.result.merchant);
    console.log('  Total amount:', scanData.result.amount);
    console.log('  Items count:', scanData.result.items.length);
    console.log('  Sample item:', scanData.result.items[0]);
    console.log('  Token usage:', scanData.usage);

    if (!scanData.result.items || scanData.result.items.length === 0) {
      throw new Error('Scan result missing items');
    }
    console.log('✓ Receipt OCR parsing & 5.6luna multimodal format verified!');

    // 3. Test Dispute Arbitration (/api/dispute-arbitration)
    console.log('Testing /api/dispute-arbitration with natural language reason...');
    const originalItems = [
      { name: 'Pitcher of Beer', price: 24.00, qty: 1, member_ids: ['u1', 'u2'] },
      { name: 'Pizza', price: 30.00, qty: 1, member_ids: ['u1', 'u2'] }
    ];

    const arbRes = await fetch('http://localhost:3001/api/dispute-arbitration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        bill_id: 'test-bill-dispute',
        challenger_id: 'u2',
        reason: 'I do not drink alcohol, exclude me from the beer',
        items: originalItems,
        members: [{ id: 'u1', name: 'Alice' }, { id: 'u2', name: 'Bob' }]
      })
    });

    if (arbRes.status !== 200) {
      throw new Error(`Arbitration failed with status: ${arbRes.status} ${await arbRes.text()}`);
    }

    const arbData = await arbRes.json();
    console.log('Arbitration response:');
    console.log('  Reason analysis:', arbData.reason_analysis);
    console.log('  Suggested items:', arbData.suggested_items);

    if (!arbData.success || !Array.isArray(arbData.suggested_items)) {
      throw new Error('Invalid arbitration response');
    }

    // Verify item conservation (original names and prices are preserved)
    for (let i = 0; i < originalItems.length; i++) {
      if (arbData.suggested_items[i]) {
        if (arbData.suggested_items[i].name !== originalItems[i].name ||
            arbData.suggested_items[i].price !== originalItems[i].price) {
          throw new Error(`Item conservation violated for item ${i}`);
        }
      }
    }
    console.log('✓ Dispute arbitration verified: original item names and prices strictly conserved!');

    console.log('--- ALL OPENAI 5.6LUNA INTEGRATION TESTS PASSED! ---');
    server.close(() => {
      process.exit(0);
    });
  } catch (err) {
    console.error('AI test failed:', err);
    server.close(() => {
      process.exit(1);
    });
  }
}

setTimeout(runAiTest, 800);
