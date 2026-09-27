import { api } from '../apiClient';

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  emoji: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface EmailLogEntry {
  recipient_email: string;
  email_type: string;
  sent_at: string;
}

export interface EmailStats {
  last_hour: number;
  last_day: number;
  recent: EmailLogEntry[];
}

export interface TokenStat {
  user_id: string;
  name: string;
  emoji: string;
  email: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  last_at: string;
}

export async function adminListUsers(): Promise<AdminUser[]> {
  const res = await api.get<{ users: AdminUser[] }>('/api/admin/users');
  return res.users || [];
}

export async function adminGenerateMagicLink(email: string): Promise<string> {
  const res = await api.post<{ action_link: string }>('/api/admin/ops', {
    action: 'generate_magic_link',
    email,
  });
  return res.action_link;
}

export async function adminGetEmailStats(): Promise<EmailStats> {
  return await api.get<EmailStats>('/api/admin/email-stats');
}

export async function adminGetTokenStats(): Promise<TokenStat[]> {
  const res = await api.get<{ stats: TokenStat[] }>('/api/admin/token-stats');
  return res.stats || [];
}

export interface OpenAiConfig {
  configured: boolean;
  source: 'db' | 'env' | 'none';
  auth_mode?: 'codex_oauth' | 'api_key' | 'env' | 'none';
  account_email?: string;
  model: string;
  base_url?: string;
  masked_token?: string;
}

export interface CodexDeviceCodeResponse {
  device_auth_id: string;
  user_code: string;
  interval: number;
  expires_at: string;
  verification_url: string;
}

export interface CodexPollResponse {
  status: 'pending' | 'success' | 'error';
  message?: string;
  email?: string;
}

export async function adminGetOpenAiConfig(): Promise<OpenAiConfig> {
  return await api.get<OpenAiConfig>('/api/admin/openai-config');
}

export async function adminSaveOpenAiConfig(
  token: string,
  model?: string,
  auth_mode: string = 'api_key',
  base_url?: string
): Promise<{ success: boolean; message: string; model: string; base_url?: string; auth_mode?: string }> {
  return await api.post('/api/admin/openai-config', { token, model, auth_mode, base_url });
}

export async function adminDeleteOpenAiConfig(): Promise<{ success: boolean; message: string }> {
  return await api.delete('/api/admin/openai-config');
}

export async function adminTestOpenAiConnection(
  token?: string,
  model?: string,
  base_url?: string
): Promise<{ success: boolean; message: string; model?: string; base_url?: string }> {
  return await api.post('/api/admin/openai-test', { token, model, base_url });
}

export async function adminRequestCodexDeviceCode(): Promise<CodexDeviceCodeResponse> {
  return await api.post<CodexDeviceCodeResponse>('/api/admin/codex/device-code');
}

export async function adminPollCodexDeviceToken(
  device_auth_id: string,
  user_code: string
): Promise<CodexPollResponse> {
  return await api.post<CodexPollResponse>('/api/admin/codex/poll-token', {
    device_auth_id,
    user_code,
  });
}

export interface PublicUrlConfig {
  configured_url: string;
  detected_url: string;
  active_url: string;
  is_custom: boolean;
}

export async function adminGetPublicUrlConfig(): Promise<PublicUrlConfig> {
  return await api.get<PublicUrlConfig>('/api/admin/public-url');
}

export async function adminSavePublicUrlConfig(public_api_base_url: string): Promise<{ success: boolean; message: string; public_api_base_url: string }> {
  return await api.post('/api/admin/public-url', { public_api_base_url });
}

