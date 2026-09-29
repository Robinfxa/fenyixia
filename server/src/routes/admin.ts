import { Hono } from 'hono';
import { db } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { getSystemOpenAiConfig, normalizeModelName, callOpenAiApi } from '../ai/openai.js';
import { requestCodexDeviceCode, pollCodexDeviceToken } from '../ai/codexAuth.js';
import { syncCodexAuthFromDb, callCodex } from '../ai/codex.js';
import { AppEnv } from '../types.js';

export const ADMIN_EMAIL = 'robinfxa@gmail.com';

export const adminRoute = new Hono<AppEnv>();
adminRoute.use('*', authMiddleware);

// Admin-only guardrail middleware
adminRoute.use('*', async (c, next) => {
  const user = c.get('user');
  if (!user || user.email !== ADMIN_EMAIL) {
    return c.json({ error: `未授权：仅管理员 ${ADMIN_EMAIL} 可访问控制台` }, 403);
  }
  await next();
});

// GET /api/admin/users
adminRoute.get('/users', async (c) => {
  const users = await db.query<any>(
    'SELECT id, email, name, emoji, color, created_at FROM users ORDER BY created_at DESC'
  );

  const formatted = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    emoji: u.emoji,
    color: u.color,
    created_at: u.created_at,
    last_sign_in_at: u.created_at,
  }));

  return c.json({ users: formatted });
});

// GET /api/admin/email-stats
adminRoute.get('/email-stats', async (c) => {
  return c.json({
    last_hour: 0,
    last_day: 0,
    recent: [],
  });
});

// GET /api/admin/token-stats
adminRoute.get('/token-stats', async (c) => {
  const stats = await db.query<any>(
    `SELECT u.id as user_id, u.name, u.emoji, u.email,
            COUNT(t.id) as calls,
            COALESCE(SUM(t.input_tokens), 0) as input_tokens,
            COALESCE(SUM(t.output_tokens), 0) as output_tokens,
            MAX(t.created_at) as last_at
     FROM users u
     LEFT JOIN token_usage t ON t.user_id = u.id
     GROUP BY u.id, u.name, u.emoji, u.email
     ORDER BY calls DESC`
  );

  const formatted = stats.map((s) => ({
    user_id: s.user_id,
    name: s.name,
    emoji: s.emoji,
    email: s.email,
    calls: Number(s.calls),
    input_tokens: Number(s.input_tokens),
    output_tokens: Number(s.output_tokens),
    last_at: s.last_at || new Date().toISOString(),
  }));

  return c.json({ stats: formatted });
});

// POST /api/admin/ops (for compatibility with legacy callAdminOps)
adminRoute.post('/ops', async (c) => {
  const body = await c.req.json();
  const { action, email } = body;

  if (action === 'list_users') {
    const users = await db.query<any>(
      'SELECT id, email, name, emoji, created_at FROM users ORDER BY created_at DESC'
    );
    return c.json({ users });
  }

  if (action === 'get_email_stats') {
    return c.json({ last_hour: 0, last_day: 0, recent: [] });
  }

  if (action === 'get_token_stats') {
    const stats = await db.query<any>(
      `SELECT u.id as user_id, u.name, u.emoji, u.email,
              COUNT(t.id) as calls,
              COALESCE(SUM(t.input_tokens), 0) as input_tokens,
              COALESCE(SUM(t.output_tokens), 0) as output_tokens,
              MAX(t.created_at) as last_at
       FROM users u
       LEFT JOIN token_usage t ON t.user_id = u.id
       GROUP BY u.id, u.name, u.emoji, u.email`
    );
    return c.json({ stats });
  }

  if (action === 'generate_magic_link') {
    return c.json({ action_link: `/login?email=${encodeURIComponent(email || '')}` });
  }

  return c.json({ error: `Unknown action: ${action}` }, 400);
});

// GET /api/admin/openai-config
adminRoute.get('/openai-config', async (c) => {
  const sysConfig = await getSystemOpenAiConfig();
  const maskedToken = sysConfig.token
    ? (sysConfig.token.length > 16
        ? sysConfig.token.slice(0, 7) + '•'.repeat(16) + sysConfig.token.slice(-4)
        : '•'.repeat(8))
    : '';

  return c.json({
    configured: Boolean(sysConfig.token),
    source: sysConfig.source,
    auth_mode: sysConfig.authMode,
    account_email: sysConfig.accountEmail || '',
    model: sysConfig.model,
    base_url: sysConfig.baseUrl || 'https://api.openai.com/v1',
    masked_token: maskedToken,
  });
});

