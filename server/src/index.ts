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

// Self-documenting API root & docs for AI Assistants & Developers
const getApiDocs = (c: any) => {
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3001';
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const baseUrl = `${proto}://${host}/api`;

  return c.json({
    service: 'fenyixia-api',
    name: '分一哈开放 API (AI Assistant & Developers)',
    version: '1.0.0',
    base_url: baseUrl,
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <token>',
      instructions: '在前端「设置」中生成个人 AI API Token 并在 HTTP 请求头携带 Authorization: Bearer <token>'
    },
    endpoints: [
      {
        method: 'GET',
        path: '/api/summary',
        description: '获取当前账户全局财务总览与待结算清单',
        query_params: {
          all: 'boolean (admin only: 查看全站数据)'
        }
      },
      {
        method: 'GET',
        path: '/api/contacts',
        description: '获取联系人与好友列表'
      },
      {
        method: 'GET',
        path: '/api/bills',
        description: '查询账单列表',
        query_params: {
          filter: 'all | pending | collect (默认 all)',
          all: 'boolean (admin only: 跨用户查询平台所有账单)'
        }
      },
      {
        method: 'POST',
        path: '/api/bills',
        description: '创建新账单',
        body: {
          title: 'string (必填, 账单名称)',
          icon: 'string (选填, 单个 Emoji 图标)',
          date: 'string (选填, 日期 YYYY-MM-DD)',
          description: 'string (选填, 备注说明)',
          items: [
            {
              name: 'string (明细项目名称)',
              price: 'number (金额)',
              qty: 'number (数量, 默认 1)'
            }
          ]
        }
      },
      {
        method: 'POST',
        path: '/api/bills/:id/mark-paid',
        description: '标记账单结算状态',
        body: {
          settled: 'boolean (是否结清, 默认 true)',
          member_id: 'string (选填, 仅结算指定成员)'
        }
      }
    ]
  });
};

app.get('/api', getApiDocs);
app.get('/api/', getApiDocs);
app.get('/api/docs', getApiDocs);

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
