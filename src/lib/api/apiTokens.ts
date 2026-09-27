import { api } from '../apiClient';

export interface ApiToken {
  id: string;
  token: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenResult {
  token: ApiToken | null;
  api_base_url: string;
  is_custom_url?: boolean;
}

export async function getApiToken(): Promise<ApiTokenResult> {
  const res = await api.get<{ token: ApiToken | null; api_base_url?: string; is_custom_url?: boolean }>('/api/tokens');
  return {
    token: res.token || null,
    api_base_url: res.api_base_url || '',
    is_custom_url: Boolean(res.is_custom_url),
  };
}

export async function createApiToken(name = 'AI Token'): Promise<ApiTokenResult> {
  const res = await api.post<{ token: ApiToken; api_base_url?: string; is_custom_url?: boolean }>('/api/tokens', { name });
  return {
    token: res.token,
    api_base_url: res.api_base_url || '',
    is_custom_url: Boolean(res.is_custom_url),
  };
}

export async function revokeApiToken(): Promise<void> {
  await api.delete('/api/tokens');
}

