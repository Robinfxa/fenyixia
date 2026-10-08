import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppEnv } from '../types.js';

export const tagsRoute = new Hono<AppEnv>();
tagsRoute.use('*', authMiddleware);

// GET /api/tags - Get all tags for current user
tagsRoute.get('/', async (c) => {
  const user = c.get('user');
  const tags = await db.query<any>(
    'SELECT id, name, color, created_at FROM user_tags WHERE user_id = ? ORDER BY created_at ASC',
    user.id
  );
  return c.json({ tags, data: tags });
});

// POST /api/tags - Create a tag
tagsRoute.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { name, color = '#0A84FF' } = body;

  if (!name) return c.json({ error: 'Name is required' }, 400);

  const existing = await db.queryOne(
    'SELECT id FROM user_tags WHERE user_id = ? AND name = ?',
    user.id, name
  );
  if (existing) {
    return c.json({ error: '标签已存在' }, 400);
  }

  const tagId = crypto.randomUUID();
  await db.run(
    'INSERT INTO user_tags (id, user_id, name, color) VALUES (?, ?, ?, ?)',
    tagId, user.id, name, color
  );

  const created = await db.queryOne('SELECT id, name, color, created_at FROM user_tags WHERE id = ?', tagId);
  return c.json({ tag: created, data: created }, 201);
});

// PUT /api/tags/:id - Update tag
tagsRoute.put('/:id', async (c) => {
  const user = c.get('user');
  const tagId = c.req.param('id');
  const body = await c.req.json();
  const { name, color } = body;

  const existing = await db.queryOne('SELECT id FROM user_tags WHERE id = ? AND user_id = ?', tagId, user.id);
  if (!existing) {
    return c.json({ error: '标签不存在或无权修改' }, 404);
  }

  await db.run(
    'UPDATE user_tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ? AND user_id = ?',
    name, color, tagId, user.id
  );
  return c.json({ success: true });
});

// DELETE /api/tags/:id - Delete tag
tagsRoute.delete('/:id', async (c) => {
  const user = c.get('user');
  const tagId = c.req.param('id');

  const existing = await db.queryOne('SELECT id FROM user_tags WHERE id = ? AND user_id = ?', tagId, user.id);
  if (!existing) {
    return c.json({ error: '标签不存在或无权删除' }, 404);
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM friend_tags WHERE tag_id = ? AND user_id = ?', tagId, user.id);
    await tx.run('DELETE FROM user_tags WHERE id = ? AND user_id = ?', tagId, user.id);
  });
  return c.json({ success: true });
});

// GET /api/tags/friend/:friendshipId - Get tags for a friend
tagsRoute.get('/friend/:friendshipId', async (c) => {
  const user = c.get('user');
  const friendshipId = c.req.param('friendshipId');
  const friendship = await db.queryOne(
    'SELECT * FROM friendships WHERE id = ? AND (user_a = ? OR user_b = ?)',
    friendshipId, user.id, user.id
  );
  if (!friendship) return c.json({ tags: [] });

  const tags = await db.query<any>(
    `SELECT t.id, t.name, t.color, t.created_at
     FROM friend_tags ft
     JOIN user_tags t ON t.id = ft.tag_id
     WHERE ft.friend_id = ? AND ft.user_id = ?`,
    friendshipId, user.id
  );

  return c.json({ tags, data: tags });
});

// PUT /api/tags/friend/:friendshipId - Set tags for a friend
tagsRoute.put('/friend/:friendshipId', async (c) => {
  const user = c.get('user');
  const friendshipId = c.req.param('friendshipId');
  const body = await c.req.json();
  const tagIds: string[] = body.tag_ids || body.tagIds || [];

  // Verify user is part of this friendship
  const friendship = await db.queryOne(
    'SELECT id FROM friendships WHERE id = ? AND (user_a = ? OR user_b = ?)',
    friendshipId, user.id, user.id
  );
  if (!friendship) {
    return c.json({ error: '好友关系不存在或无权操作' }, 403);
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM friend_tags WHERE friend_id = ? AND user_id = ?', friendshipId, user.id);
    for (const tagId of tagIds) {
      // Verify the tag belongs to the current user
      const ownTag = await tx.queryOne('SELECT id FROM user_tags WHERE id = ? AND user_id = ?', tagId, user.id);
      if (ownTag) {
        await tx.run(
          'INSERT INTO friend_tags (tag_id, friend_id, user_id) VALUES (?, ?, ?)',
          tagId, friendshipId, user.id
        );
      }
    }
  });

  return c.json({ success: true });
});

// GET /api/tags/:id/friends - Get all friends with given tag
tagsRoute.get('/:id/friends', async (c) => {
  const user = c.get('user');
  const tagId = c.req.param('id');

  // Verify tag belongs to the current user
  const ownTag = await db.queryOne('SELECT id FROM user_tags WHERE id = ? AND user_id = ?', tagId, user.id);
  if (!ownTag) {
    return c.json({ friends: [], data: [] });
  }

  const rows = await db.query<any>(
    `SELECT DISTINCT u.id, u.name, u.emoji, u.color, u.email
     FROM friend_tags ft
     JOIN friendships f ON f.id = ft.friend_id
     JOIN users u ON (u.id = f.user_a OR u.id = f.user_b)
     WHERE ft.tag_id = ? AND ft.user_id = ? AND u.id != ?`,
    tagId, user.id, user.id
  );

  return c.json({ friends: rows, data: rows });
});

// PUT /api/tags/:id/friends - Set all friends with given tag
tagsRoute.put('/:id/friends', async (c) => {
  const user = c.get('user');
  const tagId = c.req.param('id');
  const body = await c.req.json();
  const userIds: string[] = body.user_ids || body.userIds || [];

  // Verify tag belongs to the current user
  const ownTag = await db.queryOne('SELECT id FROM user_tags WHERE id = ? AND user_id = ?', tagId, user.id);
  if (!ownTag) {
    return c.json({ error: '标签不存在或无权操作' }, 403);
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM friend_tags WHERE tag_id = ? AND user_id = ?', tagId, user.id);
    for (const uid of userIds) {
      const friendship = await tx.queryOne<any>(
        `SELECT id FROM friendships
         WHERE ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))
         AND status = 'accepted'`,
        user.id, uid, uid, user.id
      );
      if (friendship) {
        await tx.run(
          'INSERT INTO friend_tags (tag_id, friend_id, user_id) VALUES (?, ?, ?)',
          tagId, friendship.id, user.id
        );
      }
    }
  });

  return c.json({ success: true });
});

