import useSWR, { mutate } from 'swr';
import api from '../utils/axios';
import { DashboardData } from '../api/auth';
import { getTransactionSummaries } from '../api/transactions';

// Generic fetcher for SWR that uses the axios instance (includes auth headers)
const fetcher = (url: string) => api.get(url).then(res => res.data);

/**
 * Dashboard data hook - caches data and shows stale content instantly on navigation.
 * Revalidates in the background every 2 minutes.
 */
export function useDashboard() {
  const { data, error, isLoading, isValidating, mutate: mutateDashboard } = useSWR<DashboardData>(
    '/api/dashboard',
    fetcher,
    {
      revalidateOnMount: true,
      refreshInterval: 120000,  // Auto-refresh every 2 min
    }
  );

  return {
    data,
    isLoading: isLoading && !data,  // Only show loading spinner on first load
    isRefreshing: isValidating && !!data,  // Background refresh indicator
    error,
    refresh: () => mutateDashboard(),
  };
}

/**
 * Bookings data hook - caches per date range.
 */
export function useBookings(startDate: string, endDate: string) {
  const key = startDate && endDate ? `/api/bookings?start_date=${startDate}&end_date=${endDate}` : null;

  const { data, error, isLoading, mutate: mutateBookings } = useSWR(
    key,
    async (url: string) => {
      const [bookingsRes, summaries] = await Promise.all([
        api.get(url),
        getTransactionSummaries(),
      ]);

      const bookingsData = bookingsRes.data.bookingsData || {};

      // Merge transaction status into bookings
      const statusMap = new Map<number, string>();
      summaries.forEach((s: any) => statusMap.set(s.booking_id, s.status));

      Object.values(bookingsData).forEach((booking: any) => {
        if (booking.id) {
          booking.transaction_status = statusMap.get(booking.id) || null;
        }
      });

      return bookingsData;
    },
    {
      revalidateOnMount: true,
    }
  );

  return {
    bookings: data || {},
    isLoading: isLoading && !data,
    error,
    refresh: () => mutateBookings(),
    setBookings: (newData: any) => mutateBookings(newData, { revalidate: false }),
  };
}

/**
 * Invalidate all cached data after a mutation (add/update/delete booking or transaction).
 */
export function invalidateAll() {
  // Revalidate all SWR keys - triggers background refetch of dashboard, bookings, etc.
  mutate(() => true, undefined, { revalidate: true });
}
