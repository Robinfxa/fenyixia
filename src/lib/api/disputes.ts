import { api } from '../apiClient';
import type { BillDispute, DisputeSuggestedItem } from '../types';

export async function fetchDispute(billId: string): Promise<BillDispute | null> {
  const res = await api.get<{ dispute: BillDispute | null }>(`/api/disputes/bill/${billId}`);
  return res.dispute || null;
}

export async function createDispute(
  billId: string,
  challengerId: string,
  reason: string,
  suggestedItems: DisputeSuggestedItem[]
): Promise<void> {
  await api.post('/api/disputes', {
    bill_id: billId,
    challenger_id: challengerId,
    reason,
    suggested_items: suggestedItems,
  });
}

export async function updateDispute(
  disputeId: string,
  suggestedItems: DisputeSuggestedItem[]
): Promise<void> {
  await api.put(`/api/disputes/${disputeId}`, {
    suggested_items: suggestedItems,
  });
}

export async function resolveDispute(
  disputeId: string,
  billId: string,
  accepted: boolean,
  suggestedItems?: DisputeSuggestedItem[],
  billTitle?: string,
  billIcon?: string
): Promise<void> {
  await api.post(`/api/disputes/${disputeId}/resolve`, {
    bill_id: billId,
    accepted,
    suggested_items: suggestedItems,
    bill_title: billTitle,
    bill_icon: billIcon,
  });
}
