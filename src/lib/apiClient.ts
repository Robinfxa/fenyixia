/**
 * Unified API Client for fenyixia DuckDB Backend & OpenAI 5.6luna Service
 * Automatically handles Bearer tokens, JSON serialization, and error normalization.
 */

function resolveDefaultApiBase(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
  }
  return 'http://localhost:3001';
}

const API_BASE = resolveDefaultApiBase();

const TOKEN_KEY = 'fenyixia_auth_token';
const USER_KEY = 'fenyixia_current_user';
const OPENAI_TOKEN_KEY = 'openai_oauth_token';

type AuthListener = (user: any | null, event: 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED') => void;
const authListeners = new Set<AuthListener>();

export function getOpenAIToken(): string | null {
  try {
    return localStorage.getItem(OPENAI_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setOpenAIToken(token: string | null) {
  try {
    if (token && token.trim()) {
      localStorage.setItem(OPENAI_TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(OPENAI_TOKEN_KEY);
    }
  } catch (e) {
    console.error('Failed to set OpenAI token in localStorage', e);
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (e) {
    console.error('Failed to set auth token in localStorage', e);
  }
}

export function getStoredUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: any | null) {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      notifyAuthListeners(user, 'SIGNED_IN');
    } else {
      localStorage.removeItem(USER_KEY);
      notifyAuthListeners(null, 'SIGNED_OUT');
    }
  } catch (e) {
    console.error('Failed to set stored user in localStorage', e);
  }
}

export function subscribeAuthChange(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

function notifyAuthListeners(user: any | null, event: 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED') {
  authListeners.forEach((listener) => {
    try {
      listener(user, event);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
}

export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function request<T = any>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = getAuthToken();

  let url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  if (options.params) {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, val]) => {
      if (val !== undefined) {
        searchParams.append(key, String(val));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Auto-detect JSON payload
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    body,
  });

  if (!res.ok) {
    let errorMessage = `API Error ${res.status}`;
    try {
      const errJson = await res.json();
      errorMessage = errJson.error || errJson.message || errorMessage;
    } catch {
      try {
        const text = await res.text();
        if (text) errorMessage = text;
      } catch {
        // use default
      }
    }
    const err = new Error(errorMessage) as any;
    err.status = res.status;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),
  put: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PUT', body }),
  patch: <T = any>(endpoint: string, body?: any, options?: ApiRequestOptions) =>
    request<T>(endpoint, { ...options, method: 'PATCH', body }),
  delete: <T = any>(endpoint: string, options?: ApiRequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
