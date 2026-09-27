import { api, setAuthToken, setStoredUser, getStoredUser, subscribeAuthChange } from '../apiClient';

export interface User {
  id: string;
  email: string;
  name?: string;
  emoji?: string;
  color?: string;
  profile_completed?: boolean;
  user_metadata?: {
    name?: string;
    emoji?: string;
    color?: string;
    profile_completed?: boolean;
  };
}

export interface UserIdentity {
  id: string;
  user_id: string;
  identity_data?: Record<string, any>;
  provider: string;
  created_at?: string;
  last_sign_in_at?: string;
  updated_at?: string;
}

export async function getCurrentUser(): Promise<User | null> {
  const cached = getStoredUser();
  try {
    const res = await api.get<{ user: User }>('/api/auth/me');
    if (res?.user) {
      setStoredUser(res.user);
      return res.user;
    }
  } catch {
    // If token invalid, clear
    if (!cached) return null;
  }
  return cached;
}

export async function signUp(email: string, password: string): Promise<{ user: User; session: any }> {
  const res = await api.post<{ user: User; token: string; session: any }>('/api/auth/signup', {
    email,
    password,
    pin: password,
  });

  if (res.token) {
    setAuthToken(res.token);
    setStoredUser(res.user);
  }

  return { user: res.user, session: res.session };
}

export async function resendVerification(email: string): Promise<void> {
  // Local backend accounts are auto-verified
  console.log('Verification resend requested for:', email);
}

export async function signIn(email: string, password: string): Promise<{ user: User; session: any }> {
  const res = await api.post<{ user: User; token: string; session: any }>('/api/auth/login', {
    email,
    password,
    pin: password,
  });

  if (res.token) {
    setAuthToken(res.token);
    setStoredUser(res.user);
  }

  return { user: res.user, session: res.session };
}

export async function signOut(): Promise<void> {
  setAuthToken(null);
  setStoredUser(null);
}

export function onAuthChange(callback: (user: User | null, event: string) => void) {
  const unsubscribe = subscribeAuthChange((user, event) => {
    callback(user, event);
  });

  return {
    data: {
      subscription: {
        unsubscribe,
      },
    },
  };
}

export async function verifySession(): Promise<boolean> {
  try {
    const res = await api.get<{ user: User }>('/api/auth/me');
    return Boolean(res?.user);
  } catch {
    return false;
  }
}

// ── Profile ──────────────────────────────────────────

export async function checkProfileCompleted(userId: string): Promise<boolean> {
  try {
    const res = await api.get<{ profileCompleted: boolean }>(`/api/auth/check-profile/${userId}`);
    return res.profileCompleted === true;
  } catch {
    return true;
  }
}

export async function updateProfile(
  name: string,
  emoji: string,
  color: string,
  avatarUrl?: string | null
): Promise<void> {
  const res = await api.put<{ user: User }>('/api/auth/profile', {
    name,
    emoji,
    color,
    avatar_url: avatarUrl,
  });
  if (res?.user) {
    setStoredUser(res.user);
  }
}

export async function uploadAvatar(blob: Blob, ext: string = 'jpg'): Promise<string> {
  const formData = new FormData();
  formData.append('image', blob, `avatar.${ext}`);
  const res = await api.post<{ url: string }>('/api/upload/avatar', formData);
  return res.url;
}

// ── Google OAuth Placeholder (Compatible with existing buttons) ───────

export async function signInWithGoogle(): Promise<void> {
  console.log('Initiating Google login flow via local backend session');
  // For demo/local environments, sign in as Robin admin or prompt email
  window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}login?email=robinfxa@gmail.com`;
}

export async function getGoogleIdentity(): Promise<UserIdentity | null> {
  return null;
}

export async function linkGoogle(): Promise<void> {
  console.log('Link Google identity requested');
}

export async function unlinkGoogle(identity: UserIdentity): Promise<void> {
  console.log('Unlink Google requested:', identity);
}