// POST /api/admin/openai-config
adminRoute.post('/openai-config', async (c) => {
  const body = await c.req.json();
  const { token, model = 'gpt-5.6-luna', auth_mode = 'api_key', base_url } = body;

  if (!token || !token.trim()) {
    return c.json({ error: 'Token 不能为空' }, 400);
  }

  const cleanToken = token.trim();
  const cleanModel = normalizeModelName(model);
  const cleanMode = auth_mode || 'api_key';
  const cleanBaseUrl = base_url ? base_url.trim().replace(/\/+$/, '') : '';

  // Upsert into system_settings
  await db.run(
    `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
     VALUES ('openai_token', ?, CURRENT_TIMESTAMP)`,
    cleanToken
  );
  await db.run(
    `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
     VALUES ('openai_model', ?, CURRENT_TIMESTAMP)`,
    cleanModel
  );
  await db.run(
    `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
     VALUES ('openai_auth_mode', ?, CURRENT_TIMESTAMP)`,
    cleanMode
  );
  if (cleanBaseUrl) {
    await db.run(
      `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
       VALUES ('openai_base_url', ?, CURRENT_TIMESTAMP)`,
      cleanBaseUrl
    );
  } else {
    await db.run("DELETE FROM system_settings WHERE key = 'openai_base_url'");
  }

  return c.json({
    success: true,
    message: 'OpenAI 凭证与模型配置已保存',
    model: cleanModel,
    base_url: cleanBaseUrl || 'https://api.openai.com/v1',
    auth_mode: cleanMode,
  });
});

// DELETE /api/admin/openai-config
adminRoute.delete('/openai-config', async (c) => {
  await db.run(
    "DELETE FROM system_settings WHERE key IN ('openai_token', 'openai_refresh_token', 'openai_id_token', 'openai_auth_mode', 'openai_account_email', 'openai_model', 'openai_base_url')"
  );
  return c.json({ success: true, message: '系统 OpenAI 凭证已清除' });
});

// POST /api/admin/codex/device-code
adminRoute.post('/codex/device-code', async (c) => {
  try {
    const deviceResult = await requestCodexDeviceCode();
    return c.json(deviceResult);
  } catch (err: any) {
    return c.json({ error: err.message || '获取 Codex 设备代码失败' }, 500);
  }
});

// POST /api/admin/codex/poll-token
adminRoute.post('/codex/poll-token', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { device_auth_id, user_code } = body;

  if (!device_auth_id || !user_code) {
    return c.json({ error: '缺少 device_auth_id 或 user_code' }, 400);
  }

  try {
    const pollResult = await pollCodexDeviceToken(device_auth_id, user_code);

    if (pollResult.status === 'pending') {
      return c.json({ status: 'pending' });
    }

    if (pollResult.status === 'error') {
      return c.json({ status: 'error', message: pollResult.message }, 400);
    }

    if (pollResult.status === 'success') {
      // Save tokens into DuckDB system_settings
      await db.run(
        `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
         VALUES ('openai_token', ?, CURRENT_TIMESTAMP)`,
        pollResult.access_token
      );

      if (pollResult.refresh_token) {
        await db.run(
          `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
           VALUES ('openai_refresh_token', ?, CURRENT_TIMESTAMP)`,
          pollResult.refresh_token
        );
      }

      if (pollResult.id_token) {
        await db.run(
          `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
           VALUES ('openai_id_token', ?, CURRENT_TIMESTAMP)`,
          pollResult.id_token
        );
      }

      await db.run(
        `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
         VALUES ('openai_auth_mode', 'codex_oauth', CURRENT_TIMESTAMP)`
      );

      if (pollResult.email) {
        await db.run(
          `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
           VALUES ('openai_account_email', ?, CURRENT_TIMESTAMP)`,
          pollResult.email
        );
      }

      // Default model to gpt-5.6-luna if not already set
      const existingModel = await db.queryOne<{ value: string }>(
        "SELECT value FROM system_settings WHERE key = 'openai_model'"
      );
      if (!existingModel?.value) {
        await db.run(
          `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
           VALUES ('openai_model', 'gpt-5.6-luna', CURRENT_TIMESTAMP)`
        );
      }

      // Sync auth.json so Codex CLI runtime is immediately logged in
      await syncCodexAuthFromDb();

      return c.json({
        status: 'success',
        email: pollResult.email,
        message: 'Codex 设备代码授权成功，凭证已保存并激活',
      });
    }

    return c.json({ status: 'pending' });
  } catch (err: any) {
    return c.json({ status: 'error', message: err.message || '轮询凭证失败' }, 500);
  }
});

