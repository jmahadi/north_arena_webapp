import useSWR, { mutate } from 'swr';
import api from '../utils/axios';
import { DashboardData } from '../api/auth';
import {
  getTransactionSummaries,
  getFinancialJournal,
  FinancialJournalFilters,
  FinancialJournalResponse,
  getBookingPaymentSummary,
  BookingPaymentSummary,
} from '../api/transactions';

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
 * Financial journal hook - caches per filter combination.
 * Shows stale data instantly when switching between filter presets.
 */
export function useFinancialJournal(filters: FinancialJournalFilters, selectedPaymentMethods: string[], selectedTransactionTypes: string[]) {
  // Build a stable cache key from all filter params
  const key = filters.startDate && filters.endDate
    ? `financial-journal:${filters.startDate}:${filters.endDate}:${selectedPaymentMethods.join(',')}:${selectedTransactionTypes.join(',')}`
    : null;

  const { data, error, isLoading, isValidating, mutate: mutateJournal } = useSWR<FinancialJournalResponse>(
    key,
    async () => {
      const filterParams: FinancialJournalFilters = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        paymentMethod: selectedPaymentMethods.length > 0 ? selectedPaymentMethods.join(',') : undefined,
        transactionType: selectedTransactionTypes.length > 0 ? selectedTransactionTypes.join(',') : undefined,
      };
      return getFinancialJournal(filterParams);
    },
    {
      revalidateOnMount: true,
      keepPreviousData: true,  // Show previous filter results while loading new ones
    }
  );

  return {
    data,
    isLoading: isLoading && !data,
    isRefreshing: isValidating && !!data,
    error,
    refresh: () => mutateJournal(),
  };
}

/**
 * Booking payment summary hook - caches per booking ID.
 * When reopening a modal for the same booking, shows stale data instantly.
 */
export function useBookingPaymentSummary(bookingId: number | null, isOpen: boolean) {
  const key = isOpen && bookingId ? `booking-payment-summary:${bookingId}` : null;

  const { data, error, isLoading, isValidating, mutate: mutateSummary } = useSWR<BookingPaymentSummary>(
    key,
    async () => {
      return getBookingPaymentSummary(bookingId!);
    },
    {
      revalidateOnMount: true,
    }
  );

  return {
    paymentSummary: data || null,
    isLoading: isLoading && !data,
    isRefreshing: isValidating && !!data,
    error,
    refresh: () => mutateSummary(),
  };
}

/**
 * Invalidate all cached data after a mutation (add/update/delete booking or transaction).
 */
export function invalidateAll() {
  // Revalidate all SWR keys - triggers background refetch of dashboard, bookings, etc.
  mutate(() => true, undefined, { revalidate: true });
}
