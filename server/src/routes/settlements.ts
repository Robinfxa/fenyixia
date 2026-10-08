import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppEnv } from '../types.js';

export const settlementsRoute = new Hono<AppEnv>();
settlementsRoute.use('*', authMiddleware);

/**
 * Returns the current ISO week bounds (Monday 00:00:00 to Sunday 23:59:59)
 */
export function getWeekBounds(targetDate = new Date()) {
  const date = new Date(targetDate);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diffToMonday));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const fmt = (dt: Date) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return {
    cycleStart: fmt(monday),
    cycleEnd: fmt(sunday),
  };
}

/**
 * Calculates pending pairwise debt between userA (current user) and userB (friend)
 */
export async function computePairwiseDebt(userAId: string, userBId: string) {
  // Query all unsettled bills where either userA or userB is the payer
  const candidateBills = await db.query<any>(
    `SELECT b.id, b.title, b.icon, b.total_amount, b.date, b.payer_id, b.settled
     FROM bills b
     WHERE b.settled = false
       AND (b.payer_id = ? OR b.payer_id = ?)
     ORDER BY b.date DESC, b.created_at DESC`,
    userAId, userBId
  );

  let theyOweMe = 0;
  let iOweThem = 0;
  const involvedBills: any[] = [];

  for (const bill of candidateBills) {
    const items = await db.query<any>(
      `SELECT id, name, price, qty FROM bill_items WHERE bill_id = ? ORDER BY sort_order ASC`,
      bill.id
    );

    const itemMembers = await db.query<any>(
      `SELECT bim.item_id, bim.user_id, u.name, u.emoji, u.color
       FROM bill_item_members bim
       JOIN users u ON u.id = bim.user_id
       WHERE bim.item_id IN (SELECT id FROM bill_items WHERE bill_id = ?)`,
      bill.id
    );

    const manualPayments = await db.query<any>(
      `SELECT member_id FROM manual_payments WHERE bill_id = ? AND settled = true`,
      bill.id
    );
    const manualSet = new Set(manualPayments.map((p) => p.member_id));

    const proofs = await db.query<any>(
      `SELECT user_id FROM payment_proofs WHERE bill_id = ?`,
      bill.id
    );
    const proofSet = new Set(proofs.map((p) => p.user_id));

    // Calculate shares for each item
    const itemMemberMap = new Map<string, string[]>();
    for (const im of itemMembers) {
      if (!itemMemberMap.has(im.item_id)) {
        itemMemberMap.set(im.item_id, []);
      }
      itemMemberMap.get(im.item_id)!.push(im.user_id);
    }

    let aShare = 0;
    let bShare = 0;

    for (const item of items) {
      const memberIds = itemMemberMap.get(item.id) || [];
      const count = memberIds.length;
      if (count === 0) continue;

      const itemCost = Number(item.price) * (Number(item.qty) || 1);
      const perPerson = itemCost / count;

      if (memberIds.includes(userAId)) aShare += perPerson;
      if (memberIds.includes(userBId)) bShare += perPerson;
    }

    // Fallback if items were not detailed: check if both are in bill members
    if (items.length === 0) {
      const distinctMembers = await db.query<any>(
        `SELECT DISTINCT user_id FROM bill_item_members WHERE item_id IN (SELECT id FROM bill_items WHERE bill_id = ?)`,
        bill.id
      );
      const totalMembers = distinctMembers.length || 1;
      const avgShare = Number(bill.total_amount) / totalMembers;
      if (distinctMembers.some((m) => m.user_id === userAId)) aShare = avgShare;
      if (distinctMembers.some((m) => m.user_id === userBId)) bShare = avgShare;
    }

    aShare = Math.round(aShare * 100) / 100;
    bShare = Math.round(bShare * 100) / 100;

    const isUserAPayer = bill.payer_id === userAId;
    const isUserBPayer = bill.payer_id === userBId;

    let isBillRelevant = false;
    let pendingFromThisBill = 0;

    if (isUserAPayer && bShare > 0) {
      const bIsSettled = manualSet.has(userBId) || proofSet.has(userBId);
      if (!bIsSettled) {
        theyOweMe += bShare;
        isBillRelevant = true;
        pendingFromThisBill = bShare;
      }
    } else if (isUserBPayer && aShare > 0) {
      const aIsSettled = manualSet.has(userAId) || proofSet.has(userAId);
      if (!aIsSettled) {
        iOweThem += aShare;
        isBillRelevant = true;
        pendingFromThisBill = aShare;
      }
    }

    if (isBillRelevant) {
      involvedBills.push({
        id: bill.id,
        title: bill.title,
        icon: bill.icon,
        total_amount: Number(bill.total_amount),
        date: bill.date,
        payer_id: bill.payer_id,
        my_share: aShare,
        their_share: bShare,
        pending_amount: pendingFromThisBill,
        i_am_payer: isUserAPayer,
      });
    }
  }

  theyOweMe = Math.round(theyOweMe * 100) / 100;
  iOweThem = Math.round(iOweThem * 100) / 100;
  const netAmount = Math.round((theyOweMe - iOweThem) * 100) / 100;

  return {
    theyOweMe,
    iOweThem,
    netAmount,
    involvedBills,
  };
}

