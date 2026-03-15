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
  const renderDaySelector = () => (
    <div>
      <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Days of Week</label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map(day => {
          const isSelected = academyDaysOfWeek.includes(day);
          return (
            <label
              key={day}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                  : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:bg-white/[0.04] hover:border-white/10'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    setAcademyDaysOfWeek([...academyDaysOfWeek, day]);
                  } else {
                    setAcademyDaysOfWeek(academyDaysOfWeek.filter(d => d !== day));
                  }
                }}
                className="accent-orange-500"
              />
              {day.charAt(0) + day.slice(1).toLowerCase()}
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 rounded-xl animate-slideInLeft">
      <div className="mb-5 text-[10px] text-white/30 uppercase tracking-widest font-medium">
        {selectedBookingId ? 'Editing Booking' : 'Create Booking'}
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Booking Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBookingType('NORMAL')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                bookingType === 'NORMAL'
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                  : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setBookingType('ACADEMY')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                bookingType === 'ACADEMY'
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                  : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
              }`}
            >
              Academy
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-input w-full rounded-lg p-2.5 text-sm"
            placeholder="Enter name"
            required
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="glass-input w-full rounded-lg p-2.5 text-sm"
            placeholder="Enter phone number"
            required
            autoComplete="tel"
          />
        </div>
        {bookingType === 'NORMAL' ? (
          <>
            <div>
              <label className="flex items-center cursor-pointer gap-2">
                <input
                  type="checkbox"
                  checked={isBulkBooking}
                  onChange={(e) => setIsBulkBooking(e.target.checked)}
                  className="accent-orange-500"
                />
                <span className="text-sm text-white/50">Bulk Booking (Multiple Days)</span>
              </label>
            </div>
            {isBulkBooking ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Start Date</label>
                  <input
                    type="date"
                    value={academyStartDate}
                    onChange={(e) => {
                      setAcademyStartDate(e.target.value);
                      setSelectedDate(e.target.value);
                    }}
                    className="glass-input w-full rounded-lg p-2.5 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">End Date</label>
                  <input
                    type="date"
                    value={academyEndDate}
                    onChange={(e) => setAcademyEndDate(e.target.value)}
                    min={academyStartDate}
                    className="glass-input w-full rounded-lg p-2.5 text-sm"
                    required
                  />
                </div>
                {renderDaySelector()}
                {academyStartDate && academyEndDate && (
                  <div className="p-3 bg-orange-500/5 rounded-lg border border-orange-500/15">
                    <div className="text-sm text-white/60">
                      <div className="font-medium mb-1 text-orange-400 text-xs uppercase tracking-wider">Bulk Booking Summary</div>
                      <div className="text-white/40 text-xs">Duration: {
                        (() => {
                          const start = new Date(academyStartDate);
                          const end = new Date(academyEndDate);
                          let count = 0;
                          let current = new Date(start);
                          while (current <= end) {
                            const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
                            if (academyDaysOfWeek.length === 0 || academyDaysOfWeek.includes(dayName)) count++;
                            current.setDate(current.getDate() + 1);
                          }
                          return count;
                        })()
                      } days{academyDaysOfWeek.length > 0 && ` (${academyDaysOfWeek.map(d => d.slice(0, 3)).join(', ')})`}</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="glass-input w-full rounded-lg p-2.5 text-sm"
                  required
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Academy Start Date</label>
              <input
                type="date"
                value={academyStartDate}
                onChange={(e) => {
                  setAcademyStartDate(e.target.value);
                  setSelectedDate(e.target.value);
                }}
                className="glass-input w-full rounded-lg p-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Academy End Date</label>
              <input
                type="date"
                value={academyEndDate}
                onChange={(e) => setAcademyEndDate(e.target.value)}
                min={academyStartDate}
                className="glass-input w-full rounded-lg p-2.5 text-sm"
                required
              />
            </div>
            {renderDaySelector()}
            {academyStartDate && academyEndDate && (
              <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-500/15">
                <div className="text-sm text-white/60">
                  <div className="font-medium mb-1 text-purple-400 text-xs uppercase tracking-wider">Academy Booking Summary</div>
                  <div className="text-white/40 text-xs">Duration: {
                    (() => {
                      const start = new Date(academyStartDate);
                      const end = new Date(academyEndDate);
                      let count = 0;
                      let current = new Date(start);
                      while (current <= end) {
                        const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
                        if (academyDaysOfWeek.length === 0 || academyDaysOfWeek.includes(dayName)) count++;
                        current.setDate(current.getDate() + 1);
                      }
                      return count;
                    })()
                  } days{academyDaysOfWeek.length > 0 && ` (${academyDaysOfWeek.map(d => d.slice(0, 3)).join(', ')})`}</div>
                </div>
              </div>
            )}
          </>
        )}
        <div>
          <label className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">Time Slot</label>
          <select
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value as TimeSlot)}
            className="glass-input w-full rounded-lg p-2.5 text-sm"
            required
          >
            <option value="">Select a time slot</option>
            {TIME_SLOTS.map((slot) => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Payment Status Section */}
      {selectedBookingId && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              if (selectedBookingId && onManageTransactions) {
                onManageTransactions(selectedBookingId);
              }
            }}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium ${
              transactionStatus === 'SUCCESSFUL'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15'
                : transactionStatus === 'PARTIAL'
                ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/15'
                : 'glass-card text-white/70 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <span>{transactionStatus === 'SUCCESSFUL' ? 'Paid' : transactionStatus === 'PARTIAL' ? 'Partial Payment' : 'Add Payment'}</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Quick Add Payment Tip for New Bookings */}
      {!selectedBookingId && name && phone && selectedDate && selectedSlot && (
        <div className="mt-4 px-3 py-2 bg-white/[0.02] rounded-lg border border-white/[0.04]">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white/20 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-white/30">
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
              className="btn-glow flex-1 px-4 py-2.5 text-sm font-medium bg-orange-600 text-white rounded-lg transition-all duration-300"
            >
              Update
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2.5 text-sm font-medium text-red-400 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-all duration-200"
            >
              Delete
            </button>
          </>
        ) : (
          <button
            type="submit"
            className="btn-glow w-full px-4 py-2.5 text-sm font-medium bg-orange-600 text-white rounded-lg transition-all duration-300"
          >
            Add Booking
          </button>
        )}
      </div>
    </form>
  );
}
