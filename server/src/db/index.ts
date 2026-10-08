import duckdb from 'duckdb';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema.js';

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.locked = false;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

let dbInstance: duckdb.Database | null = null;
let dbConnection: duckdb.Connection | null = null;
const writeMutex = new AsyncMutex();

export interface DbContext {
  query<T = any>(sql: string, ...params: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, ...params: any[]): Promise<T | null>;
  run(sql: string, ...params: any[]): Promise<void>;
  transaction<T>(fn: (tx: DbContext) => Promise<T>): Promise<T>;
}

export function getDb(): duckdb.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

export function getConn(): duckdb.Connection {
  if (!dbConnection) {
    throw new Error('Database connection not initialized. Call initDb() first.');
  }
  return dbConnection;
}

export async function query<T = any>(sql: string, ...params: any[]): Promise<T[]> {
  const conn = getConn();
  const cleanParams = params.map(p => p === undefined ? null : p);
  return new Promise((resolve, reject) => {
    conn.all(sql, ...cleanParams, (err, res) => {
      if (err) return reject(err);
      resolve(res as T[]);
    });
  });
}

export async function queryOne<T = any>(sql: string, ...params: any[]): Promise<T | null> {
  const rows = await query<T>(sql, ...params);
  return rows.length > 0 ? rows[0] : null;
}

export async function run(sql: string, ...params: any[]): Promise<void> {
  const unlock = await writeMutex.acquire();
  try {
    const conn = getConn();
    const cleanParams = params.map(p => p === undefined ? null : p);
    await new Promise<void>((resolve, reject) => {
      conn.run(sql, ...cleanParams, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  } finally {
    unlock();
  }
}

export async function transaction<T>(fn: (tx: DbContext) => Promise<T>): Promise<T> {
  const unlock = await writeMutex.acquire();
  const conn = getConn();

  const txContext: DbContext = {
    query: (sql, ...params) => {
      const cleanParams = params.map(p => p === undefined ? null : p);
      return new Promise((resolve, reject) => {
        conn.all(sql, ...cleanParams, (err, res) => {
          if (err) return reject(err);
          resolve(res as any);
        });
      });
    },
    queryOne: async (sql, ...params) => {
      const rows = await txContext.query(sql, ...params);
      return rows.length > 0 ? rows[0] : null;
    },
    run: (sql, ...params) => {
      const cleanParams = params.map(p => p === undefined ? null : p);
      return new Promise((resolve, reject) => {
        conn.run(sql, ...cleanParams, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    },
    transaction: async () => {
      throw new Error('Nested transactions not supported');
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      conn.run('BEGIN TRANSACTION', (err) => (err ? reject(err) : resolve()));
    });

    const result = await fn(txContext);

    await new Promise<void>((resolve, reject) => {
      conn.run('COMMIT', (err) => (err ? reject(err) : resolve()));
    });

    return result;
  } catch (error) {
    try {
      await new Promise<void>((resolve) => {
        conn.run('ROLLBACK', () => resolve());
      });
    } catch {
      // rollback error suppressed
    }
    throw error;
  } finally {
    unlock();
  }
}

export async function initDb(dbFilePath?: string): Promise<void> {
  const targetPath = dbFilePath || process.env.DB_PATH || './data/fenyixia.duckdb';

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  console.log(`Connecting to DuckDB at ${targetPath}...`);
  await new Promise<void>((resolve, reject) => {
    dbInstance = new duckdb.Database(targetPath, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  dbConnection = dbInstance!.connect();

  // Execute schema DDL statements
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await new Promise<void>((resolve, reject) => {
      getConn().run(stmt, (err) => {
        if (err) {
          console.error(`Error executing DDL: ${stmt}\n`, err);
          return reject(err);
        }
        resolve();
      });
    });
  }

  // Schema migration for existing databases: ensure avatar_url column exists safely
  try {
    const cols = await query<{ name: string }>("PRAGMA table_info('users')");
    const hasAvatar = cols.some((c) => c.name === 'avatar_url');
    if (!hasAvatar) {
      await run('ALTER TABLE users ADD COLUMN avatar_url VARCHAR');
      await run('CHECKPOINT;');
    }
  } catch (err) {
    console.warn('Column check/alter skipped:', err);
  }

  // Schema migration for api_tokens: ensure last_used_at column exists
  try {
    const tokenCols = await query<{ name: string }>("PRAGMA table_info('api_tokens')");
    const hasLastUsed = tokenCols.some((c) => c.name === 'last_used_at');
    if (!hasLastUsed) {
      await run('ALTER TABLE api_tokens ADD COLUMN last_used_at TIMESTAMP');
      await run('CHECKPOINT;');
    }
  } catch (err) {
    console.warn('api_tokens column check/alter skipped:', err);
  }

  // Seed default admin user ONLY if not already present — never overwrite existing credentials
  const adminEmail = process.env.ADMIN_EMAIL || 'robinfxa@gmail.com';
  const existingAdmin = await queryOne('SELECT id FROM users WHERE email = ?', adminEmail);
  if (!existingAdmin) {
    // PBKDF2 sha256 hash of '123432' with 'fenyixia_salt_secure'
    const adminPinHash = 'd99f19ab39ac5e0931a4abf7f995f3a82c0d4a922f1113209c5d5ba6f49dc596';
    const adminId = '00000000-0000-0000-0000-000000000001';
    await run(
      `INSERT INTO users (id, name, email, emoji, color, pin_hash, password_hash, profile_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      adminId,
      'Robin (Admin)',
      adminEmail,
      '👑',
      '#6366F1',
      adminPinHash,
      adminPinHash,
      true
    );
    console.log(`Default admin user (${adminEmail}) seeded. Change the default PIN immediately!`);
  } else {
    console.log(`Admin user (${adminEmail}) already exists, credentials untouched.`);
  }

  // Checkpoint to merge WAL into main database file to prevent WAL replay assertion bugs
  try {
    await run('CHECKPOINT;');
  } catch (err) {
    console.warn('Initial checkpoint skipped:', err);
  }

  console.log('DuckDB initialized successfully with all tables.');
}

export async function closeDb(): Promise<void> {
  if (dbConnection) {
    try {
      await run('CHECKPOINT;');
    } catch {}
    dbConnection = null;
  }
  if (dbInstance) {
    await new Promise<void>((resolve) => {
      dbInstance!.close(() => resolve());
    });
    dbInstance = null;
  }
}

export const db: DbContext = {
  query,
  queryOne,
  run,
  transaction
};
