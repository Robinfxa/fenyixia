import { Context, Next } from 'hono';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

// Cleanup expired entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetAt) {
      memoryStore.delete(key);
    }
  }
}, 60 * 1000);

export function rateLimit(options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (c: Context) => string;
}) {
  const { windowMs, max, message = '请求过于频繁，请稍后再试' } = options;

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const key = options.keyGenerator
      ? options.keyGenerator(c)
      : c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

    const now = Date.now();
    const record = memoryStore.get(key);

    if (!record || now > record.resetAt) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= max) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfterSec));
      return c.json(
        {
          error: message,
          retry_after: retryAfterSec,
        },
        429
      );
    }

    record.count++;
    return next();
  };
}

// Dedicated failed login tracker to prevent 6-digit PIN brute forcing
interface FailureRecord {
  failures: number;
  lastFailure: number;
  lockedUntil: number;
}

const failureStore = new Map<string, FailureRecord>();

const MAX_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes lockout
const FAILURE_EXPIRY_MS = 15 * 60 * 1000; // Failures expire after 15 mins of no attempts

export function isLoginLocked(key: string): { locked: boolean; remainingSec: number } {
  const record = failureStore.get(key);
  if (!record) return { locked: false, remainingSec: 0 };

  const now = Date.now();
  if (record.lockedUntil > now) {
    return {
      locked: true,
      remainingSec: Math.ceil((record.lockedUntil - now) / 1000),
    };
  }

  // If lock expired, or failures expired without reaching lockout, clean up
  if ((record.lockedUntil > 0 && now > record.lockedUntil) || (now - record.lastFailure > FAILURE_EXPIRY_MS)) {
    failureStore.delete(key);
  }
  return { locked: false, remainingSec: 0 };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  let record = failureStore.get(key);
  if (!record || now - record.lastFailure > FAILURE_EXPIRY_MS) {
    record = { failures: 0, lastFailure: now, lockedUntil: 0 };
  }
  record.failures++;
  record.lastFailure = now;
  if (record.failures >= MAX_FAILURES) {
    record.lockedUntil = now + LOCK_WINDOW_MS;
  }
  failureStore.set(key, record);
}

export function resetLoginFailure(key: string): void {
  failureStore.delete(key);
}

