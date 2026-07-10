import React, { useRef, useEffect, useState, useCallback } from 'react';
import { prefetchBookingPaymentSummary } from '../hooks/useApi';

const TIME_SLOTS = [
  "9:30 AM - 11:00 AM",
  "11:00 AM - 12:30 PM",
  "12:30 PM - 2:00 PM",
  "3:00 PM - 4:30 PM",
  "4:30 PM - 6:00 PM",
  "6:00 PM - 7:30 PM",
  "7:30 PM - 9:00 PM",
  "9:00 PM - 10:30 PM"
] as const;

// Compact time slot display
const getCompactTimeSlot = (slot: string) => {
  return slot.replace(' AM', '').replace(' PM', '').replace(' - ', '-');
};

type TimeSlot = typeof TIME_SLOTS[number];

interface Booking {
  id: number;
  name: string;
  phone: string;
  booking_date: string;
  time_slot: TimeSlot;
  booked_by: string;
  transaction_status?: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null;
  booking_type: 'NORMAL' | 'ACADEMY';
  actual_name?: string;
  academy_start_date?: string;
  academy_end_date?: string;
  academy_days_of_week?: string;
}

type BookingsData = Record<string, Booking>;

// A cancelled booking that still holds money — rendered as an overlay marker on
// its old slot so retained payments never silently vanish from the matrix.
export interface CancelledEntry {
  id: number;
  name: string;
  phone: string;
  booking_type: 'NORMAL' | 'ACADEMY';
  transaction_status?: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null;
  total_price: number;
  total_paid: number;
  leftover: number;
  cancelled_at?: string | null;
}

type CancelledData = Record<string, CancelledEntry[]>;

interface BookingMatrixProps {
  bookings: BookingsData;
  cancelled?: CancelledData;
  handleCellClick: (date: string, slot: TimeSlot) => void;
  startDate: string;
  endDate: string;
  onLoadPreviousWeek?: () => void;
  onLoadNextWeek?: () => void;
  isLoadingMore?: 'left' | 'right' | false;
}

