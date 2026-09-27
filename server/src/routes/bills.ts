import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppEnv } from '../types.js';

export const billsRoute = new Hono<AppEnv>();

// All bill routes require authentication
billsRoute.use('*', authMiddleware);

export interface RawBillItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  sort_order: number;
  members: { user: { id: string; name: string; emoji: string } }[];
}

export interface RawBill {
  id: string;
  icon: string;
  title: string;
  description: string;
  total_amount: number;
  date: string;
  payer_id: string;
  settled: boolean;
  color: string;
  payer: { id: string; name: string; emoji: string; email: string } | null;
  items: RawBillItem[];
}

import { ADMIN_EMAIL } from './admin.js';

const roundCents = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function assembleBillsBatch(billRows: any[], currentUserId: string): Promise<RawBill[]> {
  if (!billRows || billRows.length === 0) return [];

  const billIds = billRows.map((b) => b.id);
  const payerIds = [...new Set(billRows.map((b) => b.payer_id).filter(Boolean))];

  // 1. Fetch all distinct payers in ONE query
  const payerPlaceholders = payerIds.map(() => '?').join(',');
  const payers = payerIds.length > 0
    ? await db.query<{ id: string; name: string; emoji: string; email: string }>(
        `SELECT id, name, emoji, email FROM users WHERE id IN (${payerPlaceholders})`,
        ...payerIds
      )
    : [];
  const payerMap = new Map(payers.map((p) => [p.id, p]));

  // 2. Fetch all items and their joined members in ONE query
  const billPlaceholders = billIds.map(() => '?').join(',');
  const itemMemberRows = await db.query<any>(
    `SELECT bi.id as item_id, bi.bill_id, bi.name as item_name, CAST(bi.price AS DOUBLE) as price,
            bi.qty, bi.sort_order, bim.user_id as member_id, u.name as member_name, u.emoji as member_emoji
     FROM bill_items bi
     LEFT JOIN bill_item_members bim ON bim.item_id = bi.id
     LEFT JOIN users u ON u.id = bim.user_id
     WHERE bi.bill_id IN (${billPlaceholders})
     ORDER BY bi.sort_order ASC`,
    ...billIds
  );

  const billItemsMap = new Map<string, Map<string, RawBillItem>>();
  for (const row of itemMemberRows) {
    let itemsForBill = billItemsMap.get(row.bill_id);
    if (!itemsForBill) {
      itemsForBill = new Map();
      billItemsMap.set(row.bill_id, itemsForBill);
    }

    let item = itemsForBill.get(row.item_id);
    if (!item) {
      item = {
        id: row.item_id,
        name: row.item_name,
        price: roundCents(Number(row.price)),
        qty: Number(row.qty) || 1,
        sort_order: Number(row.sort_order) || 0,
        members: []
      };
      itemsForBill.set(row.item_id, item);
    }

    if (row.member_id) {
      item.members.push({
        user: { id: row.member_id, name: row.member_name || '', emoji: row.member_emoji || '👤' }
      });
    }
  }

  // 3. Fetch payment proofs in ONE query
  const proofRows = await db.query<any>(
    `SELECT bill_id, user_id FROM payment_proofs WHERE bill_id IN (${billPlaceholders})`,
    ...billIds
  );
  const proofsMap = new Map<string, Set<string>>();
  for (const r of proofRows) {
    if (!proofsMap.has(r.bill_id)) proofsMap.set(r.bill_id, new Set());
    proofsMap.get(r.bill_id)!.add(r.user_id);
  }

  // 4. Fetch manual payments in ONE query
  const manualRows = await db.query<any>(
    `SELECT bill_id, member_id FROM manual_payments WHERE bill_id IN (${billPlaceholders}) AND settled = true`,
    ...billIds
  );
  const manualMap = new Map<string, string[]>();
  for (const r of manualRows) {
    if (!manualMap.has(r.bill_id)) manualMap.set(r.bill_id, []);
    manualMap.get(r.bill_id)!.push(r.member_id);
  }

  // 5. Fetch pending disputes with challenger in ONE query
  const disputeRows = await db.query<any>(
    `SELECT bd.*, u.name as challenger_name, u.emoji as challenger_emoji
     FROM bill_disputes bd
     LEFT JOIN users u ON u.id = bd.user_id
     WHERE bd.bill_id IN (${billPlaceholders}) AND bd.status = 'pending'`,
    ...billIds
  );
  const disputeMap = new Map<string, any>();
  for (const d of disputeRows) {
    let suggested = [];
    try {
      suggested = d.suggested_items ? JSON.parse(d.suggested_items) : [];
    } catch {
      suggested = [];
    }
    disputeMap.set(d.bill_id, {
      id: d.id,
      bill_id: d.bill_id,
      challenger_id: d.user_id,
      challenger: d.challenger_name ? { id: d.user_id, name: d.challenger_name, emoji: d.challenger_emoji } : undefined,
      reason: d.reason,
      suggested_items: suggested,
      status: d.status,
      created_at: d.created_at
    });
  }

  // Fast O(1) in-memory reconstruction
  return billRows.map((billRow) => {
    const payer = payerMap.get(billRow.payer_id) || null;
    const itemsMap = billItemsMap.get(billRow.id);
    const items = itemsMap ? Array.from(itemsMap.values()) : [];
    const proofSet = proofsMap.get(billRow.id) || new Set();
    const manualList = manualMap.get(billRow.id) || [];
    const dispute = disputeMap.get(billRow.id) || null;

    const isPayer = billRow.payer_id === currentUserId;
    let myShare = 0;
    const memberShareMap = new Map<string, { id: string; name: string; emoji: string; share: number }>();
    for (const item of items) {
      const itemMembers = item.members || [];
      const per = itemMembers.length > 0 ? (item.price * item.qty) / itemMembers.length : 0;
      for (const m of itemMembers) {
        if (!memberShareMap.has(m.user.id)) {
          memberShareMap.set(m.user.id, { id: m.user.id, name: m.user.name, emoji: m.user.emoji, share: 0 });
        }
        memberShareMap.get(m.user.id)!.share += per;
        if (m.user.id === currentUserId) {
          myShare += per;
        }
      }
    }
    myShare = roundCents(myShare);

    const nonPayers = Array.from(memberShareMap.values()).filter(m => m.id !== billRow.payer_id);
    const paidMembers: Array<{ id: string; name: string; emoji: string; share: number }> = [];
    const unsettledMembers: Array<{ id: string; name: string; emoji: string; share: number }> = [];

    for (const m of nonPayers) {
      const isMemberPaid = proofSet.has(m.id) || manualList.includes(m.id) || billRow.settled;
      const roundedShare = roundCents(m.share);
      if (isMemberPaid) {
        paidMembers.push({ id: m.id, name: m.name, emoji: m.emoji, share: roundedShare });
      } else {
        unsettledMembers.push({ id: m.id, name: m.name, emoji: m.emoji, share: roundedShare });
      }
    }

    let status: 'settled' | 'all_collected' | 'pending_collection' | 'paid' | 'pending_payment';
    let pendingAmount = 0;
    if (billRow.settled) {
      status = 'settled';
      pendingAmount = 0;
    } else if (isPayer) {
      if (unsettledMembers.length === 0) {
        status = 'all_collected';
        pendingAmount = 0;
      } else {
        status = 'pending_collection';
        pendingAmount = roundCents(unsettledMembers.reduce((sum, m) => sum + m.share, 0));
      }
    } else {
      const iPaid = proofSet.has(currentUserId) || manualList.includes(currentUserId);
      if (iPaid) {
        status = 'paid';
        pendingAmount = 0;
      } else {
        status = 'pending_payment';
        pendingAmount = myShare;
      }
    }

    return {
      id: billRow.id,
      icon: billRow.icon || '🧾',
      title: billRow.title,
      description: billRow.description || '',
      total_amount: roundCents(Number(billRow.total_amount)),
      date: billRow.date,
      payer_id: billRow.payer_id,
      settled: Boolean(billRow.settled),
      color: billRow.color || '#4F46E5',
      payer: payer ? { id: payer.id, name: payer.name, emoji: payer.emoji, email: payer.email } : null,
      items,
      my_share: myShare,
      pending_amount: pendingAmount,
      status,
      unsettled_members: unsettledMembers,
      paid_members: paidMembers,
      _hasMeProof: proofSet.has(currentUserId),
      _proofUserIds: Array.from(proofSet),
      _manualPaidUserIds: manualList,
      _dispute: dispute,
    } as any;
  });
}

