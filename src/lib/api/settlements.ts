import { api } from '../apiClient';

export interface SettlementCycle {
  id: string;
  user_id: string;
  friend_id: string;
  other_user: {
    id: string;
    name: string;
    emoji: string;
    color: string;
  };
  cycle_start: string;
  cycle_end: string;
  status: 'pending' | 'overdue' | 'confirmed';
  net_amount: number; // positive: they owe me, negative: I owe them
  bill_count: number;
  proof_image_url?: string | null;
  proof_note?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  created_at: string;
}

export interface SettlementPreviewBill {
  id: string;
  title: string;
  icon: string;
  color?: string;
  description?: string;
  total_amount: number;
  date: string;
  payer_id: string;
  my_share: number;
  their_share: number;
  pending_amount: number;
  i_am_payer: boolean;
  has_dispute?: boolean;
  dispute?: any | null;
}

export interface SettlementPreviewData {
  friend: {
    id: string;
    name: string;
    emoji: string;
    color: string;
  };
  they_owe_me: number;
  i_owe_them: number;
  net_amount: number;
  bills: SettlementPreviewBill[];
}

export interface SettlementListResponse {
  current_week: {
    cycleStart: string;
    cycleEnd: string;
  };
  cycles: SettlementCycle[];
}

export async function fetchSettlementCycles(): Promise<SettlementListResponse> {
  const res = await api.get<SettlementListResponse>('/api/settlements');
  return res;
}

export async function fetchSettlementPreview(friendId: string): Promise<SettlementPreviewData> {
  const res = await api.get<SettlementPreviewData>(`/api/settlements/preview/${friendId}`);
  return res;
}

export async function uploadProofImage(file: File): Promise<{ url: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<{ success: boolean; url: string; filename: string }>('/api/upload/proof', formData);
  return res;
}

export async function confirmSettlement(
  cycleId: string,
  proofImageUrl: string,
  proofNote?: string
): Promise<{ success: boolean; cleared_bills_count: number; proof_image_url: string }> {
  return await api.post(`/api/settlements/${cycleId}/confirm`, {
    proof_image_url: proofImageUrl,
    proof_note: proofNote || '',
  });
}

export async function skipSettlement(cycleId: string): Promise<{ success: boolean }> {
  return await api.delete(`/api/settlements/${cycleId}`);
}
