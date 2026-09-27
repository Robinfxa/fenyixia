import { api } from '../apiClient';
import type { Member } from '../types';
import { getCurrentUser } from './auth';
import { getInitial, getPinyinSortKey } from '../pinyin';

export interface FriendWithAlias extends Member {
  friendship_id: string;
  alias?: string;
  email?: string;
  _pinyinInitial?: string;
  _pinyinSortKey?: string;
}

export interface FriendRequest {
  id: string;
  from_user: string;
  to_user: string;
  status: string;
  created_at: string;
  user: { id: string; name: string; emoji: string } | null;
}

export interface SearchUserResult {
  id: string;
  name: string;
  emoji: string;
}

export type AddFriendResult =
  | { type: 'request_sent' }
  | { type: 'auto_accepted' }
  | { type: 'already_friends' }
  | { type: 'already_requested' }
  | { type: 'invited'; email: string }
  | { type: 'already_invited'; email: string };

export async function getFriends(): Promise<FriendWithAlias[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const res = await api.get<{ friends: any[] }>('/api/friends');
  const rawFriends = res.friends || [];

  return rawFriends.map((u) => {
    const alias = u.alias;
    return {
      id: u.id,
      name: u.name,
      emoji: u.emoji,
      color: u.color,
      email: u.email,
      friendship_id: u.friendship_id,
      alias,
      _pinyinInitial: getInitial(alias || u.name || ''),
      _pinyinSortKey: getPinyinSortKey(alias || u.name || ''),
    };
  });
}

export async function updateFriendAlias(
  friendshipId: string,
  _friendId: string,
  alias: string
): Promise<void> {
  await api.put(`/api/friends/${friendshipId}/alias`, { alias });
}

export async function searchUserByEmail(email: string): Promise<SearchUserResult | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error('未登录');
  if (email === user.email) throw new Error('不能添加自己为好友');

  const res = await api.get<{ user: any }>('/api/auth/search', { params: { email } });
  if (!res.user) return null;
  return {
    id: res.user.id,
    name: res.user.name,
    emoji: res.user.emoji,
  };
}

export async function sendFriendRequest(toUserId: string): Promise<'sent' | 'auto_accepted'> {
  const res = await api.post<AddFriendResult>('/api/friends/add', { email: toUserId });
  return res.type === 'auto_accepted' ? 'auto_accepted' : 'sent';
}

export async function getReceivedRequests(): Promise<FriendRequest[]> {
  const res = await api.get<{ requests: FriendRequest[] }>('/api/friends/requests/received');
  return res.requests || [];
}

export async function getSentRequests(): Promise<FriendRequest[]> {
  const res = await api.get<{ requests: FriendRequest[] }>('/api/friends/requests/sent');
  return res.requests || [];
}

export async function acceptFriendRequest(requestId: string): Promise<void> {
  await api.post(`/api/friends/requests/${requestId}/accept`);
}

export async function rejectFriendRequest(requestId: string): Promise<void> {
  await api.post(`/api/friends/requests/${requestId}/reject`);
}

export async function addFriend(email: string): Promise<AddFriendResult> {
  return await api.post<AddFriendResult>('/api/friends/add', { email });
}

export async function deleteFriend(friendshipId: string): Promise<void> {
  await api.delete(`/api/friends/${friendshipId}`);
}

