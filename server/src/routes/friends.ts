import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppEnv } from '../types.js';

export const friendsRoute = new Hono<AppEnv>();
friendsRoute.use('*', authMiddleware);

// GET /api/friends - List confirmed friends with alias
friendsRoute.get('/', async (c) => {
  const user = c.get('user');

  const r1 = await db.query<any>(
    "SELECT id, user_b as friend_id, alias_a as alias FROM friendships WHERE user_a = ? AND status = 'accepted'",
    user.id
  );
  const r2 = await db.query<any>(
    "SELECT id, user_a as friend_id, alias_b as alias FROM friendships WHERE user_b = ? AND status = 'accepted'",
    user.id
  );

  const friendMap: Record<string, { friendship_id: string; alias?: string }> = {};
  r1.forEach((r) => {
    friendMap[r.friend_id] = { friendship_id: r.id, alias: r.alias || undefined };
  });
  r2.forEach((r) => {
    friendMap[r.friend_id] = { friendship_id: r.id, alias: r.alias || undefined };
  });

  const friendIds = Object.keys(friendMap);
  if (friendIds.length === 0) {
    return c.json({ friends: [] });
  }

  const friends: any[] = [];
  for (const fId of friendIds) {
    const u = await db.queryOne('SELECT id, name, emoji, color, email FROM users WHERE id = ?', fId);
    if (u) {
      const entry = friendMap[fId];
      friends.push({
        id: u.id,
        name: u.name,
        emoji: u.emoji,
        color: u.color,
        email: u.email,
        friendship_id: entry.friendship_id,
        alias: entry.alias,
      });
    }
  }

  return c.json({ friends, data: friends });
});

// PUT /api/friends/:friendshipId/alias - Update alias
friendsRoute.put('/:friendshipId/alias', async (c) => {
  const user = c.get('user');
  const friendshipId = c.req.param('friendshipId');
  const body = await c.req.json();
  const alias = body.alias?.trim() || null;

  const friendship = await db.queryOne('SELECT * FROM friendships WHERE id = ?', friendshipId);
  if (!friendship) {
    return c.json({ error: '好友关系不存在' }, 404);
  }

  if (friendship.user_a === user.id) {
    await db.run('UPDATE friendships SET alias_a = ? WHERE id = ?', alias, friendshipId);
  } else if (friendship.user_b === user.id) {
    await db.run('UPDATE friendships SET alias_b = ? WHERE id = ?', alias, friendshipId);
  } else {
    return c.json({ error: '无权修改此好友备注' }, 403);
  }

  return c.json({ success: true, alias });
});

// GET /api/friends/requests/received - Incoming requests
friendsRoute.get('/requests/received', async (c) => {
  const user = c.get('user');
  const requests = await db.query<any>(
    `SELECT fr.id, fr.from_user_id as from_user, fr.to_user_id as to_user, fr.status, fr.created_at,
            u.id as user_id, u.name as user_name, u.emoji as user_emoji
     FROM friend_requests fr
     JOIN users u ON u.id = fr.from_user_id
     WHERE fr.to_user_id = ? AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    user.id
  );

  const formatted = requests.map((r) => ({
    id: r.id,
    from_user: r.from_user,
    to_user: r.to_user,
    status: r.status,
    created_at: r.created_at,
    user: { id: r.user_id, name: r.user_name, emoji: r.user_emoji },
  }));

  return c.json({ requests: formatted, data: formatted });
});

// GET /api/friends/requests/sent - Outgoing requests
friendsRoute.get('/requests/sent', async (c) => {
  const user = c.get('user');
  const requests = await db.query<any>(
    `SELECT fr.id, fr.from_user_id as from_user, fr.to_user_id as to_user, fr.status, fr.created_at,
            u.id as user_id, u.name as user_name, u.emoji as user_emoji
     FROM friend_requests fr
     JOIN users u ON u.id = fr.to_user_id
     WHERE fr.from_user_id = ? AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    user.id
  );

  const formatted = requests.map((r) => ({
    id: r.id,
    from_user: r.from_user,
    to_user: r.to_user,
    status: r.status,
    created_at: r.created_at,
    user: { id: r.user_id, name: r.user_name, emoji: r.user_emoji },
  }));

  return c.json({ requests: formatted, data: formatted });
});

