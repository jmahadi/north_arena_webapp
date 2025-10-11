'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import BookingForm from '../components/BookingForm';
import BookingMatrix from '../components/BookingMatrix';
import { fetchBookings, addBooking, updateBooking, deleteBooking } from '../api/bookings';
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
}

type BookingsData = Record<string, Booking>;

export default function BookingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
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

  const handleCellClick = (date: string, slot: TimeSlot) => {
    setSelectedDate(date);
    setSelectedSlot(slot);
    const booking = bookings[`${date}_${slot}`];
    if (booking) {
      setName(booking.name);
      setPhone(booking.phone);
      setSelectedBookingId(booking.id);
      setSelectedBookingTransactionStatus(booking.transaction_status || null);
    } else {
      setName('');
      setPhone('');
      setSelectedBookingId(null);
      setSelectedBookingTransactionStatus(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let result;
      if (selectedBookingId && selectedSlot) {
        result = await updateBooking(selectedBookingId, name, phone, selectedDate, selectedSlot, startDate , endDate);
      } else if (selectedSlot) {
        result = await addBooking(name, phone, selectedDate, selectedSlot,  startDate,  endDate );
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

  // Update the handleDelete function to pass date range parameters
  const handleDelete = async () => {
    if (selectedBookingId) {
      try {
        // Pass current date range to deleteBooking
        await deleteBooking(selectedBookingId, startDate, endDate);
        fetchBookingsData();
        resetForm();
      } catch (error) {
        console.error('Failed to delete booking:', error);
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          router.push('/login');
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
  };

  if (isLoading) {
    return <div>Loading...</div>;
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
            />

            <div className="mt-8">
              <h2 className="text-lg font-medium text-white mb-4">Date Range</h2>
              <div className="flex flex-col space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="block w-full rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors p-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="block w-full rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors p-3"
                  />
                </div>
                <button 
                  onClick={handleDateRangeChange} 
                  className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-md transition-all duration-200 hover:shadow-lg font-medium"
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
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}