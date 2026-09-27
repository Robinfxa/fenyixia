import { Hono } from 'hono';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { UPLOADS_DIR } from './upload.js';
import { AppEnv } from '../types.js';

export const paymentsRoute = new Hono<AppEnv>();
paymentsRoute.use('*', authMiddleware);

// GET /api/payments/proofs/:billId - Get payment proofs for a bill
paymentsRoute.get('/proofs/:billId', async (c) => {
  const billId = c.req.param('billId');

  const proofs = await db.query<any>(
    'SELECT * FROM payment_proofs WHERE bill_id = ? ORDER BY created_at DESC',
    billId
  );

  const formatted: any[] = [];
  for (const p of proofs) {
    const user = await db.queryOne('SELECT id, name, emoji FROM users WHERE id = ?', p.user_id);
    formatted.push({
      id: p.id,
      bill_id: p.bill_id,
      user_id: p.user_id,
      image_url: p.image_url,
      note: p.note || '',
      created_at: p.created_at,
      user: user || null,
    });
  }

  return c.json({ proofs: formatted, data: formatted });
});

// POST /api/payments/proofs - Save payment proof record
paymentsRoute.post('/proofs', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { bill_id, image_url, note = '' } = body;

  if (!bill_id || !image_url) {
    return c.json({ error: 'bill_id and image_url are required' }, 400);
  }

  const proofId = crypto.randomUUID();
  await db.run(
    'INSERT INTO payment_proofs (id, bill_id, user_id, image_url, note) VALUES (?, ?, ?, ?, ?)',
    proofId, bill_id, user.id, image_url, note
  );

  const created = {
    id: proofId,
    bill_id,
    user_id: user.id,
    image_url,
    note,
    created_at: new Date().toISOString(),
    user: { id: user.id, name: user.name, emoji: user.emoji },
  };

  return c.json({ proof: created, success: true }, 201);
});

// POST /api/payments/proofs/upload - Direct upload & record creation in one step
paymentsRoute.post('/proofs/upload', async (c) => {
  const user = c.get('user');
  const body = await c.req.parseBody();
  const billId = String(body['bill_id'] || body['billId'] || '');
  const file = body['file'] || body['image'];

  if (!billId || !file || !(file instanceof File)) {
    return c.json({ error: 'bill_id and file are required' }, 400);
  }

  const MAX_PROOF_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_PROOF_BYTES) {
    return c.json({ error: '上传付款凭证图片大小不能超过 10MB' }, 400);
  }

  const ALLOWED_PROOF_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
  const rawExt = path.extname(file.name).toLowerCase();
  if (rawExt && !ALLOWED_PROOF_EXTS.has(rawExt)) {
    return c.json({ error: '不支持的文件类型，仅支持 JPG、PNG、WEBP、GIF 格式图片' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_PROOF_BYTES) {
    return c.json({ error: '上传付款凭证图片大小不能超过 10MB' }, 400);
  }

  const ext = ALLOWED_PROOF_EXTS.has(rawExt) ? rawExt : '.png';
  const filename = `${billId}_${user.id}_${Date.now()}${ext}`;

  const proofsDir = path.join(UPLOADS_DIR, 'proofs');
  await fs.mkdir(proofsDir, { recursive: true });
  await fs.writeFile(path.join(proofsDir, filename), buffer);

  const imageUrl = `/uploads/proofs/${filename}`;
  const proofId = crypto.randomUUID();

  await db.run(
    'INSERT INTO payment_proofs (id, bill_id, user_id, image_url, note) VALUES (?, ?, ?, ?, ?)',
    proofId, billId, user.id, imageUrl, ''
  );

  return c.json({
    success: true,
    id: proofId,
    image_url: imageUrl,
    url: imageUrl,
    user: { id: user.id, name: user.name, emoji: user.emoji }
  }, 201);
});

// GET /api/payments/manual/:billId - Get list of users manually marked as settled
paymentsRoute.get('/manual/:billId', async (c) => {
  const billId = c.req.param('billId');
  const rows = await db.query<any>(
    'SELECT member_id as user_id FROM manual_payments WHERE bill_id = ? AND settled = true',
    billId
  );

  const userIds = rows.map((r) => r.user_id);
  return c.json({ user_ids: userIds, data: userIds });
});

// POST /api/payments/manual/toggle - Toggle manual payment status for a member
paymentsRoute.post('/manual/toggle', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { bill_id, user_id } = body;

  if (!bill_id || !user_id) {
    return c.json({ error: 'bill_id and user_id are required' }, 400);
  }

  const bill = await db.queryOne<{ payer_id: string }>('SELECT payer_id FROM bills WHERE id = ?', bill_id);
  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404);
  }
  if (bill.payer_id !== user.id) {
    return c.json({ error: '只有账单创建付款人可以手动修改结算状态' }, 403);
  }

  const existing = await db.queryOne<any>(
    'SELECT id FROM manual_payments WHERE bill_id = ? AND member_id = ?',
    bill_id, user_id
  );

  if (existing) {
    // Unmark
    await db.run('DELETE FROM manual_payments WHERE id = ?', existing.id);
    return c.json({ settled: false, message: 'Unmarked as paid' });
  } else {
    // Mark as paid
    const paymentId = crypto.randomUUID();
    await db.run(
      `INSERT INTO manual_payments (id, bill_id, payer_id, member_id, amount, settled)
       VALUES (?, ?, ?, ?, ?, true)`,
      paymentId, bill_id, user.id, user_id, 0.00
    );
    return c.json({ settled: true, message: 'Marked as paid' });
  }
});
