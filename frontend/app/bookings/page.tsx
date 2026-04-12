'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import BookingForm from '../components/BookingForm';
import BookingMatrix from '../components/BookingMatrix';
import BookingDetailsModal from '../components/BookingDetailsModal';
import { fetchBookings, addBooking, updateBooking, deleteBooking, checkBookingHasTransactions } from '../api/bookings';
import { getTransactionSummaries } from '../api/transactions';
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

export default function BookingsPage() {
  const router = useRouter();
  const [isLoadingMore, setIsLoadingMore] = useState<'left' | 'right' | false>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return nextWeek.toISOString().split('T')[0];
  });
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [selectedBookingTransactionStatus, setSelectedBookingTransactionStatus] = useState<'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null>(null);

  // Academy booking state variables
  const [bookingType, setBookingType] = useState<'NORMAL' | 'ACADEMY'>('NORMAL');
  const [academyStartDate, setAcademyStartDate] = useState('');
  const [academyEndDate, setAcademyEndDate] = useState('');
  const [academyDaysOfWeek, setAcademyDaysOfWeek] = useState<string[]>(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
  const [isBulkBooking, setIsBulkBooking] = useState(false);

  // Modal state for booking details
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalBookingId, setModalBookingId] = useState<number | null>(null);

  // SWR-powered bookings data (cached, stale-while-revalidate)
  const { bookings, isLoading, refresh: refreshBookings, setBookings } = useBookings(startDate, endDate);

  // Ref to track if we're doing an incremental load (skip full page reload)
  const isIncrementalLoadRef = useRef(false);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const fetchBookingsData = () => {
    refreshBookings();
  };

  const handleDateRangeChange = () => {
    fetchBookingsData();
  };

  const fetchAndMergeBookings = async (fetchStart: string, fetchEnd: string) => {
    try {
      const [bookingsResponse, transactionSummaries] = await Promise.all([
        fetchBookings(fetchStart, fetchEnd),
        getTransactionSummaries()
      ]);

      const newBookingsData = bookingsResponse.bookingsData || {};

      const transactionStatusMap = new Map();
      transactionSummaries.forEach(summary => {
        transactionStatusMap.set(summary.booking_id, summary.status);
      });

      Object.keys(newBookingsData).forEach(key => {
        const booking = newBookingsData[key];
        if (booking.id) {
          booking.transaction_status = transactionStatusMap.get(booking.id) || null;
        }
      });

      return newBookingsData;
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
      return {};
    }
  };

  const handleLoadPreviousWeek = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore('left');

    const newStartDate = new Date(startDate);
    newStartDate.setDate(newStartDate.getDate() - 7);
    const newStartStr = newStartDate.toISOString().split('T')[0];

    const prevWeekEnd = new Date(startDate);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    const prevWeekEndStr = prevWeekEnd.toISOString().split('T')[0];

    const newBookings = await fetchAndMergeBookings(newStartStr, prevWeekEndStr);

    setBookings(prev => ({ ...newBookings, ...prev }));
    isIncrementalLoadRef.current = true;
    setStartDate(newStartStr);
    setIsLoadingMore(false);
  };

  const handleLoadNextWeek = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore('right');

    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 7);
    const newEndStr = newEndDate.toISOString().split('T')[0];

    const nextWeekStart = new Date(endDate);
    nextWeekStart.setDate(nextWeekStart.getDate() + 1);
    const nextWeekStartStr = nextWeekStart.toISOString().split('T')[0];

    const newBookings = await fetchAndMergeBookings(nextWeekStartStr, newEndStr);

    setBookings(prev => ({ ...prev, ...newBookings }));
    isIncrementalLoadRef.current = true;
    setEndDate(newEndStr);
    setIsLoadingMore(false);
  };

  const handleCellClick = (date: string, slot: TimeSlot) => {
    setSelectedDate(date);
    setSelectedSlot(slot);
    const booking = bookings[`${date}_${slot}`];
    if (booking) {
      setName(booking.name);
      setPhone(booking.phone);
      setSelectedBookingId(booking.id);
      setSelectedBookingTransactionStatus(booking.transaction_status || null);

      if (booking.booking_type === 'ACADEMY') {
        setBookingType('ACADEMY');
        setAcademyStartDate(booking.academy_start_date || '');
        setAcademyEndDate(booking.academy_end_date || '');
        setAcademyDaysOfWeek(booking.academy_days_of_week ? booking.academy_days_of_week.split(',') : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
      } else {
        setBookingType('NORMAL');
        setAcademyStartDate('');
        setAcademyEndDate('');
        setAcademyDaysOfWeek(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
      }
    } else {
      setName('');
      setPhone('');
      setSelectedBookingId(null);
      setSelectedBookingTransactionStatus(null);
      setBookingType('NORMAL');
      setAcademyStartDate('');
      setAcademyEndDate('');
      setAcademyDaysOfWeek(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
      setIsBulkBooking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let result;
      if (selectedBookingId && selectedSlot) {
        result = await updateBooking(
          selectedBookingId, name, phone, selectedDate, selectedSlot, startDate, endDate,
          bookingType, academyStartDate, academyEndDate, academyDaysOfWeek
        );
      } else if (selectedSlot) {
        result = await addBooking(
          name, phone, selectedDate, selectedSlot, startDate, endDate,
          bookingType, academyStartDate, academyEndDate, academyDaysOfWeek
        );
      } else {
        throw new Error("No time slot selected");
      }

      if (result.success) {
        alert(result.message);
        if (result.bookingsData) {
          setBookings(result.bookingsData);
        }
        invalidateAll();  // Refresh dashboard and other cached data
        resetForm();
      } else {
        alert(result.message || "An error occurred");
      }
    } catch (error) {
      console.error('Failed to submit booking:', error);
      let errorMessage = 'An error occurred while submitting the booking.';
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data.detail || error.response.data.message || errorMessage;
      }
      alert(errorMessage);
    }
  };

  const handleDelete = async () => {
    if (selectedBookingId) {
      try {
        const hasTransactions = await checkBookingHasTransactions(selectedBookingId);
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

        const result = await deleteBooking(selectedBookingId, startDate, endDate, retainPayments);

        if (result.success) {
          alert(result.message);
          if (result.bookingsData) {
            setBookings(result.bookingsData);
          } else {
            fetchBookingsData();
          }
          invalidateAll();
          resetForm();
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
    }
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setSelectedDate('');
    setSelectedSlot('');
    setSelectedBookingId(null);
    setSelectedBookingTransactionStatus(null);
    setBookingType('NORMAL');
    setAcademyStartDate('');
    setAcademyEndDate('');
    setAcademyDaysOfWeek(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
    setIsBulkBooking(false);
  };

  const handleOpenPaymentModal = (bookingId: number) => {
    setModalBookingId(bookingId);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setModalBookingId(null);
  };

  const handleTransactionUpdate = () => {
    fetchBookingsData();
    invalidateAll();
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-3xl font-bold text-white mb-8 tracking-tight animate-fadeInUp">Bookings</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <BookingForm
              name={name}
              setName={setName}
              phone={phone}
              setPhone={setPhone}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              selectedSlot={selectedSlot}
              setSelectedSlot={setSelectedSlot}
              selectedBookingId={selectedBookingId}
              handleSubmit={handleSubmit}
              handleDelete={handleDelete}
              transactionStatus={selectedBookingTransactionStatus}
              onManageTransactions={handleOpenPaymentModal}
              bookingType={bookingType}
              setBookingType={setBookingType}
              academyStartDate={academyStartDate}
              setAcademyStartDate={setAcademyStartDate}
              academyEndDate={academyEndDate}
              setAcademyEndDate={setAcademyEndDate}
              academyDaysOfWeek={academyDaysOfWeek}
              setAcademyDaysOfWeek={setAcademyDaysOfWeek}
              isBulkBooking={isBulkBooking}
              setIsBulkBooking={setIsBulkBooking}
            />

            <div className="glass-card rounded-xl p-4 animate-slideInLeft" style={{ animationDelay: '0.1s', opacity: 0 }}>
              <h2 className="text-[10px] font-medium text-white/30 mb-3 uppercase tracking-widest">Date Range</h2>
              <div className="flex flex-col space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-white/25 mb-1 uppercase tracking-wider">Start</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="glass-input w-full rounded-lg text-sm p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/25 mb-1 uppercase tracking-wider">End</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="glass-input w-full rounded-lg text-sm p-2"
                    />
                  </div>
                </div>
                <button
                  onClick={handleDateRangeChange}
                  className="w-full px-3 py-2 text-sm font-medium glass-card hover:bg-white/[0.06] text-white/60 hover:text-white rounded-lg transition-all duration-200"
                >
                  Update Range
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
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
        </div>
      </div>

      {/* Booking Details Modal for Payment Management */}
      {modalBookingId && (
        <BookingDetailsModal
          bookingId={modalBookingId}
          isOpen={isModalOpen}
          onClose={handleModalClose}
          onTransactionUpdate={handleTransactionUpdate}
        />
      )}
    </AdminLayout>
  );
}
