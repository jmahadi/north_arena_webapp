import React from 'react';

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
  handleDelete
}: BookingFormProps) {
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