async function assembleBill(billRow: any, currentUserId: string): Promise<RawBill> {
  const [assembled] = await assembleBillsBatch([billRow], currentUserId);
  return assembled;
}

// GET /api/bills - Fetch bills with optional filter and admin backdoor
billsRoute.get('/', async (c) => {
  const user = c.get('user');
  const filter = c.req.query('filter') || 'all';
  const queryAll = c.req.query('all') === 'true' || c.req.query('admin') === 'true';
  const targetUserId = c.req.query('target_user_id') || c.req.query('user_id');

  const isAdmin = user.email === ADMIN_EMAIL;

  let billRows: any[];
  if (isAdmin && queryAll) {
    // Admin backdoor: query all bills across the platform
    billRows = await db.query<any>(
      `SELECT DISTINCT b.* FROM bills b ORDER BY b.created_at DESC`
    );
  } else if (isAdmin && targetUserId) {
    // Admin backdoor: inspect a specific user's bills
    billRows = await db.query<any>(
      `SELECT DISTINCT b.*
       FROM bills b
       LEFT JOIN bill_items bi ON bi.bill_id = b.id
       LEFT JOIN bill_item_members bim ON bim.item_id = bi.id
       WHERE b.payer_id = ? OR bim.user_id = ?
       ORDER BY b.created_at DESC`,
      targetUserId, targetUserId
    );
  } else {
    // Regular scoped query (safe: only user's own bills)
    billRows = await db.query<any>(
      `SELECT DISTINCT b.*
       FROM bills b
       LEFT JOIN bill_items bi ON bi.bill_id = b.id
       LEFT JOIN bill_item_members bim ON bim.item_id = bi.id
       WHERE b.payer_id = ? OR bim.user_id = ?
       ORDER BY b.created_at DESC`,
      user.id, user.id
    );
  }

  const effectiveUserId = (isAdmin && targetUserId) ? targetUserId : user.id;
  const assembled = await assembleBillsBatch(billRows, effectiveUserId);

  let filtered = assembled;
  if (filter === 'pending') {
    filtered = assembled.filter((b: any) => b.status === 'pending_payment');
  } else if (filter === 'collect') {
    filtered = assembled.filter((b: any) => b.status === 'pending_collection');
  }

  return c.json({ bills: filtered, data: filtered, total: filtered.length });
});

