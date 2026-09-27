import { api } from '../apiClient';
import type { Member } from '../types';

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export async function getTags(): Promise<Tag[]> {
  const res = await api.get<{ tags: Tag[] }>('/api/tags');
  return res.tags || [];
}

export async function createTag(name: string, color: string = '#0A84FF'): Promise<Tag> {
  const res = await api.post<{ tag: Tag }>('/api/tags', { name, color });
  return res.tag;
}

export async function updateTag(tagId: string, name: string, color: string): Promise<void> {
  await api.put(`/api/tags/${tagId}`, { name, color });
}

export async function deleteTag(tagId: string): Promise<void> {
  await api.delete(`/api/tags/${tagId}`);
}

export async function getFriendTags(friendshipId: string): Promise<Tag[]> {
  const res = await api.get<{ tags: Tag[] }>(`/api/tags/friend/${friendshipId}`);
  return res.tags || [];
}

export async function setFriendTags(friendshipId: string, tagIds: string[]): Promise<void> {
  await api.put(`/api/tags/friend/${friendshipId}`, { tag_ids: tagIds });
}

export async function getFriendsByTag(tagId: string): Promise<Member[]> {
  const res = await api.get<{ friends: Member[] }>(`/api/tags/${tagId}/friends`);
  return res.friends || [];
}

export async function setTagFriends(tagId: string, userIds: string[]): Promise<void> {
  await api.put(`/api/tags/${tagId}/friends`, { user_ids: userIds });
}

