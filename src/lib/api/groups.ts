import { api } from '../apiClient';
import type { Member } from '../types';

export interface Group {
  id: string;
  name: string;
  emoji: string;
  owner_id: string;
  created_at: string;
  members: Member[];
}

export async function getGroups(): Promise<Group[]> {
  const res = await api.get<{ groups: Group[] }>('/api/groups');
  return res.groups || [];
}

export async function createGroup(name: string, emoji: string, memberIds: string[]): Promise<Group> {
  const res = await api.post<{ group: Group }>('/api/groups', {
    name,
    emoji,
    member_ids: memberIds,
  });
  return res.group;
}

export async function updateGroup(groupId: string, name: string, emoji: string): Promise<void> {
  await api.put(`/api/groups/${groupId}`, { name, emoji });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await api.delete(`/api/groups/${groupId}`);
}

export async function addGroupMembers(groupId: string, userIds: string[]): Promise<void> {
  await api.post(`/api/groups/${groupId}/members`, { user_ids: userIds });
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  await api.delete(`/api/groups/${groupId}/members/${userId}`);
}

export async function setGroupMembers(groupId: string, userIds: string[]): Promise<void> {
  await api.put(`/api/groups/${groupId}/members`, { user_ids: userIds });
}

