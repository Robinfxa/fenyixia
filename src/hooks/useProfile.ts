import useSWR, { mutate } from 'swr';
import { api } from '../lib/apiClient';
import { useAuth } from './useAuth';

export interface Profile {
  name: string;
  emoji: string;
  color: string;
  email: string;
  avatar_url?: string | null;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const res = await api.get<{ user: Profile | null }>(`/api/auth/user/${userId}`);
  return res.user ?? null;
}

export function useProfile() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useSWR(
    user ? `profile:${user.id}` : null,
    () => fetchProfile(user!.id),
  );

  return { profile: profile ?? null, loading: isLoading };
}

export function mutateProfile() {
  // Invalidate all profile keys
  return mutate((key) => typeof key === 'string' && key.startsWith('profile:'));
}