// POST /api/bills/:id/mark-paid - AI and Payer helper to mark payments
billsRoute.post('/:id/mark-paid', async (c) => {
  const user = c.get('user');
  const billId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const { member_id, settled = true } = body;

  const bill = await db.queryOne<{ id: string; payer_id: string; settled: boolean }>(
    'SELECT id, payer_id, settled FROM bills WHERE id = ?',
    billId
  );
  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404);
  }

  const isAdmin = user.email === ADMIN_EMAIL;
  if (bill.payer_id !== user.id && !isAdmin) {
    return c.json({ error: 'Forbidden: 只有付款人或管理员可标记结算' }, 403);
  }

  if (member_id) {
    const existing = await db.queryOne(
      'SELECT id FROM manual_payments WHERE bill_id = ? AND member_id = ?',
      billId, member_id
    );
    if (settled) {
      if (!existing) {
        await db.run(
          `INSERT INTO manual_payments (id, bill_id, payer_id, member_id, settled)
           VALUES (?, ?, ?, ?, true)`,
          crypto.randomUUID(), billId, bill.payer_id, member_id
        );
      }
    } else {
      if (existing) {
        await db.run('DELETE FROM manual_payments WHERE bill_id = ? AND member_id = ?', billId, member_id);
      }
    }
    return c.json({ success: true, bill_id: billId, member_id, settled: Boolean(settled) });
  }

  await db.run('UPDATE bills SET settled = ? WHERE id = ?', Boolean(settled), billId);
  return c.json({ success: true, bill_id: billId, settled: Boolean(settled) });
});

