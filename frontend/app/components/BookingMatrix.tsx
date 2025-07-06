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

interface Booking {
  id: number;
  name: string;
  phone: string;
  booking_date: string;
  time_slot: TimeSlot;
  booked_by: string;  // Add this line to include the user ID
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
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="p-2"></th>
            {dateRange.map((date) => (
              <th key={date.toISOString()} className="p-2 text-center text-gray-300 font-medium">
                <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                <div>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIME_SLOTS.map((slot) => (
            <tr key={slot}>
              <td className="p-2 text-right text-gray-300 font-medium">{slot}</td>
              {dateRange.map((date) => {
                const dateString = date.toISOString().split('T')[0];
                const booking = bookings[`${dateString}_${slot}`];
                return (
                  <td
                    key={`${dateString}_${slot}`}
                    className="p-2 text-center"
                  >
                    <div
                      className={`
                        rounded-lg py-2 px-3 cursor-pointer transition duration-300 ease-in-out
                        ${booking 
                          ? 'bg-primary bg-opacity-70 hover:bg-opacity-100 text-white' 
                          : 'bg-gray-700 hover:bg-primary hover:bg-opacity-70 text-gray-300 hover:text-white'}
                      `}
                      onClick={() => handleCellClick(dateString, slot)}
                    >
                      {booking ? (
                        <>
                          <div>{booking.name}</div>
                          <div className="text-xs mt-1 opacity-75">ID: {booking.booked_by}</div>
                        </>
                      ) : (
                        'Open'
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
  );
}