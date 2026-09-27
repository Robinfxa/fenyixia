import { Context, Next } from 'hono';
import * as jose from 'jose';
import crypto from 'node:crypto';
import { db } from '../db/index.js';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ WARNING: JWT_SECRET not found in production! Using ephemeral random secret for security.');
      return new TextEncoder().encode(crypto.randomBytes(48).toString('hex'));
    }
    return new TextEncoder().encode('fenyixia-duckdb-secret-key-32bytes-long-min!');
  }
  return new TextEncoder().encode(secret);
}

const JWT_SECRET = getJwtSecret();

export function hashSecret(secret: string): string {
  return crypto.pbkdf2Sync(secret, 'fenyixia_salt_secure', 10000, 32, 'sha256').toString('hex');
}

export function verifySecret(secret: string, hash: string): boolean {
  if (!hash || typeof hash !== 'string') return false;
  const computed = hashSecret(secret);
  const bufA = Buffer.from(computed);
  const bufB = Buffer.from(hash);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function signToken(payload: { userId: string; email: string }): Promise<string> {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      email: payload.email as string,
    };
  } catch (err) {
    console.error('JWT verify error:', err);
    return null;
  }
}

import { AppEnv } from '../types.js';

export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid token' }, 401);
  }

  const token = authHeader.substring(7).trim();

  // 1. Check if token is a personal AI API token (starts with fyx_ or exists in api_tokens)
  if (token.startsWith('fyx_')) {
    const apiTokenRow = await db.queryOne<{ user_id: string }>(
      'SELECT user_id FROM api_tokens WHERE token = ?',
      token
    );
    if (apiTokenRow) {
      const user = await db.queryOne('SELECT * FROM users WHERE id = ?', apiTokenRow.user_id);
      if (user) {
        db.run('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?', token).catch(() => {});
        c.set('user', user);
        c.set('userId', user.id);
        return next();
      }
    }
  }

  // 2. Otherwise verify as standard JWT
  const decoded = await verifyToken(token);
  if (!decoded) {
    // Also check api_tokens as fallback in case token doesn't have fyx_ prefix
    const fallbackTokenRow = await db.queryOne<{ user_id: string }>(
      'SELECT user_id FROM api_tokens WHERE token = ?',
      token
    );
    if (fallbackTokenRow) {
      const user = await db.queryOne('SELECT * FROM users WHERE id = ?', fallbackTokenRow.user_id);
      if (user) {
        db.run('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?', token).catch(() => {});
        c.set('user', user);
        c.set('userId', user.id);
        return next();
      }
    }
    return c.json({ error: 'Unauthorized: Invalid or expired token' }, 401);
  }

  const user = await db.queryOne('SELECT * FROM users WHERE id = ?', decoded.userId);
  if (!user) {
    return c.json({ error: 'Unauthorized: User not found' }, 401);
  }

  c.set('user', user);
  c.set('userId', user.id);
  await next();
}

export async function optionalAuthMiddleware(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token.startsWith('fyx_')) {
      const apiTokenRow = await db.queryOne<{ user_id: string }>(
        'SELECT user_id FROM api_tokens WHERE token = ?',
        token
      );
      if (apiTokenRow) {
        const user = await db.queryOne('SELECT * FROM users WHERE id = ?', apiTokenRow.user_id);
        if (user) {
          db.run('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?', token).catch(() => {});
          c.set('user', user);
          c.set('userId', user.id);
          return next();
        }
      }
    }

    const decoded = await verifyToken(token);
    if (decoded) {
      const user = await db.queryOne('SELECT * FROM users WHERE id = ?', decoded.userId);
      if (user) {
        c.set('user', user);
        c.set('userId', user.id);
      }
    }
  }
  await next();
}
