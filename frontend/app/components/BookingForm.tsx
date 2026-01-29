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
  transactionStatus?: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null;
  onManageTransactions?: (bookingId: number) => void;
  bookingType: 'NORMAL' | 'ACADEMY';
  setBookingType: (type: 'NORMAL' | 'ACADEMY') => void;
  academyStartDate: string;
  setAcademyStartDate: (date: string) => void;
  academyEndDate: string;
  setAcademyEndDate: (date: string) => void;
  academyDaysOfWeek: string[];
  setAcademyDaysOfWeek: (days: string[]) => void;
  isBulkBooking: boolean;
  setIsBulkBooking: (value: boolean) => void;
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
  onManageTransactions,
  bookingType,
  setBookingType,
  academyStartDate,
  setAcademyStartDate,
  academyEndDate,
  setAcademyEndDate,
  academyDaysOfWeek,
  setAcademyDaysOfWeek,
  isBulkBooking,
  setIsBulkBooking
}: BookingFormProps) {
  return (
    <form onSubmit={handleSubmit} className="bg-black/40 border border-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold text-white mb-6">Add/Edit Booking</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Booking Type</label>
          <div className="flex gap-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                value="NORMAL"
                checked={bookingType === 'NORMAL'}
                onChange={(e) => setBookingType(e.target.value as 'NORMAL' | 'ACADEMY')}
                className="mr-2"
              />
              <span className="text-white">Normal</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                value="ACADEMY"
                checked={bookingType === 'ACADEMY'}
                onChange={(e) => setBookingType(e.target.value as 'NORMAL' | 'ACADEMY')}
                className="mr-2"
              />
              <span className="text-white">Academy</span>
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors p-2"
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
            className="mt-1 block w-full rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors p-2"
            placeholder="Enter phone number"
            required
          />
        </div>
        {bookingType === 'NORMAL' ? (
          <>
            <div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBulkBooking}
                  onChange={(e) => setIsBulkBooking(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm font-medium text-gray-300">Bulk Booking (Multiple Days)</span>
              </label>
            </div>
            {isBulkBooking ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-300">Start Date</label>
                  <input
                    type="date"
                    value={academyStartDate}
                    onChange={(e) => {
                      setAcademyStartDate(e.target.value);
                      setSelectedDate(e.target.value);
                    }}
                    className="mt-1 block w-full rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors p-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300">End Date</label>
                  <input
                    type="date"
                    value={academyEndDate}
                    onChange={(e) => setAcademyEndDate(e.target.value)}
                    min={academyStartDate}
                    className="mt-1 block w-full rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors p-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Days of Week</label>
                  <select
                    multiple
                    value={academyDaysOfWeek}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value);
                      setAcademyDaysOfWeek(selected);
                    }}
                    className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary min-h-[120px]"
                  >
                    {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(day => (
                      <option key={day} value={day} className="py-1">
                        {day.charAt(0) + day.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-400">Hold Ctrl/Cmd to select multiple days</p>
                </div>
                {academyStartDate && academyEndDate && (
                  <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-600">
                    <div className="text-sm text-gray-300">
                      <div className="font-medium mb-1 text-orange-400">Bulk Booking Summary</div>
                      <div className="text-gray-400">Duration: {
                        (() => {
                          const start = new Date(academyStartDate);
                          const end = new Date(academyEndDate);
                          let count = 0;
                          let current = new Date(start);

                          while (current <= end) {
                            const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
                            if (academyDaysOfWeek.length === 0 || academyDaysOfWeek.includes(dayName)) {
                              count++;
                            }
                            current.setDate(current.getDate() + 1);
                          }

                          return count;
                        })()
                      } days{academyDaysOfWeek.length > 0 && ` (${academyDaysOfWeek.map(d => d.slice(0, 3)).join(', ')})`}</div>
                      <div className="text-gray-400">Est. Cost: <span className="text-orange-400">₹{
                        (() => {
                          const start = new Date(academyStartDate);
                          const end = new Date(academyEndDate);
                          let count = 0;
                          let current = new Date(start);

                          while (current <= end) {
                            const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
                            if (academyDaysOfWeek.length === 0 || academyDaysOfWeek.includes(dayName)) {
                              count++;
                            }
                            current.setDate(current.getDate() + 1);
                          }

                          return (count * 2000).toLocaleString();
                        })()
                      }</span> (₹2,000/day)</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
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
            )}
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-300">Academy Start Date</label>
              <input
                type="date"
                value={academyStartDate}
                onChange={(e) => {
                  setAcademyStartDate(e.target.value);
                  setSelectedDate(e.target.value);
                }}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Academy End Date</label>
              <input
                type="date"
                value={academyEndDate}
                onChange={(e) => setAcademyEndDate(e.target.value)}
                min={academyStartDate}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Days of Week</label>
              <select
                multiple
                value={academyDaysOfWeek}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setAcademyDaysOfWeek(selected);
                }}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary min-h-[120px]"
              >
                {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(day => (
                  <option key={day} value={day} className="py-1">
                    {day.charAt(0) + day.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">Hold Ctrl/Cmd to select multiple days</p>
            </div>
            {academyStartDate && academyEndDate && (
              <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-600">
                <div className="text-sm text-gray-300">
                  <div className="font-medium mb-1 text-purple-400">Academy Booking Summary</div>
                  <div className="text-gray-400">Duration: {
                    (() => {
                      const start = new Date(academyStartDate);
                      const end = new Date(academyEndDate);
                      let count = 0;
                      let current = new Date(start);

                      while (current <= end) {
                        const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
                        if (academyDaysOfWeek.length === 0 || academyDaysOfWeek.includes(dayName)) {
                          count++;
                        }
                        current.setDate(current.getDate() + 1);
                      }

                      return count;
                    })()
                  } days{academyDaysOfWeek.length > 0 && ` (${academyDaysOfWeek.map(d => d.slice(0, 3)).join(', ')})`}</div>
                  <div className="text-gray-400">Est. Cost: <span className="text-purple-400">₹{
                    (() => {
                      const start = new Date(academyStartDate);
                      const end = new Date(academyEndDate);
                      let count = 0;
                      let current = new Date(start);

                      while (current <= end) {
                        const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
                        if (academyDaysOfWeek.length === 0 || academyDaysOfWeek.includes(dayName)) {
                          count++;
                        }
                        current.setDate(current.getDate() + 1);
                      }

                      return (count * 2000).toLocaleString();
                    })()
                  }</span> (₹2,000/day)</div>
                </div>
              </div>
            )}
          </>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-300">Time Slot</label>
          <select
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value as TimeSlot)}
            className="mt-1 block w-full rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors p-2"
            required
          >
            <option value="">Select a time slot</option>
            {TIME_SLOTS.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Payment Status Section - Compact */}
      {selectedBookingId && (
        <div className="mt-4 flex items-center justify-between bg-black/30 border border-gray-700 rounded-md px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Payment:</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded ${
                transactionStatus === 'SUCCESSFUL'
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : transactionStatus === 'PARTIAL'
                  ? 'bg-orange-600/20 text-orange-400 border border-orange-600/30'
                  : 'bg-red-600/20 text-red-400 border border-red-600/30'
              }`}
            >
              {transactionStatus === 'SUCCESSFUL' ? 'PAID' : transactionStatus === 'PARTIAL' ? 'PARTIAL' : 'UNPAID'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (selectedBookingId && onManageTransactions) {
                onManageTransactions(selectedBookingId);
              }
            }}
            className="text-xs px-3 py-1.5 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors border border-gray-600"
          >
            Manage Payments
          </button>
        </div>
      )}

      {/* Quick Add Payment Tip for New Bookings */}
      {!selectedBookingId && name && phone && selectedDate && selectedSlot && (
        <div className="mt-4 px-3 py-2 bg-gray-800/50 rounded border border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-gray-400">
              After saving, you can add payments via "Manage Payments"
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {selectedBookingId ? (
          <>
            <button
              type="submit"
              className="flex-1 px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded border border-orange-600 hover:bg-orange-500 transition-colors"
            >
              Update Booking
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium bg-transparent text-red-400 rounded border border-red-600/50 hover:bg-red-600/10 transition-colors"
            >
              Delete
            </button>
          </>
        ) : (
          <button
            type="submit"
            className="w-full px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded border border-orange-600 hover:bg-orange-500 transition-colors"
          >
            Add Booking
          </button>
        )}
      </div>
    </form>
  );
}