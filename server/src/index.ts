import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { initDb, closeDb } from './db/index.js';
import { uploadRoute, UPLOADS_DIR } from './routes/upload.js';
import { authRoute } from './routes/auth.js';
import { billsRoute } from './routes/bills.js';
import { friendsRoute } from './routes/friends.js';
import { groupsRoute } from './routes/groups.js';
import { tagsRoute } from './routes/tags.js';
import { disputesRoute } from './routes/disputes.js';
import { paymentsRoute } from './routes/payments.js';
import { aiRoute } from './routes/ai.js';
import { adminRoute } from './routes/admin.js';
import { tokensRoute } from './routes/tokens.js';
import { summaryRoute, contactsRoute } from './routes/agent.js';
import { AppEnv } from './types.js';
import path from 'node:path';
import fs from 'node:fs';

// Try loading environment variables from .env files
try {
  process.loadEnvFile();
} catch {}
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../.env'));
} catch {}
try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {}

const app = new Hono<AppEnv>();

app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-OpenAI-Token', 'X-OpenAI-OAuth-Token'],
  exposeHeaders: ['Content-Length', 'Content-Range'],
  maxAge: 600,
  credentials: true,
}));

// Static files serving for /uploads/*
app.get('/uploads/*', async (c) => {
  const relPath = c.req.path.replace(/^\/uploads\//, '');
  const resolvedRoot = path.resolve(UPLOADS_DIR);
  const fullPath = path.resolve(resolvedRoot, path.normalize(relPath));

  // Security check: strict path traversal defense
  if (!fullPath.startsWith(resolvedRoot + path.sep)) {
    return c.text('Forbidden', 403);
  }

  if (!fs.existsSync(fullPath)) {
    return c.text('Not Found', 404);
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    return c.text('Not Found', 404);
  }

  const ext = path.extname(fullPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
  };

  const contentType = mimeMap[ext] || 'application/octet-stream';
  const fileStream = fs.createReadStream(fullPath);

  // Return streamed response with security headers
  return c.body(fileStream as any, 200, {
    'Content-Type': contentType,
    'Content-Length': stat.size.toString(),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
});

// Health checks
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'fenyixia-duckdb-server',
    version: '1.0.0'
  });
});

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'fenyixia-duckdb-server',
    version: '1.0.0'
  });
});

// Mount Routes
app.route('/api/upload', uploadRoute);
app.route('/api/auth', authRoute);
app.route('/api/bills', billsRoute);
app.route('/api/friends', friendsRoute);
app.route('/api/groups', groupsRoute);
app.route('/api/tags', tagsRoute);
app.route('/api/disputes', disputesRoute);
app.route('/api/payments', paymentsRoute);
app.route('/api/admin', adminRoute);
app.route('/api/tokens', tokensRoute);
app.route('/api/summary', summaryRoute);
app.route('/api/contacts', contactsRoute);
app.route('/api', aiRoute);

const PORT = Number(process.env.PORT) || 3001;

// Initialize Database on launch
initDb().catch((err) => {
  console.error('Database initialization failed:', err);
});

console.log(`Server starting on port ${PORT}...`);

const server = serve({
  fetch: app.fetch,
  port: PORT,
});

const cleanup = async () => {
  console.log('Shutting down server...');
  await closeDb();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

export { app, server };
