import { db } from '../db/index.js';

/**
 * OpenAI 5.6luna Client with OAuth Bearer Token Support
 */

export interface LunaMessageContentPartText {
  type: 'text';
  text: string;
}

export interface LunaMessageContentPartImage {
  type: 'image_url';
  image_url: {
    url: string; // "data:image/jpeg;base64,..." or URL
  };
}

export type LunaContentPart = LunaMessageContentPartText | LunaMessageContentPartImage;

export interface LunaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LunaContentPart[];
}

export interface LunaResponse {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

import { refreshCodexAccessToken } from './codexAuth.js';

export function normalizeModelName(model?: string): string {
  if (!model) return 'gpt-5.6-luna';
  const trimmed = model.trim();
  if (trimmed === '5.6luna' || trimmed === '5.6-luna' || trimmed === 'luna') {
    return 'gpt-5.6-luna';
  }
  if (trimmed === '4o') return 'gpt-4o';
  if (trimmed === '4o-mini') return 'gpt-4o-mini';
  return trimmed;
}

export interface SystemOpenAiConfig {
  token: string;
  model: string;
  baseUrl: string;
  authMode: 'codex_oauth' | 'api_key' | 'env' | 'none';
  accountEmail?: string;
  source: 'db' | 'env' | 'none';
}

export async function getSystemOpenAiConfig(): Promise<SystemOpenAiConfig> {
  const envBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  try {
    const rows = await db.query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings WHERE key IN ('openai_token', 'openai_model', 'openai_auth_mode', 'openai_account_email', 'openai_base_url')"
    );
    let dbToken = '';
    let dbModel = '';
    let dbBaseUrl = '';
    let dbAuthMode: any = 'api_key';
    let dbEmail = '';
    for (const r of rows) {
      if (r.key === 'openai_token') dbToken = r.value;
      if (r.key === 'openai_model') dbModel = r.value;
      if (r.key === 'openai_base_url') dbBaseUrl = r.value;
      if (r.key === 'openai_auth_mode') dbAuthMode = r.value;
      if (r.key === 'openai_account_email') dbEmail = r.value;
    }
    if (dbToken) {
      return {
        token: dbToken,
        model: normalizeModelName(dbModel),
        baseUrl: dbBaseUrl || envBaseUrl,
        authMode: dbAuthMode || 'api_key',
        accountEmail: dbEmail || undefined,
        source: 'db',
      };
    }
  } catch (err) {
    // ignore if table not ready
  }

  const envToken = process.env.OPENAI_OAUTH_TOKEN || process.env.OPENAI_SESSION_TOKEN || process.env.OPENAI_API_KEY || '';
  const envModel = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  if (envToken) {
    return {
      token: envToken,
      model: normalizeModelName(envModel),
      baseUrl: envBaseUrl,
      authMode: 'env',
      source: 'env',
    };
  }

  return {
    token: '',
    model: 'gpt-5.6-luna',
    baseUrl: envBaseUrl,
    authMode: 'none',
    source: 'none',
  };
}

export interface CallLunaOptions {
  jsonMode?: boolean;
}

export async function callLuna(
  messages: LunaMessage[],
  customToken?: string,
  customModel?: string,
  options?: CallLunaOptions
): Promise<LunaResponse> {
  const sysConfig = await getSystemOpenAiConfig();
  const token = customToken || sysConfig.token;
  const model = normalizeModelName(customModel || sysConfig.model);
  const baseUrl = (sysConfig.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');

  if (!token) {
    throw new Error('未配置 OpenAI 5.6luna 会话凭证或 API Key。请管理员在「管理面板 (/admin)」中配置。');
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const requestBody: any = {
    model,
    messages,
    max_completion_tokens: 2500,
    max_tokens: 2500,
    temperature: 0.1,
  };
  if (options?.jsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }

  // Real OpenAI call with OAuth bearer token or API key
  let activeToken = token;
  let res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  // If 401 Unauthorized and we are using system db settings with codex oauth, attempt refresh
  if (res.status === 401 && !customToken && sysConfig.source === 'db') {
    try {
      const refreshRow = await db.queryOne<{ value: string }>(
        "SELECT value FROM system_settings WHERE key = 'openai_refresh_token'"
      );
      if (refreshRow?.value) {
        const refreshed = await refreshCodexAccessToken(refreshRow.value);
        if (refreshed?.access_token) {
          activeToken = refreshed.access_token;
          await db.run(
            `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
             VALUES ('openai_token', ?, CURRENT_TIMESTAMP)`,
            refreshed.access_token
          );
          if (refreshed.refresh_token) {
            await db.run(
              `INSERT OR REPLACE INTO system_settings (key, value, updated_at)
               VALUES ('openai_refresh_token', ?, CURRENT_TIMESTAMP)`,
              refreshed.refresh_token
            );
          }
          // Retry OpenAI API call with new token
          res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${activeToken}`,
            },
            body: JSON.stringify(requestBody),
          });
        }
      }
    } catch (refreshErr) {
      console.warn('[OpenAI] Token auto-refresh failed:', refreshErr);
    }
  }

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`OpenAI 5.6luna API error (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content || '';

  return {
    content,
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
    },
    model: data.model || model,
  };
}
