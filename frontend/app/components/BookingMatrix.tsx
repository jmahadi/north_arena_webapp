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

// Compact time slot display
const getCompactTimeSlot = (slot: string) => {
  // "9:30 AM - 11:00 AM" => "9:30-11:00"
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

interface BookingMatrixProps {
  bookings: BookingsData;
  handleCellClick: (date: string, slot: TimeSlot) => void;
  startDate: string;
  endDate: string;
}

export default function BookingMatrix({ bookings, handleCellClick, startDate, endDate }: BookingMatrixProps) {
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
    <div className="bg-black/40 border border-gray-800 rounded-lg p-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-black/40 p-1 text-[10px] text-gray-400 font-normal w-20"></th>
                {dateRange.map((date) => (
                  <th key={date.toISOString()} className="p-1 text-center bg-black/40 w-24 min-w-[96px]">
                  <div className="text-[13px] font-semibold text-gray-300">
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="text-xs text-gray-400">
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((slot) => (
              <tr key={slot}>
                <td className="sticky left-0 z-10 bg-black/40 p-1 pr-2 text-right text-xs text-gray-400 whitespace-nowrap font-medium w-20">
                  {getCompactTimeSlot(slot)}
                </td>
                {dateRange.map((date) => {
                  const dateString = date.toISOString().split('T')[0];
                  const booking = bookings[`${dateString}_${slot}`];

                  return (
                    <td
                      key={`${dateString}_${slot}`}
                      className="p-0.5 w-24 min-w-[96px]"
                    >
                      <div
                        className={`
                          h-12 rounded cursor-pointer transition-all duration-150
                          flex flex-col justify-center items-center px-1 relative
                          ${booking
                            ? (booking.booking_type === 'ACADEMY'
                                ? 'bg-purple-600 hover:bg-purple-500'
                                : 'bg-orange-600 hover:bg-orange-500')
                            : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'}
                        `}
                        onClick={() => handleCellClick(dateString, slot)}
                      >
                        {booking ? (
                          <>
                            <div className="text-[13px] font-semibold text-white truncate w-full text-center px-1 overflow-hidden">
                              {booking.name}
                            </div>
                            {/* Payment status corner indicator */}
                            {(() => {
                              const status = booking.transaction_status?.toUpperCase();
                              const isPaid = status === 'SUCCESSFUL';
                              const isPartial = status === 'PARTIAL';
                              return (
                                <div
                                  className={`absolute top-0 right-0 w-4 h-4 flex items-center justify-center rounded-bl ${
                                    isPaid
                                      ? 'bg-green-500'
                                      : isPartial
                                      ? 'bg-yellow-400'
                                      : 'bg-red-500'
                                  }`}
                                  style={{ borderTopRightRadius: '4px' }}
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
                        ) : (
                          <div className="text-xs text-gray-500">Open</div>
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
