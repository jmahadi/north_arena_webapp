import useSWR, { mutate, preload } from 'swr';
import api from '../utils/axios';
import { DashboardData } from '../api/auth';
import {
  getFinancialJournal,
  FinancialJournalFilters,
  FinancialJournalResponse,
  getBookingPaymentSummary,
  BookingPaymentSummary,
} from '../api/transactions';

// Generic fetcher for SWR that uses the axios instance (includes auth headers)
const fetcher = (url: string) => api.get(url).then(res => res.data);

/**
 * Current logged-in admin (identity + role). Cached for the session and used to
 * gate master-only UI (Users, Activity, Delete, pricing).
 */
export function useMe() {
  const { data, error, isLoading } = useSWR(
    '/api/me',
    (url: string) => api.get(url).then(res => res.data.user),
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );
  return {
    me: data || null,
    isMaster: data?.role === 'MASTER',
    isLoading,
    error,
  };
}

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
 *
 * SWR value shape is { bookings, cancelled }:
 *   - bookings:  live (non-cancelled) slots, keyed "YYYY-MM-DD_slot".
 *   - cancelled: cancelled-but-paid slots (arrays), same keys — rendered as a
 *     retained-money overlay so cancelled bookings never silently disappear.
 */
type MatrixState = { bookings: Record<string, any>; cancelled: Record<string, any[]> };
const EMPTY_MATRIX: MatrixState = { bookings: {}, cancelled: {} };

export function useBookings(startDate: string, endDate: string) {
  const key = startDate && endDate ? `/api/bookings?start_date=${startDate}&end_date=${endDate}` : null;

  const { data, error, isLoading, mutate: mutateBookings } = useSWR<MatrixState>(
    key,
    async (url: string) => {
      // /api/bookings embeds transaction_status via a server-side join and now
      // also returns cancelledData — a single round-trip covers the whole matrix.
      const res = await api.get(url);
      return { bookings: res.data.bookingsData || {}, cancelled: res.data.cancelledData || {} };
    },
    {
      revalidateOnMount: true,
    }
  );

  const state = data || EMPTY_MATRIX;

  return {
    bookings: state.bookings,
    cancelled: state.cancelled,
    isLoading: isLoading && !data,
    error,
    refresh: () => mutateBookings(),
    // Replace both maps at once — used after add/update/delete/cancel where the
    // server returns the freshly rebuilt matrix.
    setMatrix: (bookingsData: any, cancelledData?: any) =>
      mutateBookings({ bookings: bookingsData || {}, cancelled: cancelledData || {} }, { revalidate: false }),
    // Merge a partial range into the existing matrix (paging left/right).
    mergeMatrix: (bookingsPartial: any, cancelledPartial: any, prepend: boolean) =>
      mutateBookings((cur) => {
        const base = cur || EMPTY_MATRIX;
        return prepend
          ? {
              bookings: { ...(bookingsPartial || {}), ...base.bookings },
              cancelled: { ...(cancelledPartial || {}), ...base.cancelled },
            }
          : {
              bookings: { ...base.bookings, ...(bookingsPartial || {}) },
              cancelled: { ...base.cancelled, ...(cancelledPartial || {}) },
            };
      }, { revalidate: false }),
    // Optimistically patch transaction_status for a booking across all its matrix
    // entries. Used after payment add/update/delete so the icon updates instantly.
    patchBookingStatus: (bookingId: number, status: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null) => {
      mutateBookings(
        (current) => {
          if (!current) return current;
          const next: Record<string, any> = {};
          for (const k of Object.keys(current.bookings)) {
            const b = current.bookings[k];
            next[k] = b && b.id === bookingId ? { ...b, transaction_status: status } : b;
          }
          return { ...current, bookings: next };
        },
        { revalidate: false }
      );
    },
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

/**
 * Warm the SWR cache for a booking's payment summary so opening the modal is
 * instant. Safe to call on every cell hover — preload dedupes in-flight
 * requests internally.
 */
export function prefetchBookingPaymentSummary(bookingId: number) {
  preload(`booking-payment-summary:${bookingId}`, () => getBookingPaymentSummary(bookingId));
}
