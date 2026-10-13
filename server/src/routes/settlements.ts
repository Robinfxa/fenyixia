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
    `SELECT b.id, b.title, b.icon, b.description, b.color, b.total_amount, b.date, b.payer_id, b.settled
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
      const disputes = await db.query<any>(
        `SELECT id, bill_id, user_id, reason, status FROM bill_disputes WHERE bill_id = ? AND status = 'pending'`,
        bill.id
      );

      involvedBills.push({
        id: bill.id,
        title: bill.title,
        icon: bill.icon || '🧾',
        color: bill.color || '#4F46E5',
        description: bill.description || '',
        total_amount: Number(bill.total_amount),
        date: bill.date,
        payer_id: bill.payer_id,
        my_share: aShare,
        their_share: bShare,
        pending_amount: pendingFromThisBill,
        i_am_payer: isUserAPayer,
        has_dispute: disputes.length > 0,
        dispute: disputes[0] || null,
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

export interface SettlementSlice {
  user_a: { id: string; name: string; emoji: string };
  user_b: { id: string; name: string; emoji: string };
  user_a_paid_for_b: number; // A 垫付给 B 的总额 (B 应付 A)
  user_b_paid_for_a: number; // B 垫付给 A 的总额 (A 应付 B)
  net_amount: number; // 抵消后的最终绝对值
  debtor_id: string | null; // 最终实际付款人 ID
  creditor_id: string | null; // 最终实际收款人 ID
  debtor_name: string;
  creditor_name: string;
  action_summary: string;
  bill_slices: {
    bill_id: string;
    title: string;
    icon: string;
    total_amount: number;
    date: string;
    payer_id: string;
    payer_name: string;
    payer_emoji: string;
    user_a_share: number;
    user_b_share: number;
    advance_payer_id: string | null;
    advance_amount: number;
  }[];
}

export async function computeSettlementSlice(
  billIds: string[],
  userAId: string,
  userBId: string
): Promise<SettlementSlice> {
  const userA = await db.queryOne<any>('SELECT id, name, emoji FROM users WHERE id = ?', userAId);
  const userB = await db.queryOne<any>('SELECT id, name, emoji FROM users WHERE id = ?', userBId);

  const uA = {
    id: userAId,
    name: userA?.name || '用户',
    emoji: userA?.emoji || '👤',
  };
  const uB = {
    id: userBId,
    name: userB?.name || '好友',
    emoji: userB?.emoji || '👤',
  };

  if (!billIds || billIds.length === 0) {
    return {
      user_a: uA,
      user_b: uB,
      user_a_paid_for_b: 0,
      user_b_paid_for_a: 0,
      net_amount: 0,
      debtor_id: null,
      creditor_id: null,
      debtor_name: '',
      creditor_name: '',
      action_summary: '无关联账单，结清金额为 ¥ 0.00',
      bill_slices: [],
    };
  }

  const placeholders = billIds.map(() => '?').join(',');
  const bills = await db.query<any>(
    `SELECT b.id, b.title, b.icon, b.total_amount, b.date, b.payer_id,
            u.name as payer_name, u.emoji as payer_emoji
     FROM bills b
     JOIN users u ON u.id = b.payer_id
     WHERE b.id IN (${placeholders})
     ORDER BY b.date DESC, b.created_at DESC`,
    ...billIds
  );

  let userAPaidForB = 0;
  let userBPaidForA = 0;
  const billSlices: any[] = [];

  for (const bill of bills) {
    const items = await db.query<any>(
      `SELECT id, price, qty FROM bill_items WHERE bill_id = ? ORDER BY sort_order ASC`,
      bill.id
    );

    const itemMembers = await db.query<any>(
      `SELECT bim.item_id, bim.user_id
       FROM bill_item_members bim
       WHERE bim.item_id IN (SELECT id FROM bill_items WHERE bill_id = ?)`,
      bill.id
    );

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

    let advancePayerId: string | null = null;
    let advanceAmount = 0;

    if (bill.payer_id === userAId && bShare > 0) {
      userAPaidForB += bShare;
      advancePayerId = userAId;
      advanceAmount = bShare;
    } else if (bill.payer_id === userBId && aShare > 0) {
      userBPaidForA += aShare;
      advancePayerId = userBId;
      advanceAmount = aShare;
    }

    billSlices.push({
      bill_id: bill.id,
      title: bill.title,
      icon: bill.icon || '🧾',
      total_amount: Number(bill.total_amount),
      date: bill.date,
      payer_id: bill.payer_id,
      payer_name: bill.payer_name,
      payer_emoji: bill.payer_emoji,
      user_a_share: aShare,
      user_b_share: bShare,
      advance_payer_id: advancePayerId,
      advance_amount: Math.round(advanceAmount * 100) / 100,
    });
  }

  userAPaidForB = Math.round(userAPaidForB * 100) / 100;
  userBPaidForA = Math.round(userBPaidForA * 100) / 100;

  let netAmount = 0;
  let debtorId: string | null = null;
  let creditorId: string | null = null;
  let debtorName = '';
  let creditorName = '';
  let actionSummary = '';

  if (userAPaidForB > userBPaidForA) {
    netAmount = Math.round((userAPaidForB - userBPaidForA) * 100) / 100;
    debtorId = uB.id;
    creditorId = uA.id;
    debtorName = uB.name;
    creditorName = uA.name;
    actionSummary = `${debtorName} 向 ${creditorName} 支付了 ¥ ${netAmount.toFixed(2)}`;
  } else if (userBPaidForA > userAPaidForB) {
    netAmount = Math.round((userBPaidForA - userAPaidForB) * 100) / 100;
    debtorId = uA.id;
    creditorId = uB.id;
    debtorName = uA.name;
    creditorName = uB.name;
    actionSummary = `${debtorName} 向 ${creditorName} 支付了 ¥ ${netAmount.toFixed(2)}`;
  } else {
    netAmount = 0;
    actionSummary = '双方代付金额刚好相互抵消，实际转账 ¥ 0.00';
  }

  return {
    user_a: uA,
    user_b: uB,
    user_a_paid_for_b: userAPaidForB,
    user_b_paid_for_a: userBPaidForA,
    net_amount: netAmount,
    debtor_id: debtorId,
    creditor_id: creditorId,
    debtor_name: debtorName,
    creditor_name: creditorName,
    action_summary: actionSummary,
    bill_slices: billSlices,
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
      proof_image_url: c.proof_image_url || null,
      proof_note: c.proof_note || null,
      confirmed_by: c.confirmed_by || null,
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
  const body = await c.req.json().catch(() => ({}));

  const proofImageUrl = body.proof_image_url || body.proofImageUrl;
  const proofNote = body.proof_note || body.proofNote || '';

  if (!proofImageUrl || typeof proofImageUrl !== 'string' || !proofImageUrl.trim()) {
    return c.json({ error: '必须上传付款凭证截图方可确认结清' }, 400);
  }

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

      // Record payment proof on this bill so both sides can see the screenshot in bill details
      const hasProof = await tx.queryOne(
        'SELECT id FROM payment_proofs WHERE bill_id = ? AND user_id = ?',
        billId, user.id
      );
      if (!hasProof) {
        await tx.run(
          `INSERT INTO payment_proofs (id, bill_id, user_id, image_url, note)
           VALUES (?, ?, ?, ?, ?)`,
          crypto.randomUUID(), billId, user.id, proofImageUrl.trim(), proofNote.trim() || '每周清账付款凭证'
        );
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
        await tx.run('UPDATE bills SET settled = true, settlement_cycle_id = ? WHERE id = ?', cycleId, billId);
      } else {
        await tx.run('UPDATE bills SET settlement_cycle_id = ? WHERE id = ?', cycleId, billId);
      }
    }

    const slice = await computeSettlementSlice(
      billsToClear.map((b) => b.id),
      user.id,
      otherUserId
    );
    const snapshotJson = JSON.stringify(slice);

    // Mark cycle as confirmed with proof and confirmed_by
    await tx.run(
      `UPDATE settlement_cycles
       SET status = 'confirmed',
           confirmed_at = CURRENT_TIMESTAMP,
           confirmed_by = ?,
           proof_image_url = ?,
           proof_note = ?,
           net_amount = ?,
           settled_bill_ids = ?,
           snapshot_data = ?
       WHERE id = ?`,
      user.id,
      proofImageUrl.trim(),
      proofNote.trim(),
      cycle.user_id === user.id ? latestDebt.netAmount : -latestDebt.netAmount,
      JSON.stringify(billsToClear.map((b) => b.id)),
      snapshotJson,
      cycleId
    );
  });

  return c.json({
    success: true,
    message: '清帐成功，付款凭证已归档，账目已同步更新',
    cleared_bills_count: billsToClear.length,
    proof_image_url: proofImageUrl.trim(),
  });
});

// GET /api/settlements/:id/bills - Get detailed breakdown of all bills covered by a settlement cycle
settlementsRoute.get('/:id/bills', async (c) => {
  const user = c.get('user');
  const cycleId = c.req.param('id');

  const cycle = await db.queryOne<any>(
    `SELECT sc.*,
            u.name as other_name, u.emoji as other_emoji, u.color as other_color,
            cb.name as confirmed_by_name, cb.emoji as confirmed_by_emoji
     FROM settlement_cycles sc
     JOIN users u ON u.id = (CASE WHEN sc.user_id = ? THEN sc.friend_id ELSE sc.user_id END)
     LEFT JOIN users cb ON cb.id = sc.confirmed_by
     WHERE sc.id = ? AND (sc.user_id = ? OR sc.friend_id = ?)`,
    user.id, cycleId, user.id, user.id
  );

  if (!cycle) {
    return c.json({ error: '结算单不存在' }, 404);
  }

  const otherUserId = cycle.user_id === user.id ? cycle.friend_id : cycle.user_id;

  let billIds: string[] = [];
  try {
    billIds = JSON.parse(cycle.settled_bill_ids || '[]');
  } catch {}

  // Fallback to bills where settlement_cycle_id matches
  if (!Array.isArray(billIds) || billIds.length === 0) {
    const bRows = await db.query<{ id: string }>('SELECT id FROM bills WHERE settlement_cycle_id = ?', cycleId);
    billIds = bRows.map(r => r.id);
  }

  let snapshot: SettlementSlice | null = null;
  if (cycle.snapshot_data) {
    try {
      const parsed = JSON.parse(cycle.snapshot_data);
      if (parsed && parsed.user_a && parsed.user_b) {
        if (parsed.user_a.id === user.id) {
          snapshot = parsed;
        } else {
          // Align perspective to current user (user_a is current user)
          snapshot = {
            user_a: parsed.user_b,
            user_b: parsed.user_a,
            user_a_paid_for_b: parsed.user_b_paid_for_a,
            user_b_paid_for_a: parsed.user_a_paid_for_b,
            net_amount: parsed.net_amount,
            debtor_id: parsed.debtor_id,
            creditor_id: parsed.creditor_id,
            debtor_name: parsed.debtor_name,
            creditor_name: parsed.creditor_name,
            action_summary: parsed.action_summary,
            bill_slices: (parsed.bill_slices || []).map((bs: any) => ({
              ...bs,
              user_a_share: bs.user_b_share,
              user_b_share: bs.user_a_share,
            })),
          };
        }
      }
    } catch {}
  }

  // If no snapshot exists yet (for older confirmed cycles), compute now and backfill asynchronously
  if (!snapshot && billIds.length > 0) {
    snapshot = await computeSettlementSlice(billIds, user.id, otherUserId);
    db.run('UPDATE settlement_cycles SET snapshot_data = ? WHERE id = ?', JSON.stringify(snapshot), cycleId).catch(() => {});
  }

  if (billIds.length === 0) {
    return c.json({
      cycle: {
        id: cycle.id,
        cycle_start: cycle.cycle_start,
        cycle_end: cycle.cycle_end,
        status: cycle.status,
        net_amount: Number(cycle.net_amount),
        proof_image_url: cycle.proof_image_url || null,
        proof_note: cycle.proof_note || null,
        confirmed_at: cycle.confirmed_at,
        confirmed_by: {
          id: cycle.confirmed_by,
          name: cycle.confirmed_by_name || '用户',
          emoji: cycle.confirmed_by_emoji || '👤',
        },
        other_user: {
          id: otherUserId,
          name: cycle.other_name,
          emoji: cycle.other_emoji,
          color: cycle.other_color,
        },
      },
      snapshot,
      bills: [],
    });
  }

  const placeholders = billIds.map(() => '?').join(',');
  const billRows = await db.query<any>(
    `SELECT b.id, b.title, b.icon, b.description, b.total_amount, b.date, b.payer_id, b.settled, b.color,
            u.name as payer_name, u.emoji as payer_emoji
     FROM bills b
     JOIN users u ON u.id = b.payer_id
     WHERE b.id IN (${placeholders})
     ORDER BY b.date DESC`,
    ...billIds
  );

  return c.json({
    cycle: {
      id: cycle.id,
      cycle_start: cycle.cycle_start,
      cycle_end: cycle.cycle_end,
      status: cycle.status,
      net_amount: Number(cycle.net_amount),
      proof_image_url: cycle.proof_image_url || null,
      proof_note: cycle.proof_note || null,
      confirmed_at: cycle.confirmed_at,
      confirmed_by: {
        id: cycle.confirmed_by,
        name: cycle.confirmed_by_name || '用户',
        emoji: cycle.confirmed_by_emoji || '👤',
      },
      other_user: {
        id: otherUserId,
        name: cycle.other_name,
        emoji: cycle.other_emoji,
        color: cycle.other_color,
      },
    },
    snapshot,
    bills: billRows.map((b) => {
      const bSlice = snapshot?.bill_slices?.find((bs) => bs.bill_id === b.id);
      return {
        id: b.id,
        title: b.title,
        icon: b.icon || '🧾',
        color: b.color || '#4F46E5',
        description: b.description || '',
        total_amount: Number(b.total_amount),
        date: b.date,
        payer_id: b.payer_id,
        payer_name: b.payer_name,
        payer_emoji: b.payer_emoji,
        settled: Boolean(b.settled),
        advance_payer_id: bSlice?.advance_payer_id || null,
        advance_amount: bSlice?.advance_amount || 0,
        my_share: bSlice ? bSlice.user_a_share : undefined,
        their_share: bSlice ? bSlice.user_b_share : undefined,
      };
    }),
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
