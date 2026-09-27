import { api } from '../apiClient';
import type { PaymentProof } from '../types';

export async function uploadPaymentProof(billId: string, file: File | Blob): Promise<string> {
  const formData = new FormData();
  formData.append('bill_id', billId);
  formData.append('file', file, file instanceof File ? file.name : 'proof.png');

  const res = await api.post<{ image_url: string }>('/api/payments/proofs/upload', formData);
  return res.image_url;
}

export async function getPaymentProofs(billId: string): Promise<PaymentProof[]> {
  const res = await api.get<{ proofs: PaymentProof[] }>(`/api/payments/proofs/${billId}`);
  return res.proofs || [];
}

export async function toggleManualPayment(billId: string, userId: string): Promise<boolean> {
  const res = await api.post<{ settled: boolean }>('/api/payments/manual/toggle', {
    bill_id: billId,
    user_id: userId,
  });
  return Boolean(res.settled);
}

export async function getManualPayments(billId: string): Promise<Set<string>> {
  const res = await api.get<{ user_ids: string[] }>(`/api/payments/manual/${billId}`);
  return new Set(res.user_ids || []);
}
