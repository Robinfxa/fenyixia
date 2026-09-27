import { api } from '../apiClient';
import { ICON_COLORS, roundCents } from '../utils';
import type { Bill, BillItem, CreateBillData, UpdateBillData } from '../types';
import { getCurrentUser } from './auth';

interface RawBillItem {
  id: string;
  name: string;
  price: number | string;
  qty: number;
  sort_order: number;
  members: { user: { id: string; name: string; emoji: string } }[];
}

interface RawBill {
  id: string;
  icon: string;
  title: string;
  description: string | null;
  total_amount: number;
  date: string;
  payer_id: string;
  settled: boolean;
  color: string | null;
  payer: { id: string; name: string; emoji: string; email: string } | null;
  items: RawBillItem[];
}

function normalizeBill(raw: RawBill, currentUserId: string): Bill {
  const items: BillItem[] = (raw.items || []).map((item) => ({
    id: item.id,
    name: item.name,
    price: roundCents(Number(item.price) || 0),
    qty: Number(item.qty) || 1,
    members: (item.members || []).map((m) => m.user),
  }));

  const totalAmount = roundCents(items.reduce((s, i) => s + roundCents(i.price * i.qty), 0));

  let myShare = 0;
  items.forEach((item) => {
    const isMember = item.members.some((m) => m.id === currentUserId);
    if (isMember && item.members.length > 0) {
      const itemTotal = roundCents(item.price * item.qty);
      myShare += itemTotal / item.members.length;
    }
  });
  myShare = roundCents(myShare);

  const memberMap = new Map<string, { id: string; name: string; emoji: string }>();
  items.forEach((item) => {
    item.members.forEach((m) => memberMap.set(m.id, m));
  });
  if (raw.payer) memberMap.set(raw.payer.id, raw.payer);
  const allMembers = [...memberMap.values()];

  const perAmount = allMembers.length > 0 ? totalAmount / allMembers.length : 0;

  return {
    id: raw.id,
    icon: raw.icon,
    title: raw.title,
    description: raw.description || '',
    total_amount: totalAmount,
    date: raw.date,
    payer_id: raw.payer_id,
    payer_name: raw.payer?.name || '未知',
    payer_emoji: raw.payer?.emoji || '😀',
    payer_email: raw.payer?.email || '',
    settled: raw.settled,
    color: raw.color || (ICON_COLORS as Record<string, string>)[raw.icon] || (ICON_COLORS as Record<string, string>)['🧾'] || '#4F46E5',
    items,
    members: allMembers,
    per_amount: perAmount,
    my_share: myShare,
    _hasMeProof: (raw as any)._hasMeProof || false,
    _proofUserIds: new Set((raw as any)._proofUserIds || []),
    _manualPaidUserIds: new Set((raw as any)._manualPaidUserIds || []),
    _dispute: (raw as any)._dispute || null,
  };
}

export async function fetchMyBills(): Promise<Bill[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const res = await api.get<{ bills: RawBill[] }>('/api/bills');
  const bills = res.bills || [];

  return bills.map((bill) => normalizeBill(bill, user.id));
}

export async function createBill(billData: CreateBillData): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('未登录');

  const res = await api.post<{ id: string; success: boolean }>('/api/bills', billData);
  return res.id;
}

export async function updateBill(billId: string, billData: UpdateBillData): Promise<void> {
  await api.put(`/api/bills/${billId}`, billData);
}

export async function deleteBill(billId: string): Promise<void> {
  await api.delete(`/api/bills/${billId}`);
}

export async function toggleSettled(billId: string, settled: boolean): Promise<void> {
  await api.patch(`/api/bills/${billId}/settled`, { settled });
}
