'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import BookingMatrix from '../components/BookingMatrix';
import BookingSlotModal, { SlotBookingDraft } from '../components/BookingSlotModal';
import DateRangeSlider from '../components/DateRangeSlider';
import { fetchBookings, addBooking, updateBooking, deleteBooking, checkBookingHasTransactions } from '../api/bookings';
import { useBookings, invalidateAll } from '../hooks/useApi';
import Cookies from 'js-cookie';
import axios from 'axios';

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

type TimeSlot = typeof TIME_SLOTS[number];
type TransactionStatus = 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null;

interface Booking {
  id: number;
  name: string;
  phone: string;
  booking_date: string;
  time_slot: TimeSlot;
  booked_by: string;
  transaction_status?: TransactionStatus;
  booking_type: 'NORMAL' | 'ACADEMY';
  actual_name?: string;
  academy_start_date?: string;
  academy_end_date?: string;
  academy_days_of_week?: string;
}

const DEFAULT_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const todayISO = () => new Date().toISOString().split('T')[0];
const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

export default function BookingsPage() {
  const router = useRouter();
  const [isLoadingMore, setIsLoadingMore] = useState<'left' | 'right' | false>(false);

  // Default range: last 7 days + next 7 days from today (15-day window)
  const [startDate, setStartDate] = useState(() => addDays(todayISO(), -7));
  const [endDate, setEndDate] = useState(() => addDays(todayISO(), 7));

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState<SlotBookingDraft | null>(null);

  const { bookings, isLoading, refresh: refreshBookings, setBookings, patchBookingStatus } = useBookings(startDate, endDate);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const fetchAndMergeBookings = async (fetchStart: string, fetchEnd: string) => {
    try {
      // /api/bookings now returns transaction_status inline — one network call suffices.
      const bookingsResponse = await fetchBookings(fetchStart, fetchEnd);
      return bookingsResponse.bookingsData || {};
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
      return {};
    }
  };

  const handleLoadPreviousWeek = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore('left');
    const newStartStr = addDays(startDate, -7);
    const prevWeekEndStr = addDays(startDate, -1);
    const newBookings = await fetchAndMergeBookings(newStartStr, prevWeekEndStr);
    setBookings((prev: any) => ({ ...newBookings, ...prev }));
    setStartDate(newStartStr);
    setIsLoadingMore(false);
  };

  const handleLoadNextWeek = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore('right');
    const newEndStr = addDays(endDate, 7);
    const nextWeekStartStr = addDays(endDate, 1);
    const newBookings = await fetchAndMergeBookings(nextWeekStartStr, newEndStr);
    setBookings((prev: any) => ({ ...prev, ...newBookings }));
    setEndDate(newEndStr);
    setIsLoadingMore(false);
  };

  const handleDateRangeChange = (newStart: string, newEnd: string) => {
    setStartDate(newStart);
    setEndDate(newEnd);
  };

  // Open unified modal on any slot click. Live-reads from bookings so re-opens
  // always see the current status.
  const handleCellClick = (date: string, slot: TimeSlot) => {
    const booking = bookings[`${date}_${slot}`] as Booking | undefined;
    if (booking) {
      setModalDraft({
        id: booking.id,
        name: booking.name,
        phone: booking.phone,
        selectedDate: date,
        selectedSlot: slot,
        bookingType: booking.booking_type,
        academyStartDate: booking.academy_start_date || '',
        academyEndDate: booking.academy_end_date || '',
        academyDaysOfWeek: booking.academy_days_of_week ? booking.academy_days_of_week.split(',') : DEFAULT_DAYS,
        isBulkBooking: false,
        transactionStatus: booking.transaction_status || null,
      });
    } else {
      setModalDraft({
        id: null,
        name: '',
        phone: '',
        selectedDate: date,
        selectedSlot: slot,
        bookingType: 'NORMAL',
        academyStartDate: '',
        academyEndDate: '',
        academyDaysOfWeek: DEFAULT_DAYS,
        isBulkBooking: false,
        transactionStatus: null,
      });
    }
    setIsModalOpen(true);
  };

  // Re-sync the open modal draft with live bookings data so transactionStatus updates
  // propagate while the modal is open without requiring a re-open.
  const liveDraft = useMemo<SlotBookingDraft | null>(() => {
    if (!modalDraft) return null;
    if (!modalDraft.id) return modalDraft;
    // Find the booking in the current map by id
    const match = Object.values(bookings).find((b: any) => b && b.id === modalDraft.id) as Booking | undefined;
    if (!match) return modalDraft;
    return { ...modalDraft, transactionStatus: match.transaction_status || null };
  }, [bookings, modalDraft]);

  const handleSubmitFromModal = async (draft: SlotBookingDraft) => {
    try {
      let result;
      if (draft.id && draft.selectedSlot) {
        result = await updateBooking(
          draft.id, draft.name, draft.phone, draft.selectedDate, draft.selectedSlot, startDate, endDate,
          draft.bookingType, draft.academyStartDate, draft.academyEndDate, draft.academyDaysOfWeek
        );
      } else if (draft.selectedSlot) {
        result = await addBooking(
          draft.name, draft.phone, draft.selectedDate, draft.selectedSlot, startDate, endDate,
          draft.bookingType, draft.academyStartDate, draft.academyEndDate, draft.academyDaysOfWeek
        );
      } else {
        throw new Error('No time slot selected');
      }

      if (result.success) {
        if (result.bookingsData) {
          setBookings(result.bookingsData);
        }
        invalidateAll();
        refreshBookings();
        setIsModalOpen(false);
        setModalDraft(null);
      } else {
        throw new Error(result.message || 'An error occurred');
      }
    } catch (error) {
      let errorMessage = 'An error occurred while submitting the booking.';
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data.detail || error.response.data.message || errorMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new Error(errorMessage);
    }
  };

  const handleDeleteFromModal = async (bookingId: number) => {
    try {
      const hasTransactions = await checkBookingHasTransactions(bookingId);
      let retainPayments = true;

      if (hasTransactions) {
        const userChoice = confirm(
          'This booking has payment records.\n\n' +
          'Click OK to cancel the booking but RETAIN payment records for accounting.\n' +
          'Click Cancel to abort deletion.'
        );
        if (!userChoice) return;

        const hardDelete = confirm(
          'Do you also want to DELETE the payment records?\n\n' +
          'Click OK to permanently delete ALL payment records (not recommended).\n' +
          'Click Cancel to keep payment records for financial journal.'
        );
        retainPayments = !hardDelete;
      } else {
        const confirmDelete = confirm('Are you sure you want to delete this booking?');
        if (!confirmDelete) return;
        retainPayments = false;
      }

      const result = await deleteBooking(bookingId, startDate, endDate, retainPayments);
      if (result.success) {
        if (result.bookingsData) {
          setBookings(result.bookingsData);
        } else {
          refreshBookings();
        }
        invalidateAll();
        setIsModalOpen(false);
        setModalDraft(null);
      } else {
        alert(result.message || 'Failed to delete booking');
      }
    } catch (error) {
      console.error('Failed to delete booking:', error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        router.push('/login');
      } else {
        alert('An error occurred while deleting the booking');
      }
    }
  };

  const handleStatusChange = (bookingId: number, status: TransactionStatus) => {
    patchBookingStatus(bookingId, status);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="relative" style={{ width: 80, height: 80 }}>
            <svg className="animate-spin" style={{ width: 80, height: 80 }} viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="22" fill="none" stroke="rgba(249, 115, 22, 0.2)" strokeWidth={3} />
              <circle cx="25" cy="25" r="22" fill="none" stroke="#f97316" strokeWidth={3} strokeLinecap="round" strokeDasharray="34.5 103.6" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <img src="/images/White-Logomark.png" alt="Loading" className="w-10 h-10 object-contain animate-fade-in-out" />
            </div>
          </div>
          <p className="mt-3 text-white/30 text-sm">Loading bookings...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <h1 className="text-3xl font-bold text-white tracking-tight animate-fadeInUp">Bookings</h1>

        <DateRangeSlider
          startDate={startDate}
          endDate={endDate}
          onChange={handleDateRangeChange}
        />

        <BookingMatrix
          bookings={bookings}
          handleCellClick={handleCellClick}
          startDate={startDate}
          endDate={endDate}
          onLoadPreviousWeek={handleLoadPreviousWeek}
          onLoadNextWeek={handleLoadNextWeek}
          isLoadingMore={isLoadingMore}
        />
      </div>

      {liveDraft && (
        <BookingSlotModal
          isOpen={isModalOpen}
          draft={liveDraft}
          onClose={() => { setIsModalOpen(false); setModalDraft(null); }}
          onSubmit={handleSubmitFromModal}
          onDelete={handleDeleteFromModal}
          onStatusChange={handleStatusChange}
          refreshMatrix={async () => { await refreshBookings(); }}
        />
      )}
    </AdminLayout>
  );
}
