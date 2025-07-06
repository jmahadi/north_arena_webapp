import React from 'react';
import { useRouter } from 'next/navigation';

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

interface BookingFormProps {
  name: string;
  setName: (name: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  selectedSlot: TimeSlot | '';
  setSelectedSlot: (slot: TimeSlot | '') => void;
  selectedBookingId: number | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleDelete: () => Promise<void>;
  transactionStatus?: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null;
  onManageTransactions?: (bookingId: number) => void;
}

export default function BookingForm({
  name,
  setName,
  phone,
  setPhone,
  selectedDate,
  setSelectedDate,
  selectedSlot,
  setSelectedSlot,
  selectedBookingId,
  handleSubmit,
  handleDelete,
  transactionStatus,
  onManageTransactions
}: BookingFormProps) {
  const router = useRouter();
  return (
    <form onSubmit={handleSubmit} className="bg-surface bg-opacity-50 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold text-white mb-6">Add/Edit Booking</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
            placeholder="Enter name"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
            placeholder="Enter phone number"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Time Slot</label>
          <select
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value as TimeSlot)}
            className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select a time slot</option>
            {TIME_SLOTS.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Transaction Status Section */}
      {selectedBookingId && (
        <div className="mt-6 p-4 bg-gray-800 bg-opacity-50 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">Payment Status</h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-300">Status:</span>
              <span 
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  transactionStatus === 'SUCCESSFUL' ? 'bg-green-600 text-white' :
                  transactionStatus === 'PARTIAL' ? 'bg-yellow-500 text-black' :
                  transactionStatus === 'PENDING' ? 'bg-red-500 text-white' :
                  'bg-gray-500 text-white'
                }`}
              >
                {transactionStatus || 'NO PAYMENTS'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (selectedBookingId) {
                  router.push(`/transactions?bookingId=${selectedBookingId}&date=${selectedDate}&slot=${encodeURIComponent(selectedSlot)}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`);
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-300 ease-in-out flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
              <span>Manage Payments</span>
            </button>
          </div>
        </div>
      )}

      {/* Quick Add Payment Button for New Bookings */}
      {!selectedBookingId && name && phone && selectedDate && selectedSlot && (
        <div className="mt-6 p-4 bg-blue-800 bg-opacity-20 rounded-lg border border-blue-600">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-blue-300">
              After saving this booking, you can immediately add payment details using the "Manage Payments" button.
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end space-x-3">
        {selectedBookingId ? (
          <>
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition duration-300 ease-in-out">
              Update Booking
            </button>
            <button type="button" onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition duration-300 ease-in-out">
              Delete Booking
            </button>
          </>
        ) : (
          <button type="submit" className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition duration-300 ease-in-out">
            Add Booking
          </button>
        )}
      </div>
    </form>
  );
}