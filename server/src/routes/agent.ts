import { Hono } from 'hono';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { ADMIN_EMAIL } from './admin.js';
import { AppEnv } from '../types.js';

export const summaryRoute = new Hono<AppEnv>();
summaryRoute.use('*', authMiddleware);

export const contactsRoute = new Hono<AppEnv>();
contactsRoute.use('*', authMiddleware);

const roundCents = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── GET /api/summary ─────────────────────────────────────────────────────────
summaryRoute.get('/', async (c) => {
  const user = c.get('user');
  const isAdmin = user.email === ADMIN_EMAIL;
  const queryAll = isAdmin && (c.req.query('all') === 'true' || c.req.query('admin') === 'true');
  const targetUserId = isAdmin ? (c.req.query('target_user_id') || c.req.query('user_id')) : null;

  // 1. Admin System-Wide Overview
  if (queryAll) {
    const totalUsers = await db.queryOne<{ count: any }>('SELECT CAST(count(*) AS INTEGER) as count FROM users');
    const totalBills = await db.queryOne<{ count: any; volume: any }>(
      'SELECT CAST(count(*) AS INTEGER) as count, COALESCE(SUM(CAST(total_amount AS DOUBLE)), 0) as volume FROM bills'
    );
    const unsettledBills = await db.queryOne<{ count: any; volume: any }>(
      'SELECT CAST(count(*) AS INTEGER) as count, COALESCE(SUM(CAST(total_amount AS DOUBLE)), 0) as volume FROM bills WHERE settled = false'
    );
    const allUsers = await db.query<any>(
      'SELECT id, name, emoji, email, created_at FROM users ORDER BY created_at DESC'
    );
    const recentBills = await db.query<any>(
      `SELECT b.id, b.title, b.icon, CAST(b.total_amount AS DOUBLE) as total_amount, b.date, b.settled,
              u.name as payer_name, u.email as payer_email
       FROM bills b
       LEFT JOIN users u ON u.id = b.payer_id
       ORDER BY b.created_at DESC
       LIMIT 15`
    );

    return c.json({
      admin_mode: true,
      message: '管理员系统级全局全量账单透析视图 (Admin System Overview)',
      summary: {
        total_users: Number(totalUsers?.count || 0),
        total_bills: Number(totalBills?.count || 0),
        total_volume: roundCents(Number(totalBills?.volume || 0)),
        unsettled_bills_count: Number(unsettledBills?.count || 0),
        unsettled_volume: roundCents(Number(unsettledBills?.volume || 0)),
      },
      users: allUsers,
      recent_bills: recentBills.map((b) => ({
        ...b,
        total_amount: roundCents(Number(b.total_amount)),
      })),
    });
  }

  // 2. Personal Financial Summary (or targeted user for admin)
  const activeUserId = targetUserId || user.id;
  const activeUser = targetUserId
    ? await db.queryOne('SELECT * FROM users WHERE id = ?', targetUserId)
    : user;

  if (!activeUser) {
    return c.json({ error: 'Target user not found' }, 404);
  }

  // Fetch all bills related to activeUserId
  const billRows = await db.query<any>(
    `SELECT DISTINCT b.id, b.title, b.icon, CAST(b.total_amount AS DOUBLE) as total_amount,
                     b.date, b.payer_id, b.settled, u.name as payer_name, u.emoji as payer_emoji, u.email as payer_email
     FROM bills b
     LEFT JOIN users u ON u.id = b.payer_id
     LEFT JOIN bill_items bi ON bi.bill_id = b.id
     LEFT JOIN bill_item_members bim ON bim.item_id = bi.id
     WHERE b.payer_id = ? OR bim.user_id = ?
     ORDER BY b.date DESC, b.created_at DESC`,
    activeUserId, activeUserId
  );

  const billIds = billRows.map((b) => b.id);

  // Fetch items & members for these bills
  let itemRows: any[] = [];
  let proofs: any[] = [];
  let manuals: any[] = [];

  if (billIds.length > 0) {
    const placeholders = billIds.map(() => '?').join(',');
    itemRows = await db.query<any>(
      `SELECT bi.id as item_id, bi.bill_id, CAST(bi.price AS DOUBLE) as price, bi.qty,
              bim.user_id, u.name as member_name, u.emoji as member_emoji, u.email as member_email
       FROM bill_items bi
       LEFT JOIN bill_item_members bim ON bim.item_id = bi.id
       LEFT JOIN users u ON u.id = bim.user_id
       WHERE bi.bill_id IN (${placeholders})`,
      ...billIds
    );
    proofs = await db.query<any>(
      `SELECT bill_id, user_id FROM payment_proofs WHERE bill_id IN (${placeholders})`,
      ...billIds
    );
    manuals = await db.query<any>(
      `SELECT bill_id, member_id as user_id FROM manual_payments WHERE bill_id IN (${placeholders}) AND settled = true`,
      ...billIds
    );
  }

  // Pre-index proofs and manuals: bill_id -> Set(user_id)
  const proofMap = new Map<string, Set<string>>();
  proofs.forEach((p) => {
    if (!proofMap.has(p.bill_id)) proofMap.set(p.bill_id, new Set());
    proofMap.get(p.bill_id)!.add(p.user_id);
  });
  const manualMap = new Map<string, Set<string>>();
  manuals.forEach((m) => {
    if (!manualMap.has(m.bill_id)) manualMap.set(m.bill_id, new Set());
    manualMap.get(m.bill_id)!.add(m.user_id);
  });

  // Group items by bill_id
  const billItemsMap = new Map<string, Map<string, { price: number; qty: number; members: any[] }>>();
  itemRows.forEach((r) => {
    if (!billItemsMap.has(r.bill_id)) billItemsMap.set(r.bill_id, new Map());
    const im = billItemsMap.get(r.bill_id)!;
    if (!im.has(r.item_id)) {
      im.set(r.item_id, { price: Number(r.price), qty: Number(r.qty), members: [] });
    }
    if (r.user_id) {
      im.get(r.item_id)!.members.push({ id: r.user_id, name: r.member_name, emoji: r.member_emoji, email: r.member_email });
    }
  });

  // Calculate user's aggregate finances
  let myConsumption = 0;
  let totalFronted = 0;
  let reimbursedToMe = 0;
  let pendingToMe = 0;
  let iOweOthers = 0;

  const friendsLedgerMap = new Map<string, {
    friend_id: string;
    name: string;
    emoji: string;
    email: string;
    they_owe_me: number;
    i_owe_them: number;
    net_balance: number;
    unsettled_bills_count: number;
  }>();

  const actionItems: string[] = [];
  const unsettledBillsList: any[] = [];

  for (const b of billRows) {
    const isPayer = b.payer_id === activeUserId;
    const isBillSettled = Boolean(b.settled);
    const proofSet = proofMap.get(b.id) || new Set();
    const manualSet = manualMap.get(b.id) || new Set();

    const im = billItemsMap.get(b.id);
    const items = im ? Array.from(im.values()) : [];

    // Calculate share per member on this bill
    const billMemberShares = new Map<string, { id: string; name: string; emoji: string; email: string; share: number }>();
    for (const item of items) {
      const mems = item.members || [];
      const per = mems.length > 0 ? (item.price * item.qty) / mems.length : 0;
      for (const m of mems) {
        if (!billMemberShares.has(m.id)) {
          billMemberShares.set(m.id, { id: m.id, name: m.name, emoji: m.emoji, email: m.email, share: 0 });
        }
        billMemberShares.get(m.id)!.share += per;
      }
    }

    const myShare = roundCents(billMemberShares.get(activeUserId)?.share || 0);
    myConsumption += myShare;

    if (isPayer) {
      totalFronted += b.total_amount;
      const nonPayerMembers = Array.from(billMemberShares.values()).filter((m) => m.id !== activeUserId);
      let billHasUnsettled = false;

      for (const m of nonPayerMembers) {
        const memPaid = isBillSettled || proofSet.has(m.id) || manualSet.has(m.id);
        const mShare = roundCents(m.share);

        if (memPaid) {
          reimbursedToMe += mShare;
        } else {
          pendingToMe += mShare;
          billHasUnsettled = true;

          // Record in friend ledger
          if (!friendsLedgerMap.has(m.id)) {
            friendsLedgerMap.set(m.id, {
              friend_id: m.id, name: m.name, emoji: m.emoji, email: m.email,
              they_owe_me: 0, i_owe_them: 0, net_balance: 0, unsettled_bills_count: 0
            });
          }
          const f = friendsLedgerMap.get(m.id)!;
          f.they_owe_me += mShare;
          f.unsettled_bills_count += 1;

          actionItems.push(`[待催款] ${m.name} 尚未结清账单「${b.title}」，待付你 ¥${mShare.toFixed(2)}`);
        }
      }

      if (billHasUnsettled) {
        unsettledBillsList.push({
          id: b.id,
          title: b.title,
          icon: b.icon,
          date: b.date,
          total_amount: roundCents(b.total_amount),
          role: 'payer',
          status: 'pending_collection',
        });
      }
    } else {
      // User is a participant (borrower / owes payer)
      const payerId = b.payer_id;
      const iPaid = isBillSettled || proofSet.has(activeUserId) || manualSet.has(activeUserId);

      if (!iPaid && myShare > 0) {
        iOweOthers += myShare;

        if (payerId) {
          if (!friendsLedgerMap.has(payerId)) {
            friendsLedgerMap.set(payerId, {
              friend_id: payerId, name: b.payer_name || '付款人', emoji: b.payer_emoji || '👤',
              email: b.payer_email || '', they_owe_me: 0, i_owe_them: 0, net_balance: 0, unsettled_bills_count: 0
            });
          }
          const f = friendsLedgerMap.get(payerId)!;
          f.i_owe_them += myShare;
          f.unsettled_bills_count += 1;

          actionItems.push(`[待付款] 你在「${b.title}」中由 ${b.payer_name} 代付，需付给对方 ¥${myShare.toFixed(2)}`);
        }

        unsettledBillsList.push({
          id: b.id,
          title: b.title,
          icon: b.icon,
          date: b.date,
          total_amount: roundCents(b.total_amount),
          my_share: myShare,
          role: 'member',
          status: 'pending_payment',
          payer: { id: b.payer_id, name: b.payer_name, emoji: b.payer_emoji },
        });
      }
    }
  }

  // Final ledger calculation
  const friendsLedger = Array.from(friendsLedgerMap.values()).map((f) => {
    const theyOweMe = roundCents(f.they_owe_me);
    const iOweThem = roundCents(f.i_owe_them);
    return {
      friend_id: f.friend_id,
      name: f.name,
      emoji: f.emoji,
      email: f.email,
      they_owe_me: theyOweMe,
      i_owe_them: iOweThem,
      net_balance: roundCents(theyOweMe - iOweThem),
      unsettled_bills_count: f.unsettled_bills_count,
    };
  });

  const netBalance = roundCents(pendingToMe - iOweOthers);

  return c.json({
    user: {
      id: activeUser.id,
      name: activeUser.name,
      email: activeUser.email,
      emoji: activeUser.emoji,
    },
    financial_overview: {
      net_balance: netBalance, // positive: net money to receive; negative: net money to pay out
      my_total_consumption: roundCents(myConsumption),
      total_fronted: roundCents(totalFronted),
      reimbursed_to_me: roundCents(reimbursedToMe),
      pending_to_me: roundCents(pendingToMe),
      i_owe_others: roundCents(iOweOthers),
      unsettled_bills_count: unsettledBillsList.length,
      total_bills_involved: billRows.length,
    },
    friends_ledger: friendsLedger,
    action_items: actionItems,
    unsettled_bills: unsettledBillsList.slice(0, 10),
  });
});