// GET /api/bills/:id - Fetch single bill
billsRoute.get('/:id', async (c) => {
  const user = c.get('user');
  const billId = c.req.param('id');

  const billRow = await db.queryOne('SELECT * FROM bills WHERE id = ?', billId);
  if (!billRow) {
    return c.json({ error: 'Bill not found' }, 404);
  }

  const assembled = await assembleBill(billRow, user.id);
  return c.json({ bill: assembled, data: assembled });
});

// POST /api/bills - Create bill atomically
billsRoute.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const { title, icon = '🧾', description = '', date = new Date().toISOString().slice(0, 10), color, items = [] } = body;

  if (!title) {
    return c.json({ error: 'Title is required' }, 400);
  }

  const billId = crypto.randomUUID();
  const totalAmount = items.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);

  try {
    await db.transaction(async (tx) => {
      // 1. Insert Bill
      await tx.run(
        `INSERT INTO bills (id, icon, title, description, total_amount, date, payer_id, settled, color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        billId,
        icon,
        title,
        description,
        totalAmount,
        date,
        user.id,
        false,
        color || '#4F46E5'
      );

      // 2. Insert Bill Items & Members
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemId = crypto.randomUUID();
        const price = Number(item.price) || 0;
        const qty = Number(item.qty) || 1;

        await tx.run(
          `INSERT INTO bill_items (id, bill_id, name, price, qty, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          itemId,
          billId,
          item.name || `Item ${i + 1}`,
          price,
          qty,
          i
        );

        const memberIds: string[] = item.member_ids || (item.members?.map((m: any) => m.id || m)) || [];
        for (const memberId of memberIds) {
          await tx.run(
            `INSERT INTO bill_item_members (item_id, user_id) VALUES (?, ?)`,
            itemId,
            memberId
          );
        }
      }
    });

    const created = await assembleBill(await db.queryOne('SELECT * FROM bills WHERE id = ?', billId), user.id);
    return c.json({ id: billId, bill: created, success: true }, 201);
  } catch (err: any) {
    console.error('Failed to create bill:', err);
    return c.json({ error: err.message || 'Failed to create bill' }, 500);
  }
});