// POST /api/admin/openai-test
adminRoute.post('/openai-test', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const sysConfig = await getSystemOpenAiConfig();
  const token = body.token?.trim() || sysConfig.token;
  const model = normalizeModelName(body.model?.trim() || sysConfig.model);
  const baseUrl = (body.base_url?.trim() || sysConfig.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const authMode = body.auth_mode || (body.token ? 'api_key' : sysConfig.authMode);

  try {
    if (authMode === 'codex_oauth' && !body.token) {
      await syncCodexAuthFromDb();
      const res = await callCodex([{ role: 'user', content: 'Say "OK"' }], model);
      return c.json({
        success: true,
        message: `Codex 订阅运行时连接成功！模型: ${res.model}，响应: ${res.content.slice(0, 100)}`,
        model: res.model,
      });
    }

    if (!token) {
      return c.json({ error: '未提供或未配置 Token' }, 400);
    }

    const res = await callOpenAiApi([{ role: 'user', content: 'Say "OK"' }], token, model, baseUrl);
    return c.json({
      success: true,
      message: `OpenAI 兼容接口连接成功！端点: ${baseUrl}，模型: ${model}，响应: ${res.content.slice(0, 100)}`,
      model,
      base_url: baseUrl,
    });
  } catch (err: any) {
    return c.json({
      success: false,
      message: `测试连接失败: ${err.message}`,
    }, 400);
  }
});

// POST /api/admin/clean-db
adminRoute.post('/clean-db', async (c) => {
  await db.run("DELETE FROM users WHERE email != 'robinfxa@gmail.com'");
  await db.run('DELETE FROM bills');
  await db.run('DELETE FROM bill_items');
  await db.run('DELETE FROM bill_item_members');
  await db.run('DELETE FROM friendships');
  await db.run('DELETE FROM friend_requests');
  await db.run('DELETE FROM invitations');
  await db.run('DELETE FROM groups');
  await db.run('DELETE FROM group_members');
  await db.run('DELETE FROM user_tags');
  await db.run('DELETE FROM friend_tags');
  await db.run('DELETE FROM payment_proofs');
  await db.run('DELETE FROM manual_payments');
  await db.run('DELETE FROM bill_disputes');
  await db.run('DELETE FROM bill_reactions');
  await db.run('DELETE FROM receipt_scans');
  await db.run('DELETE FROM api_tokens');
  await db.run('DELETE FROM token_usage');
  await db.run('CHECKPOINT;');
  await db.run('VACUUM;');

  return c.json({
    success: true,
    message: '数据库已清空所有模拟/测试数据并执行 VACUUM，保留管理员 robinfxa@gmail.com',
  });
});

// GET /api/admin/public-url
adminRoute.get('/public-url', async (c) => {
  const row = await db.queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'public_api_base_url'"
  );
  const proto = c.req.header('x-forwarded-proto') || 'http';
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3001';
  const detectedUrl = `${proto}://${host}/api`;

  return c.json({
    configured_url: row?.value || '',
    detected_url: detectedUrl,
    active_url: row?.value || detectedUrl,
    is_custom: Boolean(row?.value),
  });
});

// POST /api/admin/public-url
adminRoute.post('/public-url', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawUrl = body.public_api_base_url !== undefined ? String(body.public_api_base_url).trim() : '';

  if (rawUrl) {
    const cleanUrl = rawUrl.replace(/\/+$/, '');
    await db.run(
      `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
       VALUES ('public_api_base_url', ?, CURRENT_TIMESTAMP)`,
      cleanUrl
    );
    return c.json({
      success: true,
      message: '公开 API 服务地址已保存生效',
      public_api_base_url: cleanUrl,
    });
  } else {
    await db.run("DELETE FROM system_settings WHERE key = 'public_api_base_url'");
    return c.json({
      success: true,
      message: '已清除自定义地址，恢复为随访问域名自动感知',
      public_api_base_url: '',
    });
  }
});