export default function BookingMatrix({ bookings, cancelled = {}, handleCellClick, startDate, endDate, onLoadPreviousWeek, onLoadNextWeek, isLoadingMore }: BookingMatrixProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftIndicator, setShowLeftIndicator] = useState(false);
  const [showRightIndicator, setShowRightIndicator] = useState(false);
  const scrollDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasUserScrolledRef = useRef(false);
  const lastScrollLeftRef = useRef(0);
  // Debounce prefetch so a quick swipe across the grid doesn't fan out N
  // requests; a 120ms dwell is enough to filter out incidental hovers.
  const prefetchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prefetchedRef = useRef<Set<number>>(new Set());

  const handleCellHover = useCallback((bookingId: number | undefined) => {
    if (!bookingId || prefetchedRef.current.has(bookingId)) return;
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      prefetchBookingPaymentSummary(bookingId);
      prefetchedRef.current.add(bookingId);
    }, 120);
  }, []);

  const handleCellLeave = useCallback(() => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingMore !== false) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const scrollRight = scrollWidth - clientWidth - scrollLeft;

    if (Math.abs(scrollLeft - lastScrollLeftRef.current) > 10) {
      hasUserScrolledRef.current = true;
    }
    lastScrollLeftRef.current = scrollLeft;

    if (hasUserScrolledRef.current) {
      setShowLeftIndicator(scrollLeft < 50 && onLoadPreviousWeek !== undefined);
      setShowRightIndicator(scrollRight < 50 && onLoadNextWeek !== undefined);
    }

    if (scrollDebounceRef.current) {
      clearTimeout(scrollDebounceRef.current);
    }

    if (hasUserScrolledRef.current) {
      scrollDebounceRef.current = setTimeout(() => {
        if (scrollLeft <= 5 && onLoadPreviousWeek) {
          hasUserScrolledRef.current = false;
          onLoadPreviousWeek();
        } else if (scrollRight <= 5 && onLoadNextWeek) {
          hasUserScrolledRef.current = false;
          onLoadNextWeek();
        }
      }, 300);
    }
  }, [onLoadPreviousWeek, onLoadNextWeek, isLoadingMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => {
        container.removeEventListener('scroll', handleScroll);
        if (scrollDebounceRef.current) {
          clearTimeout(scrollDebounceRef.current);
        }
      };
    }
  }, [handleScroll]);

  const getDatesInRange = (start: string, end: string) => {
    const dates = [];
    let currentDate = new Date(start);
    const endDate = new Date(end);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  };

  const dateRange = getDatesInRange(startDate, endDate);

  return (
    <div className="glass-card rounded-xl p-4 relative animate-fadeInUp">
        {/* Left edge indicator */}
        {(showLeftIndicator || isLoadingMore === 'left') && (
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-orange-500/20 to-transparent z-20 flex items-center justify-start pl-2 pointer-events-none rounded-l-xl">
            <div className="flex flex-col items-center text-orange-400">
              {isLoadingMore === 'left' ? (
                <>
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                    <path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z" />
                  </svg>
                  <span className="text-[9px] font-medium mt-1">Loading</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-[9px] font-medium">Prev</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Right edge indicator */}
        {(showRightIndicator || isLoadingMore === 'right') && (
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-orange-500/20 to-transparent z-20 flex items-center justify-end pr-2 pointer-events-none rounded-r-xl">
            <div className="flex flex-col items-center text-orange-400">
              {isLoadingMore === 'right' ? (
                <>
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                    <path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z" />
                  </svg>
                  <span className="text-[9px] font-medium mt-1">Loading</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-[9px] font-medium">Next</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* pb-3 keeps the chunky orange scrollbar clear of the last slot row. */}
        <div ref={scrollContainerRef} className="overflow-x-auto scroll-smooth scrollbar-sleek pb-3">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {/* Sticky left column narrower on mobile (w-12) so the matrix
                    has more horizontal room for actual date columns. Opaque
                    background so booked cells don't bleed through while scrolling. */}
                <th className="sticky left-0 z-10 bg-[#0d0d11] p-1 text-[10px] text-white/30 font-normal w-12 sm:w-20"></th>
                {dateRange.map((date) => (
                  <th key={date.toISOString()} className="p-0.5 sm:p-1 text-center min-w-[62px] sm:min-w-[96px]">
                  <div className="text-[11px] sm:text-[13px] font-semibold text-white/60">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="text-[10px] sm:text-xs text-white/25">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((slot) => (
              <tr key={slot}>
                {/* Time column: smaller text, narrower width on mobile. Opaque
                    background + right divider so it reads as a frozen column and
                    booked cells never show through when scrolling horizontally. */}
                <td className="sticky left-0 z-10 bg-[#0d0d11] border-r border-white/[0.06] p-0.5 sm:p-1 pr-1 sm:pr-2 text-right text-[10px] sm:text-xs text-white/60 whitespace-nowrap font-medium w-12 sm:w-20">
                  {getCompactTimeSlot(slot)}
                </td>
                {dateRange.map((date) => {
                  const dateString = date.toISOString().split('T')[0];
                  const booking = bookings[`${dateString}_${slot}`];
                  const cancelledList = cancelled[`${dateString}_${slot}`];
                  const hasCancelled = !!cancelledList && cancelledList.length > 0;

                  // Base look: live booking (orange/academy purple) → cancelled-
                  // only (muted slate, so retained money is still visible) → open.
                  const baseClass = booking
                    ? (booking.booking_type === 'ACADEMY'
                        ? 'bg-purple-600/80 hover:bg-purple-500/90 shadow-lg shadow-purple-500/10'
                        : 'bg-orange-600/80 hover:bg-orange-500/90 shadow-lg shadow-orange-500/10')
                    : hasCancelled
                    ? 'bg-slate-600/25 hover:bg-slate-600/35 border border-dashed border-red-400/30'
                    : 'bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-orange-500/20';

                  return (
                    <td
                      key={`${dateString}_${slot}`}
                      className="p-0.5 min-w-[62px] sm:min-w-[96px]"
                    >
                      <div
                        className={`h-10 sm:h-12 rounded-md sm:rounded-lg cursor-pointer transition-all duration-200 flex flex-col justify-center items-center px-0.5 sm:px-1 relative ${baseClass}`}
                        onClick={() => handleCellClick(dateString, slot)}
                        onMouseEnter={() => handleCellHover(booking?.id)}
                        onMouseLeave={handleCellLeave}
                      >
                        {/* Cancelled-with-money marker — top-left corner so it can
                            coexist with the live booking's payment status at
                            top-right (a re-booked slot shows BOTH marks). */}
                        {hasCancelled && (
                          <div
                            title={`${cancelledList!.length} cancelled booking(s) with ৳${cancelledList!.reduce((s, c) => s + c.total_paid, 0).toLocaleString()} retained`}
                            className="absolute top-0 left-0 w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center rounded-tl-md rounded-br-md sm:rounded-tl-lg sm:rounded-br-lg bg-red-600 z-10"
                          >
                            <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        )}

                        {booking ? (
                          <>
                            <div className="text-[10px] sm:text-[13px] font-semibold text-white truncate w-full text-center overflow-hidden">
                              {booking.name}
                            </div>
                            {/* Payment status corner indicator */}
                            {(() => {
                              const status = booking.transaction_status?.toUpperCase();
                              const isPaid = status === 'SUCCESSFUL';
                              const isPartial = status === 'PARTIAL';
                              return (
                                <div
                                  className={`absolute top-0 right-0 w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center rounded-bl-md rounded-tr-md sm:rounded-bl-lg sm:rounded-tr-lg ${
                                    isPaid
                                      ? 'bg-emerald-500'
                                      : isPartial
                                      ? 'bg-yellow-400'
                                      : 'bg-red-500'
                                  }`}
                                >
                                  {isPaid ? (
                                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  ) : isPartial ? (
                                    <span className="text-[9px] font-bold text-black">½</span>
                                  ) : (
                                    <span className="text-[9px] font-bold text-white">!</span>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        ) : hasCancelled ? (
                          <>
                            <div className="text-[9px] sm:text-[11px] font-semibold text-red-300/80 line-through truncate w-full text-center">
                              {cancelledList![0].name}
                            </div>
                            <div className="text-[8px] sm:text-[10px] text-emerald-300/80 font-medium">
                              ৳{cancelledList!.reduce((s, c) => s + c.total_paid, 0).toLocaleString()}
                            </div>
                          </>
                        ) : (
                          <div className="text-[10px] sm:text-xs text-white/15">Open</div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
