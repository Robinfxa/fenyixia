import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppEnv } from '../types.js';

export const tokensRoute = new Hono<AppEnv>();
tokensRoute.use('*', authMiddleware);

// GET /api/tokens
tokensRoute.get('/', async (c) => {
  const user = c.get('user');
  const token = await db.queryOne(
    'SELECT id, token, name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    user.id
  );
  const publicApiSetting = await db.queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'public_api_base_url'"
  );
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3001';
  const detectedUrl = `${proto}://${host}/api`;

  return c.json({
    token: token || null,
    api_base_url: publicApiSetting?.value || detectedUrl,
    is_custom_url: Boolean(publicApiSetting?.value),
  });
});

// POST /api/tokens
tokensRoute.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const name = body.name || 'AI Token';

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM api_tokens WHERE user_id = ?', user.id);
    const tokenId = crypto.randomUUID();
    const tokenVal = `fyx_${crypto.randomBytes(24).toString('hex')}`;
    await tx.run(
      'INSERT INTO api_tokens (id, user_id, token, name) VALUES (?, ?, ?, ?)',
      tokenId, user.id, tokenVal, name
    );
  });

  const created = await db.queryOne(
    'SELECT id, token, name, created_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    user.id
  );
  const publicApiSetting = await db.queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'public_api_base_url'"
  );
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3001';
  const detectedUrl = `${proto}://${host}/api`;

  return c.json({
    token: created,
    api_base_url: publicApiSetting?.value || detectedUrl,
    is_custom_url: Boolean(publicApiSetting?.value),
  });
});

// DELETE /api/tokens
tokensRoute.delete('/', async (c) => {
  const user = c.get('user');
  await db.run('DELETE FROM api_tokens WHERE user_id = ?', user.id);
  return c.json({ success: true });
});

