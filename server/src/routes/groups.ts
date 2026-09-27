import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppEnv } from '../types.js';

export const groupsRoute = new Hono<AppEnv>();
groupsRoute.use('*', authMiddleware);

// GET /api/groups - List all groups for current user
groupsRoute.get('/', async (c) => {
  const user = c.get('user');

  const groups = await db.query<any>(
    `SELECT DISTINCT g.id, g.name, g.emoji, g.created_by as owner_id, g.created_at
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.user_id = ?
     ORDER BY g.created_at DESC`,
    user.id
  );

  const result: any[] = [];
  for (const g of groups) {
    const memberRows = await db.query<any>(
      `SELECT u.id, u.name, u.emoji, u.color
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?`,
      g.id
    );

    result.push({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      owner_id: g.owner_id,
      created_at: g.created_at,
      members: memberRows,
    });
  }

  return c.json({ groups: result, data: result });
});

// POST /api/groups - Create a group
groupsRoute.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { name, emoji = '👥', member_ids = [] } = body;

  if (!name) {
    return c.json({ error: 'Group name is required' }, 400);
  }

  const groupId = crypto.randomUUID();
  const allMemberIds = [...new Set([user.id, ...(member_ids || [])])];

  await db.transaction(async (tx) => {
    await tx.run(
      'INSERT INTO groups (id, name, emoji, created_by) VALUES (?, ?, ?, ?)',
      groupId, name, emoji, user.id
    );

    for (const uid of allMemberIds) {
      await tx.run(
        'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        groupId, uid, uid === user.id ? 'owner' : 'member'
      );
    }
  });

  const members = await db.query<any>(
    `SELECT u.id, u.name, u.emoji, u.color
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ?`,
    groupId
  );

  const group = {
    id: groupId,
    name,
    emoji,
    owner_id: user.id,
    created_at: new Date().toISOString(),
    members,
  };

  return c.json({ group, data: group }, 201);
});

// PUT /api/groups/:id - Update group name/emoji
groupsRoute.put('/:id', async (c) => {
  const user = c.get('user');
  const groupId = c.req.param('id');
  const body = await c.req.json();
  const { name, emoji } = body;

  const group = await db.queryOne('SELECT * FROM groups WHERE id = ?', groupId);
  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const isMember = await db.queryOne(
    'SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?',
    groupId, user.id
  );
  if (!isMember && group.created_by !== user.id) {
    return c.json({ error: '无权修改此群组' }, 403);
  }

  await db.run(
    'UPDATE groups SET name = COALESCE(?, name), emoji = COALESCE(?, emoji) WHERE id = ?',
    name, emoji, groupId
  );

  return c.json({ success: true });
});

// DELETE /api/groups/:id - Delete group
groupsRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const groupId = c.req.param('id');

  const group = await db.queryOne('SELECT * FROM groups WHERE id = ?', groupId);
  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  // Only creator or owner can delete group
  const isOwner = group.created_by === user.id || await db.queryOne(
    "SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'owner'",
    groupId, user.id
  );
  if (!isOwner) {
    return c.json({ error: '只有群主可以解散群组' }, 403);
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM group_members WHERE group_id = ?', groupId);
    await tx.run('DELETE FROM groups WHERE id = ?', groupId);
  });

  return c.json({ success: true });
});

// POST /api/groups/:id/members - Add members
groupsRoute.post('/:id/members', async (c) => {
  const user = c.get('user');
  const groupId = c.req.param('id');
  const body = await c.req.json();
  const userIds: string[] = body.user_ids || body.userIds || [];

  const group = await db.queryOne('SELECT * FROM groups WHERE id = ?', groupId);
  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const isMember = await db.queryOne(
    'SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?',
    groupId, user.id
  );
  if (!isMember && group.created_by !== user.id) {
    return c.json({ error: '只有群成员可以添加成员' }, 403);
  }

  for (const uid of userIds) {
    const exists = await db.queryOne(
      'SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?',
      groupId, uid
    );
    if (!exists) {
      await db.run('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)', groupId, uid, 'member');
    }
  }

  return c.json({ success: true });
});

// DELETE /api/groups/:id/members/:userId - Remove member
groupsRoute.delete('/:id/members/:userId', async (c) => {
  const user = c.get('user');
  const groupId = c.req.param('id');
  const targetUserId = c.req.param('userId');

  const group = await db.queryOne('SELECT * FROM groups WHERE id = ?', groupId);
  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  // Allowed if removing oneself, or if user is owner
  const isOwner = group.created_by === user.id || await db.queryOne(
    "SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'owner'",
    groupId, user.id
  );
  if (user.id !== targetUserId && !isOwner) {
    return c.json({ error: '无权移除该成员' }, 403);
  }

  await db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, targetUserId);
  return c.json({ success: true });
});

// PUT /api/groups/:id/members - Set all members
groupsRoute.put('/:id/members', async (c) => {
  const user = c.get('user');
  const groupId = c.req.param('id');
  const body = await c.req.json();
  const userIds: string[] = body.user_ids || body.userIds || [];

  const group = await db.queryOne('SELECT * FROM groups WHERE id = ?', groupId);
  if (!group) {
    return c.json({ error: 'Group not found' }, 404);
  }

  const isMember = await db.queryOne(
    'SELECT group_id FROM group_members WHERE group_id = ? AND user_id = ?',
    groupId, user.id
  );
  if (!isMember && group.created_by !== user.id) {
    return c.json({ error: '无权编辑群组成员' }, 403);
  }

  const allIds = [...new Set([user.id, ...userIds])];

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM group_members WHERE group_id = ?', groupId);
    for (const uid of allIds) {
      await tx.run(
        'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        groupId,
        uid,
        uid === user.id ? 'owner' : 'member'
      );
    }
  });

  return c.json({ success: true });
});

