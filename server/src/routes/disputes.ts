import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppEnv } from '../types.js';

export const disputesRoute = new Hono<AppEnv>();
disputesRoute.use('*', authMiddleware);

// GET /api/disputes/bill/:billId - Fetch pending dispute for bill
disputesRoute.get('/bill/:billId', async (c) => {
  const billId = c.req.param('billId');

  const dispute = await db.queryOne<any>(
    "SELECT * FROM bill_disputes WHERE bill_id = ? AND status = 'pending'",
    billId
  );

  if (!dispute) {
    return c.json({ dispute: null, data: null });
  }

  const challenger = await db.queryOne(
    'SELECT id, name, emoji FROM users WHERE id = ?',
    dispute.user_id
  );

  let suggestedItems = [];
  try {
    suggestedItems = dispute.suggested_items ? JSON.parse(dispute.suggested_items) : [];
  } catch {
    suggestedItems = [];
  }

  const formatted = {
    id: dispute.id,
    bill_id: dispute.bill_id,
    challenger_id: dispute.user_id,
    challenger: challenger || undefined,
    reason: dispute.reason,
    suggested_items: suggestedItems,
    status: dispute.status,
    created_at: dispute.created_at,
  };

  return c.json({ dispute: formatted, data: formatted });
});

// POST /api/disputes - Create dispute
disputesRoute.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { bill_id, reason, suggested_items = [] } = body;

  const disputeId = crypto.randomUUID();
  const suggestedJson = JSON.stringify(suggested_items);

  await db.run(
    `INSERT INTO bill_disputes (id, bill_id, user_id, reason, status, suggested_items)
     VALUES (?, ?, ?, ?, 'pending', ?)`,
    disputeId, bill_id, user.id, reason, suggestedJson
  );

  return c.json({ success: true, id: disputeId }, 201);
});

// PUT /api/disputes/:id - Update dispute suggested items
disputesRoute.put('/:id', async (c) => {
  const disputeId = c.req.param('id');
  const body = await c.req.json();
  const { suggested_items } = body;

  const suggestedJson = JSON.stringify(suggested_items || []);
  await db.run(
    "UPDATE bill_disputes SET suggested_items = ? WHERE id = ? AND status = 'pending'",
    suggestedJson, disputeId
  );

  return c.json({ success: true });
});

// POST /api/disputes/:id/resolve - Resolve dispute
disputesRoute.post('/:id/resolve', async (c) => {
  const user = c.get('user');
  const disputeId = c.req.param('id');
  const body = await c.req.json();
  const { bill_id, accepted, suggested_items, bill_title, bill_icon } = body;

  const dispute = await db.queryOne<{ bill_id: string }>('SELECT bill_id FROM bill_disputes WHERE id = ?', disputeId);
  if (!dispute) {
    return c.json({ error: 'Dispute not found' }, 404);
  }

  const targetBillId = dispute.bill_id || bill_id;
  const bill = await db.queryOne<{ payer_id: string }>('SELECT payer_id FROM bills WHERE id = ?', targetBillId);
  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404);
  }
  if (bill.payer_id !== user.id) {
    return c.json({ error: '只有账单创建付款人可以仲裁处理争议' }, 403);
  }

  await db.transaction(async (tx) => {
    // 1. Update dispute status
    await tx.run(
      'UPDATE bill_disputes SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?',
      accepted ? 'accepted' : 'rejected',
      disputeId
    );

    // 2. If accepted, update bill items atomically
    if (accepted && suggested_items && suggested_items.length > 0) {
      const items = suggested_items;
      const totalAmount = items.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);

      // Update bill
      if (bill_title || bill_icon) {
        await tx.run(
          'UPDATE bills SET title = COALESCE(?, title), icon = COALESCE(?, icon), total_amount = ? WHERE id = ?',
          bill_title, bill_icon, totalAmount, bill_id
        );
      } else {
        await tx.run('UPDATE bills SET total_amount = ? WHERE id = ?', totalAmount, bill_id);
      }

      // Delete old items
      const oldItems = await tx.query<any>('SELECT id FROM bill_items WHERE bill_id = ?', bill_id);
      for (const oi of oldItems) {
        await tx.run('DELETE FROM bill_item_members WHERE item_id = ?', oi.id);
      }
      await tx.run('DELETE FROM bill_items WHERE bill_id = ?', bill_id);

      // Insert new items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemId = crypto.randomUUID();
        await tx.run(
          'INSERT INTO bill_items (id, bill_id, name, price, qty, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          itemId, bill_id, item.name, item.price, item.qty || 1, i
        );

        const memberIds: string[] = item.member_ids || [];
        for (const mid of memberIds) {
          await tx.run(
            'INSERT INTO bill_item_members (item_id, user_id) VALUES (?, ?)',
            itemId, mid
          );
        }
      }
    }
  });

  return c.json({ success: true, accepted });
});
