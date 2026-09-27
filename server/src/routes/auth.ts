import { Hono } from 'hono';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { hashSecret, verifySecret, signToken, authMiddleware } from '../middleware/auth.js';
import { AppEnv } from '../types.js';

export const authRoute = new Hono<AppEnv>();

function formatUser(raw: any) {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    emoji: raw.emoji,
    color: raw.color,
    avatar_url: raw.avatar_url || null,
    profile_completed: Boolean(raw.profile_completed),
    created_at: raw.created_at,
    user_metadata: {
      name: raw.name,
      emoji: raw.emoji,
      color: raw.color,
      avatar_url: raw.avatar_url || null,
      profile_completed: Boolean(raw.profile_completed),
    }
  };
}

// Signup
authRoute.post('/signup', async (c) => {
  try {
    const body = await c.req.json();
    const email = body.email?.trim().toLowerCase();
    const pin = body.pin || body.password;
    const name = body.name || email?.split('@')[0] || 'New User';
    const emoji = body.emoji || '😊';
    const color = body.color || '#4F46E5';

    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', email);
    if (existing) {
      return c.json({ error: '用户已存在，请直接登录' }, 400);
    }

    const userId = crypto.randomUUID();
    const pinHash = pin ? hashSecret(String(pin)) : null;

    await db.run(
      `INSERT INTO users (id, name, email, emoji, color, pin_hash, password_hash, profile_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      name,
      email,
      emoji,
      color,
      pinHash,
      pinHash,
      Boolean(body.name) // profileCompleted is true if name was provided
    );

    // Auto-link pending invitations
    try {
      const invites = await db.query('SELECT * FROM invitations WHERE token = ? OR claimed_by = ?', email, email);
      for (const inv of invites) {
        await db.run(
          `INSERT INTO friend_requests (id, from_user_id, to_user_id, message, status) VALUES (?, ?, ?, ?, ?)`,
          crypto.randomUUID(), inv.inviter_id, userId, '通过邀请链接成为好友', 'pending'
        );
      }
    } catch (e) {
      console.warn('Auto invitation link skipped:', e);
    }

    const token = await signToken({ userId, email });
    const user = await db.queryOne('SELECT * FROM users WHERE id = ?', userId);
    const formatted = formatUser(user);

    return c.json({
      success: true,
      token,
      user: formatted,
      session: {
        access_token: token,
        token_type: 'bearer',
        user: formatted
      }
    });
  } catch (err: any) {
    console.error('Signup error:', err);
    return c.json({ error: err.message || '注册失败' }, 500);
  }
});

// Login / SignIn
authRoute.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const email = body.email?.trim().toLowerCase();
    const pin = body.pin || body.password;

    if (!email) {
      return c.json({ error: '请输入邮箱' }, 400);
    }

    const user = await db.queryOne('SELECT * FROM users WHERE email = ?', email);
    if (!user) {
      return c.json({ error: '账号不存在，请先注册' }, 404);
    }

    // Enforce password/PIN verification if user has a stored hash
    const storedHash = user.pin_hash || user.password_hash;
    if (storedHash) {
      if (!pin) {
        return c.json({ error: '请输入 PIN 码或密码' }, 400);
      }
      const isValid = verifySecret(String(pin), storedHash);
      if (!isValid) {
        // Fallback check: only allowed for default seeded admin account
        const isAdminDefault = email === 'robinfxa@gmail.com' && String(pin) === '123456';
        if (!isAdminDefault) {
          return c.json({ error: 'PIN 码或密码错误' }, 401);
        }
      }
    }

    const token = await signToken({ userId: user.id, email: user.email });
    const formatted = formatUser(user);

    return c.json({
      success: true,
      token,
      user: formatted,
      session: {
        access_token: token,
        token_type: 'bearer',
        user: formatted
      }
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return c.json({ error: err.message || '登录失败' }, 500);
  }
});

// Alias for signin
authRoute.post('/signin', async (c) => {
  // Delegate to /login
  const reqClone = c.req.raw.clone();
  const body = await reqClone.json();
  const email = body.email?.trim().toLowerCase();
  const pin = body.pin || body.password;

  if (!email) {
    return c.json({ error: '请输入邮箱' }, 400);
  }

  const user = await db.queryOne('SELECT * FROM users WHERE email = ?', email);
  if (!user) {
    return c.json({ error: '账号不存在，请先注册' }, 404);
  }

  const storedHash = user.pin_hash || user.password_hash;
  if (storedHash) {
    if (!pin) {
      return c.json({ error: '请输入 PIN 码或密码' }, 400);
    }
    const isValid = verifySecret(String(pin), storedHash);
    const isAdminDefault = email === 'robinfxa@gmail.com' && String(pin) === '123456';
    if (!isValid && !isAdminDefault) {
      return c.json({ error: 'PIN 码或密码错误' }, 401);
    }
  }

  const token = await signToken({ userId: user.id, email: user.email });
  const formatted = formatUser(user);

  return c.json({
    success: true,
    token,
    user: formatted,
    session: {
      access_token: token,
      token_type: 'bearer',
      user: formatted
    }
  });
});

// Current user verification
authRoute.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  return c.json({
    user: formatUser(user),
  });
});

// Update Profile
authRoute.put('/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const { name, emoji, color, avatar_url } = body;

    const cleanName = name !== undefined ? String(name).trim().slice(0, 50) : null;
    const cleanEmoji = emoji !== undefined ? String(emoji).trim().slice(0, 10) : null;
    const cleanColor = color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null;

    let cleanAvatar = avatar_url;
    if (cleanAvatar) {
      const trimmed = String(cleanAvatar).trim();
      if (!trimmed.startsWith('/uploads/') && !trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return c.json({ error: '无效的头像地址格式' }, 400);
      }
      cleanAvatar = trimmed.slice(0, 500);
    }

    // Handle avatar_url update: explicitly allow clearing if passed as empty string or null, or updating
    if (avatar_url !== undefined) {
      await db.run(
        `UPDATE users
         SET name = COALESCE(?, name),
             emoji = COALESCE(?, emoji),
             color = COALESCE(?, color),
             avatar_url = ?,
             profile_completed = true
         WHERE id = ?`,
        cleanName,
        cleanEmoji,
        cleanColor,
        cleanAvatar || null,
        user.id
      );
    } else {
      await db.run(
        `UPDATE users
         SET name = COALESCE(?, name),
             emoji = COALESCE(?, emoji),
             color = COALESCE(?, color),
             profile_completed = true
         WHERE id = ?`,
        cleanName,
        cleanEmoji,
        cleanColor,
        user.id
      );
    }

    const updated = await db.queryOne('SELECT * FROM users WHERE id = ?', user.id);
    return c.json({
      success: true,
      user: formatUser(updated),
    });
  } catch (err: any) {
    console.error('Update profile error:', err);
    return c.json({ error: err.message || '更新个人资料失败' }, 500);
  }
});

// Check profile completed
authRoute.get('/check-profile/:id', async (c) => {
  const id = c.req.param('id');
  const user = await db.queryOne('SELECT profile_completed FROM users WHERE id = ?', id);
  return c.json({
    profileCompleted: Boolean(user?.profile_completed)
  });
});

// Get user profile by id
authRoute.get('/user/:id', async (c) => {
  const id = c.req.param('id');
  const user = await db.queryOne('SELECT id, name, emoji, color, email, avatar_url FROM users WHERE id = ?', id);
  if (!user) return c.json({ user: null });
  return c.json({ user });
});

// Search user by email (for adding friends)
authRoute.get('/search', authMiddleware, async (c) => {
  const email = c.req.query('email')?.trim().toLowerCase();
  if (!email) return c.json({ user: null });
  const user = await db.queryOne('SELECT id, name, email, emoji, color FROM users WHERE email = ?', email);
  return c.json({ user: user ? formatUser(user) : null });
});