// POST /api/friends/add - Add friend by email
friendsRoute.post('/add', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const email = body.email?.trim().toLowerCase();

  if (!email) return c.json({ error: '请输入邮箱' }, 400);
  if (email === user.email) return c.json({ error: '不能添加自己为好友' }, 400);

  const target = await db.queryOne('SELECT id, name FROM users WHERE email = ?', email);

  if (target) {
    const [a, b] = [user.id, target.id].sort();
    const existing = await db.queryOne('SELECT id FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    if (existing) {
      return c.json({ type: 'already_friends' });
    }

    const reverseReq = await db.queryOne(
      "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'",
      target.id, user.id
    );

    if (reverseReq) {
      // Auto accept
      await db.transaction(async (tx) => {
        await tx.run("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", reverseReq.id);
        await tx.run(
          "INSERT INTO friendships (id, user_a, user_b, status) VALUES (?, ?, ?, 'accepted')",
          crypto.randomUUID(), a, b
        );
      });
      return c.json({ type: 'auto_accepted' });
    }

    const sentReq = await db.queryOne(
      "SELECT id FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'",
      user.id, target.id
    );
    if (sentReq) {
      return c.json({ type: 'already_requested' });
    }

    await db.run(
      "INSERT INTO friend_requests (id, from_user_id, to_user_id, status) VALUES (?, ?, ?, 'pending')",
      crypto.randomUUID(), user.id, target.id
    );
    return c.json({ type: 'request_sent' });
  }

  // Target not yet registered: Create invitation
  const existingInvite = await db.queryOne(
    "SELECT id, token FROM invitations WHERE inviter_id = ? AND claimed_by = ? AND status = 'pending'",
    user.id, email
  );
  if (existingInvite) {
    return c.json({ type: 'already_invited', email });
  }

  const token = crypto.randomBytes(16).toString('hex');
  await db.run(
    "INSERT INTO invitations (id, inviter_id, token, claimed_by) VALUES (?, ?, ?, ?)",
    crypto.randomUUID(), user.id, token, email
  );

  return c.json({ type: 'invited', email, token });
});

// POST /api/friends/requests/:id/accept - Accept request
friendsRoute.post('/requests/:id/accept', async (c) => {
  const user = c.get('user');
  const reqId = c.req.param('id');

  const req = await db.queryOne('SELECT * FROM friend_requests WHERE id = ?', reqId);
  if (!req || req.to_user_id !== user.id) {
    return c.json({ error: '申请不存在或无权操作' }, 404);
  }

  const [a, b] = [req.from_user_id, req.to_user_id].sort();
  await db.transaction(async (tx) => {
    await tx.run("UPDATE friend_requests SET status = 'accepted' WHERE id = ?", reqId);
    const existing = await tx.queryOne('SELECT id FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    if (!existing) {
      await tx.run(
        "INSERT INTO friendships (id, user_a, user_b, status) VALUES (?, ?, ?, 'accepted')",
        crypto.randomUUID(), a, b
      );
    }
  });

  return c.json({ success: true });
});

// POST /api/friends/requests/:id/reject - Reject request
friendsRoute.post('/requests/:id/reject', async (c) => {
  const user = c.get('user');
  const reqId = c.req.param('id');

  const req = await db.queryOne('SELECT * FROM friend_requests WHERE id = ?', reqId);
  if (!req || req.to_user_id !== user.id) {
    return c.json({ error: '申请不存在或无权操作' }, 404);
  }

  await db.run("UPDATE friend_requests SET status = 'rejected' WHERE id = ?", reqId);
  return c.json({ success: true });
});

// DELETE /api/friends/:friendshipId - Delete a friend
friendsRoute.delete('/:friendshipId', async (c) => {
  const user = c.get('user');
  const friendshipId = c.req.param('friendshipId');

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM friend_tags WHERE friend_id = ?', friendshipId);
    await tx.run(
      'DELETE FROM friendships WHERE id = ? AND (user_a = ? OR user_b = ?)',
      friendshipId,
      user.id,
      user.id
    );
  });

  return c.json({ success: true });
});

