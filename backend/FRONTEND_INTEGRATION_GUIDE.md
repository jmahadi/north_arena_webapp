# Frontend Integration Guide - Academy Bookings

## Step-by-Step Implementation

### 📁 Files to Modify

1. ✅ `frontend/app/components/BookingForm.tsx` - Add booking type selector & date range
2. ✅ `frontend/app/components/BookingMatrix.tsx` - Display academy bookings differently
3. ✅ `frontend/app/api/bookings.ts` - Update API calls
4. ✅ `frontend/app/bookings/page.tsx` - Update state management

---

## STEP 1: Update BookingForm.tsx

### Changes Needed:
1. Add booking type selector (Normal/Academy)
2. Add academy date range fields
3. Add academy notes field
4. Show/hide fields based on booking type

### Code Changes:

**A. Add to the interface (after line 16):**

```typescript
interface BookingFormProps {
  // ... existing props ...

  // NEW: Academy booking props
  bookingType: 'NORMAL' | 'ACADEMY';
  setBookingType: (type: 'NORMAL' | 'ACADEMY') => void;
  academyStartDate: string;
  setAcademyStartDate: (date: string) => void;
  academyEndDate: string;
  setAcademyEndDate: (date: string) => void;
  academyNotes: string;
  setAcademyNotes: (notes: string) => void;
}
```

**B. Update the component parameters (line 33):**

```typescript
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
  // NEW: Add these
  bookingType,
  setBookingType,
  academyStartDate,
  setAcademyStartDate,
  academyEndDate,
  setAcademyEndDate,
  academyNotes,
  setAcademyNotes,
}: BookingFormProps) {
```

**C. Add Booking Type Selector (after line 63, before phone field):**

```typescript
{/* NEW: Booking Type Selector */}
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
      <span className="text-white">Normal Booking</span>
    </label>
    <label className="flex items-center cursor-pointer">
      <input
        type="radio"
        value="ACADEMY"
        checked={bookingType === 'ACADEMY'}
        onChange={(e) => setBookingType(e.target.value as 'NORMAL' | 'ACADEMY')}
        className="mr-2"
      />
      <span className="text-white">Academy Booking</span>
    </label>
  </div>
</div>
```

**D. Replace the single Date field (lines 75-84) with conditional rendering:**

```typescript
{/* Conditional Date Fields */}
{bookingType === 'NORMAL' ? (
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
) : (
  <>
    {/* Academy Date Range */}
    <div>
      <label className="block text-sm font-medium text-gray-300">Academy Start Date</label>
      <input
        type="date"
        value={academyStartDate}
        onChange={(e) => {
          setAcademyStartDate(e.target.value);
          setSelectedDate(e.target.value); // Also set as main date
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
        min={academyStartDate} // Can't end before start
        className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
        required
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-300">Notes (Optional)</label>
      <textarea
        value={academyNotes}
        onChange={(e) => setAcademyNotes(e.target.value)}
        className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
        placeholder="E.g., Cricket training, contact person, etc."
        rows={2}
      />
    </div>

    {/* Show estimated days and cost */}
    {academyStartDate && academyEndDate && (
      <div className="p-3 bg-blue-900 bg-opacity-30 rounded-lg border border-blue-500">
        <div className="text-sm text-blue-200">
          <div className="font-semibold mb-1">Academy Booking Details:</div>
          <div>Duration: {
            Math.ceil((new Date(academyEndDate).getTime() - new Date(academyStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
          } days</div>
          <div>Estimated Cost: ₹{
            (Math.ceil((new Date(academyEndDate).getTime() - new Date(academyStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1) * 2000
          } (₹2,000/day)</div>
        </div>
      </div>
    )}
  </>
)}
```

---

## STEP 2: Update BookingMatrix.tsx

### Changes Needed:
1. Update Booking interface to include academy fields
2. Style academy bookings differently
3. Show "Academy" label for academy bookings

### Code Changes:

**A. Update the Booking interface (lines 16-24):**

```typescript
interface Booking {
  id: number;
  name: string;
  phone: string;
  booking_date: string;
  time_slot: TimeSlot;
  booked_by: string;
  transaction_status?: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null;

  // NEW: Academy booking fields
  booking_type: 'NORMAL' | 'ACADEMY';
  actual_name?: string;  // Real name for academy bookings
  academy_start_date?: string;
  academy_end_date?: string;
  academy_notes?: string;
}
```

**B. Update the cell styling (replace lines 78-116):**

