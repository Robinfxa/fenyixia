/**
 * Pure HTTP OpenAI Codex Device Code OAuth Flow (RFC 8628 variant)
 * Allows application to directly authenticate via ChatGPT account using device authorization.
 */

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_USER_AGENT = 'codex-cli/0.151.0';
export const CODEX_DEVICE_USERCODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode';
export const CODEX_DEVICE_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token';
export const CODEX_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';
export const CODEX_DEVICE_CALLBACK_URI = 'https://auth.openai.com/deviceauth/callback';
export const CODEX_VERIFICATION_URL = 'https://auth.openai.com/codex/device';

export interface CodexDeviceCodeResult {
  device_auth_id: string;
  user_code: string;
  interval: number;
  expires_at: string;
  verification_url: string;
}

export async function requestCodexDeviceCode(): Promise<CodexDeviceCodeResult> {
  const res = await fetch(CODEX_DEVICE_USERCODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': CODEX_USER_AGENT,
    },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`请求 Codex 设备代码失败 (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return {
    device_auth_id: data.device_auth_id,
    user_code: data.user_code,
    interval: Number(data.interval) || 5,
    expires_at: data.expires_at,
    verification_url: CODEX_VERIFICATION_URL,
  };
}

export type CodexPollStatus =
  | { status: 'pending' }
  | {
      status: 'success';
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
      email?: string;
    }
  | { status: 'error'; message: string };

export async function pollCodexDeviceToken(
  device_auth_id: string,
  user_code: string
): Promise<CodexPollStatus> {
  const res = await fetch(CODEX_DEVICE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': CODEX_USER_AGENT,
    },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      device_auth_id,
      user_code,
    }),
  });

  const bodyText = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(bodyText);
  } catch {
    // ignore
  }

  if (res.status === 403 || res.status === 404 || data.error?.code === 'deviceauth_authorization_pending') {
    return { status: 'pending' };
  }

  if (data.error) {
    return {
      status: 'error',
      message: data.error.message || `设备授权错误: ${data.error.code || res.status}`,
    };
  }

  const { authorization_code, code_verifier } = data;
  if (!authorization_code) {
    return { status: 'pending' };
  }

  // Exchange authorization_code for OAuth token material
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CODEX_CLIENT_ID,
    code: authorization_code,
    code_verifier: code_verifier || '',
    redirect_uri: CODEX_DEVICE_CALLBACK_URI,
  });

  const tokenRes = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': CODEX_USER_AGENT,
    },
    body: params.toString(),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    return { status: 'error', message: `Token 兑换失败 (${tokenRes.status}): ${errBody}` };
  }

  const tokenData = await tokenRes.json();
  let email = '';
  if (tokenData.access_token) {
    try {
      const parts = tokenData.access_token.split('.');
      if (parts[1]) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        email = payload.email || payload['https://api.openai.com/profile']?.email || '';
      }
    } catch {}
  }

  return {
    status: 'success',
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    id_token: tokenData.id_token,
    expires_in: tokenData.expires_in,
    email,
  };
}

export async function refreshCodexAccessToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string; id_token?: string } | null> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CODEX_CLIENT_ID,
    refresh_token: refreshToken,
  });

  const res = await fetch(CODEX_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': CODEX_USER_AGENT,
    },
    body: params.toString(),
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
  };
}