// GET /api/settlements - List weekly settlement cycles for current user
settlementsRoute.get('/', async (c) => {
  const user = c.get('user');
  const now = new Date();
  const currentWeek = getWeekBounds(now);

  // 1. Get all friends of current user
  const friendRows = await db.query<any>(
    `SELECT f.id as friendship_id,
            CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END as friend_id,
            u.name, u.emoji, u.color
     FROM friendships f
     JOIN users u ON u.id = (CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END)
     WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'`,
    user.id, user.id, user.id, user.id
  );

  // 2. Sync / ensure settlement cycles for each friend
  for (const fr of friendRows) {
    const friendId = fr.friend_id;
    const debt = await computePairwiseDebt(user.id, friendId);

    // Look for active cycle (pending or overdue) between the two
    const activeCycle = await db.queryOne<any>(
      `SELECT * FROM settlement_cycles
       WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
         AND status IN ('pending', 'overdue')
       ORDER BY created_at DESC LIMIT 1`,
      user.id, friendId, friendId, user.id
    );

    const involvedIdsJson = JSON.stringify(debt.involvedBills.map((b) => b.id));

    if (activeCycle) {
      // Check if the cycle has crossed past its cycle_end date -> mark as overdue & extend to current week
      const isPastEnd = activeCycle.cycle_end < currentWeek.cycleStart;
      const nextStatus = isPastEnd ? 'overdue' : activeCycle.status;
      const nextEnd = isPastEnd ? currentWeek.cycleEnd : activeCycle.cycle_end;

      await db.run(
        `UPDATE settlement_cycles
         SET status = ?,
             cycle_end = ?,
             net_amount = ?,
             settled_bill_ids = ?
         WHERE id = ?`,
        nextStatus,
        nextEnd,
        // Align net_amount orientation with activeCycle.user_id
        activeCycle.user_id === user.id ? debt.netAmount : -debt.netAmount,
        involvedIdsJson,
        activeCycle.id
      );
    } else {
      // Check if there was already a confirmed cycle within current week
      const confirmedThisWeek = await db.queryOne<any>(
        `SELECT id FROM settlement_cycles
         WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
           AND status = 'confirmed'
           AND cycle_start = ?
         LIMIT 1`,
        user.id, friendId, friendId, user.id, currentWeek.cycleStart
      );

      // If there are unsettled bills and no cycle yet this week, create one
      if (!confirmedThisWeek && debt.involvedBills.length > 0) {
        const cycleId = crypto.randomUUID();
        await db.run(
          `INSERT INTO settlement_cycles
           (id, user_id, friend_id, cycle_start, cycle_end, status, net_amount, settled_bill_ids)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
          cycleId,
          user.id,
          friendId,
          currentWeek.cycleStart,
          currentWeek.cycleEnd,
          debt.netAmount,
          involvedIdsJson
        );
      }
    }
  }

  // 3. Query all cycles relevant to current user
  const allCycles = await db.query<any>(
    `SELECT sc.*,
            u.name as other_name, u.emoji as other_emoji, u.color as other_color
     FROM settlement_cycles sc
     JOIN users u ON u.id = (CASE WHEN sc.user_id = ? THEN sc.friend_id ELSE sc.user_id END)
     WHERE sc.user_id = ? OR sc.friend_id = ?
     ORDER BY
       CASE WHEN sc.status = 'overdue' THEN 1 WHEN sc.status = 'pending' THEN 2 ELSE 3 END,
       sc.cycle_start DESC, sc.created_at DESC`,
    user.id, user.id, user.id
  );

  const formatted = allCycles.map((c) => {
    const isInitiator = c.user_id === user.id;
    const adjustedNetAmount = isInitiator ? Number(c.net_amount) : -Number(c.net_amount);
    let billIds: string[] = [];
    try {
      billIds = JSON.parse(c.settled_bill_ids || '[]');
    } catch {}

    return {
      id: c.id,
      user_id: c.user_id,
      friend_id: c.friend_id,
      other_user: {
        id: isInitiator ? c.friend_id : c.user_id,
        name: c.other_name,
        emoji: c.other_emoji,
        color: c.other_color,
      },
      cycle_start: c.cycle_start,
      cycle_end: c.cycle_end,
      status: c.status, // 'pending' | 'overdue' | 'confirmed'
      net_amount: Math.round(adjustedNetAmount * 100) / 100,
      bill_count: billIds.length,
      confirmed_at: c.confirmed_at,
      created_at: c.created_at,
    };
  });

  return c.json({
    current_week: currentWeek,
    cycles: formatted,
    data: formatted,
  });
});

// GET /api/settlements/preview/:friendId - Preview settlement details with a specific friend
settlementsRoute.get('/preview/:friendId', async (c) => {
  const user = c.get('user');
  const friendId = c.req.param('friendId');

  const friend = await db.queryOne<any>(
    'SELECT id, name, emoji, color, email FROM users WHERE id = ?',
    friendId
  );
  if (!friend) {
    return c.json({ error: 'Friend not found' }, 404);
  }

  const debt = await computePairwiseDebt(user.id, friendId);

  return c.json({
    friend: {
      id: friend.id,
      name: friend.name,
      emoji: friend.emoji,
      color: friend.color,
    },
    they_owe_me: debt.theyOweMe,
    i_owe_them: debt.iOweThem,
    net_amount: debt.netAmount,
    bills: debt.involvedBills,
  });
});

// POST /api/settlements/:id/confirm - Confirm settlement and clear bills
settlementsRoute.post('/:id/confirm', async (c) => {
  const user = c.get('user');
  const cycleId = c.req.param('id');

  const cycle = await db.queryOne<any>(
    'SELECT * FROM settlement_cycles WHERE id = ?',
    cycleId
  );
  if (!cycle) {
    return c.json({ error: '结算单不存在' }, 404);
  }

  if (cycle.user_id !== user.id && cycle.friend_id !== user.id) {
    return c.json({ error: '无权操作此结算单' }, 403);
  }

  if (cycle.status === 'confirmed') {
    return c.json({ error: '此结算单已确认结清' }, 400);
  }

  const otherUserId = cycle.user_id === user.id ? cycle.friend_id : cycle.user_id;

  // Recompute latest debt to get accurate bills to clear
  const latestDebt = await computePairwiseDebt(user.id, otherUserId);
  const billsToClear = latestDebt.involvedBills;

  await db.transaction(async (tx) => {
    for (const b of billsToClear) {
      const billId = b.id;
      const bill = await tx.queryOne<any>('SELECT payer_id FROM bills WHERE id = ?', billId);
      if (!bill) continue;

      if (bill.payer_id === user.id) {
        // Mark otherUser as paid
        const exists = await tx.queryOne(
          'SELECT id FROM manual_payments WHERE bill_id = ? AND member_id = ?',
          billId, otherUserId
        );
        if (!exists) {
          await tx.run(
            `INSERT INTO manual_payments (id, bill_id, payer_id, member_id, settled)
             VALUES (?, ?, ?, ?, true)`,
            crypto.randomUUID(), billId, user.id, otherUserId
          );
        }
      } else if (bill.payer_id === otherUserId) {
        // Mark user as paid
        const exists = await tx.queryOne(
          'SELECT id FROM manual_payments WHERE bill_id = ? AND member_id = ?',
          billId, user.id
        );
        if (!exists) {
          await tx.run(
            `INSERT INTO manual_payments (id, bill_id, payer_id, member_id, settled)
             VALUES (?, ?, ?, ?, true)`,
            crypto.randomUUID(), billId, otherUserId, user.id
          );
        }
      }

      // Check if all non-payer members of this bill are now settled
      const distinctMembers = await tx.query<any>(
        `SELECT DISTINCT user_id FROM bill_item_members
         WHERE item_id IN (SELECT id FROM bill_items WHERE bill_id = ?)`,
        billId
      );

      const nonPayerMembers = distinctMembers.filter((m) => m.user_id !== bill.payer_id);

      const manualPaidRows = await tx.query<any>(
        'SELECT member_id FROM manual_payments WHERE bill_id = ? AND settled = true',
        billId
      );
      const proofRows = await tx.query<any>(
        'SELECT user_id FROM payment_proofs WHERE bill_id = ?',
        billId
      );
      const paidUserSet = new Set([
        ...manualPaidRows.map((m) => m.member_id),
        ...proofRows.map((p) => p.user_id),
      ]);

      const allMembersSettled = nonPayerMembers.every((m) => paidUserSet.has(m.user_id));
      if (allMembersSettled && nonPayerMembers.length > 0) {
        await tx.run('UPDATE bills SET settled = true WHERE id = ?', billId);
      }
    }

    // Mark cycle as confirmed
    await tx.run(
      `UPDATE settlement_cycles
       SET status = 'confirmed',
           confirmed_at = CURRENT_TIMESTAMP,
           net_amount = ?,
           settled_bill_ids = ?
       WHERE id = ?`,
      cycle.user_id === user.id ? latestDebt.netAmount : -latestDebt.netAmount,
      JSON.stringify(billsToClear.map((b) => b.id)),
      cycleId
    );
  });

  return c.json({
    success: true,
    message: '清帐成功，账目已同步更新',
    cleared_bills_count: billsToClear.length,
  });
});

// DELETE /api/settlements/:id - Skip or cancel a pending/overdue cycle
settlementsRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const cycleId = c.req.param('id');

  const cycle = await db.queryOne<any>(
    'SELECT * FROM settlement_cycles WHERE id = ?',
    cycleId
  );
  if (!cycle) {
    return c.json({ error: '结算单不存在' }, 404);
  }

  if (cycle.user_id !== user.id && cycle.friend_id !== user.id) {
    return c.json({ error: '无权操作此结算单' }, 403);
  }

  await db.run('DELETE FROM settlement_cycles WHERE id = ?', cycleId);
  return c.json({ success: true, message: '已取消本次清帐单' });
});
