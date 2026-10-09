import useSWR, { mutate } from 'swr';
import { fetchSettlementCycles, fetchSettlementPreview, confirmSettlement, skipSettlement } from '../lib/api/settlements';
import type { SettlementListResponse, SettlementPreviewData } from '../lib/api/settlements';
import { useAuth } from './useAuth';
import { mutateBills } from './useBills';

export function useSettlements() {
  const { user } = useAuth();

  const { data, error, isLoading, mutate: revalidate } = useSWR<SettlementListResponse>(
    user ? 'weekly-settlements' : null,
    () => fetchSettlementCycles(),
    { revalidateOnFocus: true }
  );

  const confirmCycle = async (cycleId: string, proofImageUrl: string, proofNote?: string) => {
    const res = await confirmSettlement(cycleId, proofImageUrl, proofNote);
    await revalidate();
    await mutateBills();
    return res;
  };

  const skipCycle = async (cycleId: string) => {
    const res = await skipSettlement(cycleId);
    await revalidate();
    return res;
  };

  return {
    cycles: data?.cycles || [],
    currentWeek: data?.current_week || null,
    loading: isLoading,
    error,
    refresh: revalidate,
    confirmCycle,
    skipCycle,
  };
}

export function mutateSettlements() {
  return mutate('weekly-settlements');
}
