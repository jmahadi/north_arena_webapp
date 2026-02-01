'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import BookingForm from '../components/BookingForm';
import BookingMatrix from '../components/BookingMatrix';
import BookingDetailsModal from '../components/BookingDetailsModal';
import { fetchBookings, addBooking, updateBooking, deleteBooking, checkBookingHasTransactions } from '../api/bookings';
import { getTransactionSummaries } from '../api/transactions';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bookings, setBookings] = useState<BookingsData>({});
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
    } else {
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      setStartDate(today.toISOString().split('T')[0]);
      setEndDate(nextWeek.toISOString().split('T')[0]);
    }
  }, [router]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchBookingsData();
    }
  }, [startDate, endDate]);



  const fetchBookingsData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('Fetching bookings data...');
      
      // Fetch both bookings and transaction summaries
      const [bookingsResponse, transactionSummaries] = await Promise.all([
        fetchBookings(startDate, endDate),
        getTransactionSummaries()
      ]);
      
      console.log('Bookings data received:', bookingsResponse);
      console.log('Transaction summaries received:', transactionSummaries);
      
      const bookingsData = bookingsResponse.bookingsData || {};
      
      // Create a lookup map for transaction status by booking_id
      const transactionStatusMap = new Map();
      transactionSummaries.forEach(summary => {
        transactionStatusMap.set(summary.booking_id, summary.status);
      });
      
      // Merge transaction status into bookings data
      Object.keys(bookingsData).forEach(key => {
        const booking = bookingsData[key];
        if (booking.id) {
          booking.transaction_status = transactionStatusMap.get(booking.id) || null;
        }
      });
      
      console.log('Merged bookings with transaction status:', bookingsData);
      setBookings(bookingsData);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
      setError('Failed to fetch bookings. Please try again.');
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDateRangeChange = () => {
    fetchBookingsData();
  };

  // Load previous week (shift date range 7 days earlier)
  const handleLoadPreviousWeek = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);

    const newStartDate = new Date(startDate);
    newStartDate.setDate(newStartDate.getDate() - 7);
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() - 7);

    setStartDate(newStartDate.toISOString().split('T')[0]);
    setEndDate(newEndDate.toISOString().split('T')[0]);

    // isLoadingMore will be set to false after fetchBookingsData completes
    setTimeout(() => setIsLoadingMore(false), 500);
  };

  // Load next week (shift date range 7 days later)
  const handleLoadNextWeek = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);

    const newStartDate = new Date(startDate);
    newStartDate.setDate(newStartDate.getDate() + 7);
    const newEndDate = new Date(endDate);
    newEndDate.setDate(newEndDate.getDate() + 7);

    setStartDate(newStartDate.toISOString().split('T')[0]);
    setEndDate(newEndDate.toISOString().split('T')[0]);

    // isLoadingMore will be set to false after fetchBookingsData completes
    setTimeout(() => setIsLoadingMore(false), 500);
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

      // Load academy data if it's an academy booking
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
      // Reset to normal for new bookings
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
          selectedBookingId,
          name,
          phone,
          selectedDate,
          selectedSlot,
          startDate,
          endDate,
          bookingType,
          academyStartDate,
          academyEndDate,
          academyDaysOfWeek
        );
      } else if (selectedSlot) {
        result = await addBooking(
          name,
          phone,
          selectedDate,
          selectedSlot,
          startDate,
          endDate,
          bookingType,
          academyStartDate,
          academyEndDate,
          academyDaysOfWeek
        );
      } else {
        throw new Error("No time slot selected");
      }

      if (result.success) {
        alert(result.message);
        // Merge new bookings data with existing bookings
        if (result.bookingsData) {
          setBookings(result.bookingsData);
        }
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

  // Update the handleDelete function to handle soft-delete with payment retention
  const handleDelete = async () => {
    if (selectedBookingId) {
      try {
        // Check if booking has transactions
        const hasTransactions = await checkBookingHasTransactions(selectedBookingId);
        let retainPayments = true;

        if (hasTransactions) {
          // Show confirmation dialog for bookings with payments
          const userChoice = confirm(
            'This booking has payment records.\n\n' +
            'Click OK to cancel the booking but RETAIN payment records for accounting.\n' +
            'Click Cancel to abort deletion.'
          );

          if (!userChoice) {
            return; // User aborted
          }

          // Ask if they want to hard delete (lose payment records)
          const hardDelete = confirm(
            'Do you also want to DELETE the payment records?\n\n' +
            'Click OK to permanently delete ALL payment records (not recommended).\n' +
            'Click Cancel to keep payment records for financial journal.'
          );

          retainPayments = !hardDelete;
        } else {
          // Simple confirmation for bookings without payments
          const confirmDelete = confirm('Are you sure you want to delete this booking?');
          if (!confirmDelete) {
            return;
          }
          retainPayments = false; // No payments to retain
        }

        // Pass current date range and retain_payments flag to deleteBooking
        const result = await deleteBooking(selectedBookingId, startDate, endDate, retainPayments);

        if (result.success) {
          alert(result.message);
          // Update bookings from response or refetch
          if (result.bookingsData) {
            setBookings(result.bookingsData);
          } else {
            fetchBookingsData();
          }
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

  // Open booking details modal for payment management
  const handleOpenPaymentModal = (bookingId: number) => {
    setModalBookingId(bookingId);
    setIsModalOpen(true);
  };

  // Handle modal close and refresh data
  const handleModalClose = () => {
    setIsModalOpen(false);
    setModalBookingId(null);
  };

  // Refresh bookings data when transactions are updated in modal
  const handleTransactionUpdate = () => {
    fetchBookingsData();
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
          <p className="mt-3 text-gray-400 text-sm">Loading bookings...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-light text-white mb-8">Bookings</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-1">
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

            <div className="mt-6 bg-black/40 border border-gray-800 rounded-lg p-4">
              <h2 className="text-sm font-medium text-gray-400 mb-3">Date Range</h2>
              <div className="flex flex-col space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="block w-full rounded bg-black/20 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none transition-colors p-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="block w-full rounded bg-black/20 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none transition-colors p-2"
                    />
                  </div>
                </div>
                <button
                  onClick={handleDateRangeChange}
                  className="w-full px-3 py-2 text-sm font-medium bg-gray-700 text-gray-200 rounded border border-gray-600 hover:bg-gray-600 transition-colors"
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