```typescript
<div
  className={`
    rounded-lg py-2 px-3 cursor-pointer transition duration-300 ease-in-out relative
    ${booking
      ? (booking.booking_type === 'ACADEMY'
          ? 'bg-purple-600 bg-opacity-70 hover:bg-opacity-100 text-white border-2 border-purple-400'
          : 'bg-primary bg-opacity-70 hover:bg-opacity-100 text-white')
      : 'bg-gray-700 hover:bg-primary hover:bg-opacity-70 text-gray-300 hover:text-white'}
  `}
  onClick={() => handleCellClick(dateString, slot)}
  title={booking?.booking_type === 'ACADEMY'
    ? `Academy: ${booking.actual_name}\n${booking.academy_start_date} to ${booking.academy_end_date}${booking.academy_notes ? '\n' + booking.academy_notes : ''}`
    : booking?.name || 'Open slot'}
>
  {booking ? (
    <>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {/* Show "Academy" for academy bookings, actual name for normal */}
          <div className="font-semibold">
            {booking.booking_type === 'ACADEMY' ? 'Academy' : booking.name}
          </div>

          {/* For academy bookings, show actual name in smaller text */}
          {booking.booking_type === 'ACADEMY' && booking.actual_name && (
            <div className="text-xs mt-1 opacity-75">{booking.actual_name}</div>
          )}

          <div className="text-xs mt-1 opacity-75">ID: {booking.booked_by}</div>
        </div>

        {/* Payment Status Indicator */}
        <div className="ml-2">
          <div
            className={`w-3 h-3 rounded-full ${
              booking.transaction_status === 'SUCCESSFUL' ? 'bg-green-400' :
              booking.transaction_status === 'PARTIAL' ? 'bg-yellow-400' :
              booking.transaction_status === 'PENDING' ? 'bg-red-400' :
              'bg-gray-400'
            }`}
            title={`Payment Status: ${booking.transaction_status || 'No Payments'}`}
          />
        </div>
      </div>

      {/* Payment Status Text for Mobile */}
      <div className="text-xs mt-1 opacity-75 lg:hidden">
        {booking.transaction_status ?
          `Payment: ${booking.transaction_status}` :
          'No Payments'
        }
      </div>
    </>
  ) : (
    'Open'
  )}
</div>
```

---

## STEP 3: Update bookings.ts API

### Changes Needed:
1. Update addBooking to include academy fields
2. Update updateBooking to include academy fields

### Code Changes:

**A. Update addBooking function (replace lines 24-54):**

```typescript
export const addBooking = async (
  name: string,
  phone: string,
  bookingDate: string,
  timeSlot: string,
  startDate?: string,
  endDate?: string,
  // NEW: Academy parameters
  bookingType?: 'NORMAL' | 'ACADEMY',
  academyStartDate?: string,
  academyEndDate?: string,
  academyNotes?: string
) => {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('phone', phone);
  formData.append('booking_date', bookingDate);
  formData.append('time_slot', timeSlot);

  // Add date range parameters (for calendar view)
  if (startDate) formData.append('start_date', startDate);
  if (endDate) formData.append('end_date', endDate);

  // NEW: Add academy booking parameters
  if (bookingType) {
    formData.append('booking_type', bookingType);

    if (bookingType === 'ACADEMY') {
      if (academyStartDate) formData.append('academy_start_date', academyStartDate);
      if (academyEndDate) formData.append('academy_end_date', academyEndDate);
      if (academyNotes) formData.append('academy_notes', academyNotes);
    }
  }

  try {
    const response = await api.post('/api/add_booking', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    console.log('Booking added successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error adding booking:', error);
    throw error;
  }
};
```

**B. Update updateBooking function similarly (lines 56-88):**

```typescript
export const updateBooking = async (
  bookingId: number,
  name: string,
  phone: string,
  bookingDate: string,
  timeSlot: string,
  startDate?: string,
  endDate?: string,
  // NEW: Academy parameters
  bookingType?: 'NORMAL' | 'ACADEMY',
  academyStartDate?: string,
  academyEndDate?: string,
  academyNotes?: string
) => {
  const formData = new FormData();
  formData.append('booking_id', bookingId.toString());
  formData.append('name', name);
  formData.append('phone', phone);
  formData.append('booking_date', bookingDate);
  formData.append('time_slot', timeSlot);

  // Add date range parameters
  if (startDate) formData.append('start_date', startDate);
  if (endDate) formData.append('end_date', endDate);

  // NEW: Add academy booking parameters
  if (bookingType) {
    formData.append('booking_type', bookingType);

    if (bookingType === 'ACADEMY') {
      if (academyStartDate) formData.append('academy_start_date', academyStartDate);
      if (academyEndDate) formData.append('academy_end_date', academyEndDate);
      if (academyNotes) formData.append('academy_notes', academyNotes);
    }
  }

  try {
    const response = await api.post('/api/update_booking', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    console.log('Booking updated successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error updating booking:', error);
    throw error;
  }
};
```