// ── GET /api/contacts ────────────────────────────────────────────────────────
contactsRoute.get('/', async (c) => {
  const user = c.get('user');
  const isAdmin = user.email === ADMIN_EMAIL;
  const queryAll = isAdmin && (c.req.query('all') === 'true' || c.req.query('admin') === 'true');

  if (queryAll) {
    // Admin Backdoor: list all users in the system
    const allUsers = await db.query<any>(
      `SELECT u.id, u.name, u.emoji, u.color, u.email, u.created_at,
              CAST((SELECT count(*) FROM bills WHERE payer_id = u.id) AS INTEGER) as bills_created_count
       FROM users u
       ORDER BY u.created_at DESC`
    );
    return c.json({
      admin_mode: true,
      contacts: allUsers,
      total: allUsers.length,
    });
  }

  // Confirmed bidirectional friendships
  const r1 = await db.query<any>(
    "SELECT id, user_b as friend_id, alias_a as alias FROM friendships WHERE user_a = ? AND status = 'accepted'",
    user.id
  );
  const r2 = await db.query<any>(
    "SELECT id, user_a as friend_id, alias_b as alias FROM friendships WHERE user_b = ? AND status = 'accepted'",
    user.id
  );

  const friendMap: Record<string, { friendship_id: string; alias?: string }> = {};
  r1.forEach((r) => { friendMap[r.friend_id] = { friendship_id: r.id, alias: r.alias || undefined }; });
  r2.forEach((r) => { friendMap[r.friend_id] = { friendship_id: r.id, alias: r.alias || undefined }; });

  const friendIds = Object.keys(friendMap);
  if (friendIds.length === 0) {
    return c.json({ contacts: [], total: 0 });
  }

  const contacts: any[] = [];
  for (const fId of friendIds) {
    const u = await db.queryOne('SELECT id, name, emoji, color, email FROM users WHERE id = ?', fId);
    if (u) {
      const entry = friendMap[fId];
      contacts.push({
        id: u.id,
        name: u.name,
        emoji: u.emoji,
        color: u.color,
        email: u.email,
        alias: entry.alias,
        friendship_id: entry.friendship_id,
      });
    }
  }

  return c.json({ contacts, total: contacts.length });
});