// PUT /api/bills/:id - Update bill atomically
billsRoute.put('/:id', async (c) => {
  const user = c.get('user');
  const billId = c.req.param('id');
  const body = await c.req.json();

  const existing = await db.queryOne('SELECT * FROM bills WHERE id = ?', billId);
  if (!existing) {
    return c.json({ error: 'Bill not found' }, 404);
  }

  // Ownership guardrail: only payer or admin can modify bill
  if (existing.payer_id !== user.id && user.email !== ADMIN_EMAIL) {
    return c.json({ error: '只有账单创建付款人或管理员可以修改账单' }, 403);
  }

  const { title, icon, description, color, items = [] } = body;
  const totalAmount = roundCents(items.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0));

  try {
    await db.transaction(async (tx) => {
      // 1. Update Bill header
      await tx.run(
        `UPDATE bills
         SET title = COALESCE(?, title),
             icon = COALESCE(?, icon),
             description = COALESCE(?, description),
             color = COALESCE(?, color),
             total_amount = ?
         WHERE id = ?`,
        title,
        icon,
        description,
        color,
        totalAmount,
        billId
      );

      // 2. Clear old items & members
      const oldItems = await tx.query<any>('SELECT id FROM bill_items WHERE bill_id = ?', billId);
      for (const oldItem of oldItems) {
        await tx.run('DELETE FROM bill_item_members WHERE item_id = ?', oldItem.id);
      }
      await tx.run('DELETE FROM bill_items WHERE bill_id = ?', billId);

      // 3. Insert new items & members
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemId = crypto.randomUUID();
        const price = roundCents(Number(item.price) || 0);
        const qty = Number(item.qty) || 1;

        await tx.run(
          `INSERT INTO bill_items (id, bill_id, name, price, qty, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          itemId,
          billId,
          item.name || `Item ${i + 1}`,
          price,
          qty,
          i
        );

        const memberIds: string[] = item.member_ids || (item.members?.map((m: any) => m.id || m)) || [];
        for (const memberId of memberIds) {
          await tx.run(
            `INSERT INTO bill_item_members (item_id, user_id) VALUES (?, ?)`,
            itemId,
            memberId
          );
        }
      }
    });

    const updated = await assembleBill(await db.queryOne('SELECT * FROM bills WHERE id = ?', billId), user.id);
    return c.json({ id: billId, bill: updated, success: true });
  } catch (err: any) {
    console.error('Failed to update bill:', err);
    return c.json({ error: err.message || 'Failed to update bill' }, 500);
  }
});

// DELETE /api/bills/:id - Delete bill atomically
billsRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const billId = c.req.param('id');

  const existing = await db.queryOne('SELECT * FROM bills WHERE id = ?', billId);
  if (!existing) {
    return c.json({ error: 'Bill not found' }, 404);
  }

  // Ownership guardrail: only payer or admin can delete bill
  if (existing.payer_id !== user.id && user.email !== ADMIN_EMAIL) {
    return c.json({ error: '只有账单创建付款人或管理员可以删除账单' }, 403);
  }

  try {
    await db.transaction(async (tx) => {
      const items = await tx.query<any>('SELECT id FROM bill_items WHERE bill_id = ?', billId);
      for (const item of items) {
        await tx.run('DELETE FROM bill_item_members WHERE item_id = ?', item.id);
      }
      await tx.run('DELETE FROM bill_items WHERE bill_id = ?', billId);
      await tx.run('DELETE FROM payment_proofs WHERE bill_id = ?', billId);
      await tx.run('DELETE FROM manual_payments WHERE bill_id = ?', billId);
      await tx.run('DELETE FROM bill_disputes WHERE bill_id = ?', billId);
      await tx.run('DELETE FROM bill_reactions WHERE bill_id = ?', billId);
      await tx.run('DELETE FROM bills WHERE id = ?', billId);
    });

    return c.json({ success: true, message: 'Bill deleted successfully' });
  } catch (err: any) {
    console.error('Failed to delete bill:', err);
    return c.json({ error: err.message || 'Failed to delete bill' }, 500);
  }
});

// PATCH /api/bills/:id/settled - Toggle settled state
billsRoute.patch('/:id/settled', async (c) => {
  const user = c.get('user');
  const billId = c.req.param('id');
  const body = await c.req.json();
  const settled = Boolean(body.settled);

  const existing = await db.queryOne('SELECT * FROM bills WHERE id = ?', billId);
  if (!existing) {
    return c.json({ error: 'Bill not found' }, 404);
  }

  // Ownership guardrail: only payer or admin can mark bill settled
  if (existing.payer_id !== user.id && user.email !== ADMIN_EMAIL) {
    return c.json({ error: '只有账单创建付款人或管理员可以标记账单结清' }, 403);
  }

  await db.run('UPDATE bills SET settled = ? WHERE id = ?', settled, billId);
  return c.json({ success: true, settled });
});