---

## STEP 4: Update bookings/page.tsx

Now you need to read the current `page.tsx` file and add the new state variables.

### State Variables to Add:

```typescript
// Add these new state variables
const [bookingType, setBookingType] = useState<'NORMAL' | 'ACADEMY'>('NORMAL');
const [academyStartDate, setAcademyStartDate] = useState('');
const [academyEndDate, setAcademyEndDate] = useState('');
const [academyNotes, setAcademyNotes] = useState('');
```

### Update handleSubmit function:

Pass the new parameters to addBooking/updateBooking:

```typescript
// In handleSubmit, when calling addBooking or updateBooking:
await addBooking(
  name,
  phone,
  selectedDate,
  selectedSlot,
  startDate,
  endDate,
  bookingType,          // NEW
  academyStartDate,     // NEW
  academyEndDate,       // NEW
  academyNotes          // NEW
);
```

### Update handleCellClick function:

When a cell is clicked, extract academy data:

```typescript
const handleCellClick = (date: string, slot: string) => {
  const booking = bookings[`${date}_${slot}`];

  if (booking) {
    // ... existing code ...

    // NEW: Load academy data if it's an academy booking
    if (booking.booking_type === 'ACADEMY') {
      setBookingType('ACADEMY');
      setAcademyStartDate(booking.academy_start_date || '');
      setAcademyEndDate(booking.academy_end_date || '');
      setAcademyNotes(booking.academy_notes || '');
    } else {
      setBookingType('NORMAL');
      setAcademyStartDate('');
      setAcademyEndDate('');
      setAcademyNotes('');
    }
  } else {
    // Reset to normal for new bookings
    setBookingType('NORMAL');
    setAcademyStartDate('');
    setAcademyEndDate('');
    setAcademyNotes('');
  }
};
```

### Pass new props to BookingForm:

```typescript
<BookingForm
  // ... existing props ...
  bookingType={bookingType}
  setBookingType={setBookingType}
  academyStartDate={academyStartDate}
  setAcademyStartDate={setAcademyStartDate}
  academyEndDate={academyEndDate}
  setAcademyEndDate={setAcademyEndDate}
  academyNotes={academyNotes}
  setAcademyNotes={setAcademyNotes}
/>
```

---

## STEP 5: Add CSS (Optional Styling)

You can add additional Tailwind classes or custom CSS for academy bookings:

```css
/* In your global CSS or Tailwind config */
.academy-booking {
  @apply bg-purple-600 border-purple-400;
}

.academy-booking:hover {
  @apply bg-purple-500;
}
```

---

## Testing Checklist

Once you've made all changes:

✅ **Test Normal Booking:**
1. Select "Normal Booking"
2. Fill in name, phone, date, time slot
3. Submit - should work as before

✅ **Test Academy Booking:**
1. Select "Academy Booking"
2. Fill in name, phone
3. Select start date (e.g., Dec 1, 2025)
4. Select end date (e.g., Dec 31, 2025)
5. Add notes (optional)
6. Select academy time slot (3-4:30 PM, 4:30-6 PM, or 6-7:30 PM on Tue/Fri/Sat)
7. Submit
8. Check that "Academy" appears on ALL dates in the calendar for that slot
9. Verify purple/different color styling
10. Hover to see full details

✅ **Test Conflict Detection:**
1. Try to book a normal slot that's already booked by academy
2. Should show error: "This slot is blocked by an academy booking"

✅ **Test Update/Delete:**
1. Click an academy booking
2. Form should load with academy data
3. Update and verify changes
4. Delete should remove ALL dates

---

## Summary of Changes

**Files Modified:** 4
1. `BookingForm.tsx` - Added booking type selector + academy fields
2. `BookingMatrix.tsx` - Added academy styling + display logic
3. `bookings.ts` - Updated API calls with academy parameters
4. `page.tsx` - Added state management for academy fields

**Visual Changes:**
- Academy bookings show as "Academy" (not customer name)
- Purple/different color for academy bookings
- Tooltip shows full details
- Date range picker for academy bookings
- Cost calculator shows estimated monthly cost

**Backend Ready:** ✅ Already complete and tested!

Ready to start? Let me know if you need help with any specific step!
