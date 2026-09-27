import useSWR, { mutate } from 'swr';
import type { Bill } from '../lib/types';
import { fetchMyBills } from '../lib/api/bills';
import { useAuth } from './useAuth';

export function useBills() {
  const { user } = useAuth();

  const { data: bills, isLoading } = useSWR(
    user ? 'bills' : null,
    () => fetchMyBills(),
  );

  return {
    bills: bills || [],
    loading: isLoading,
    reload: () => mutate('bills'),
  };
}

export function mutateBills() {
  return mutate('bills');
}
