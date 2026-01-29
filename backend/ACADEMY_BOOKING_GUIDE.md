# Academy Booking System - Implementation Guide

## Overview

The academy booking system allows you to book slots for extended periods (typically a month) at a different rate than normal bookings. Academy bookings block the slot for the entire period and are displayed differently in the booking calendar.

## Database Changes

### New Tables/Columns

#### `bookings` table - New Columns:
- `booking_type` (ENUM): NORMAL or ACADEMY
- `academy_start_date` (DATE): Start date for academy bookings
- `academy_end_date` (DATE): End date for academy bookings
- `academy_month_days` (INTEGER): Number of days in the academy period
- `academy_notes` (VARCHAR): Optional notes for the academy booking

#### `slot_prices` table - New Column:
- `booking_type` (ENUM): NULL (normal pricing), NORMAL, or ACADEMY

## How It Works

### Normal Bookings (Existing Behavior)
- Book a single slot for a specific date
- Price based on slot_prices for that day/time
- Shows customer name in calendar

### Academy Bookings (New Feature)
- Book a slot for an extended period (month/weeks)
- Price = (rate per day × number of days)
- Blocks the slot for all dates in the period
- Shows as "Academy" in the calendar (different color should be applied in frontend)
- Prevents any normal bookings during that period

##Price Calculation

**Academy pricing formula:**
```
Total Price = Daily Rate × Number of Days
```

Example:
- Slot: 4:30 PM - 6:00 PM
- Period: January 1-31, 2025 (31 days)
- Daily Rate: ₹500
- **Total: ₹500 × 31 = ₹15,500**

## API Usage

### Creating an Academy Booking

**Endpoint:** `POST /api/add_booking`

**Parameters:**
```
name: "Cricket Academy"                    # Academy/Customer name
phone: "+91 9876543210"
booking_date: "2025-01-01"                 # Start date (for reference)
time_slot: "4:30 PM - 6:00 PM"
booking_type: "ACADEMY"                    # Set to ACADEMY
academy_start_date: "2025-01-01"          # First day of booking
academy_end_date: "2025-01-31"            # Last day of booking
academy_notes: "Monthly cricket training"  # Optional
```

**Response:**
```json
{
  "success": true,
  "message": "Academy slot booked successfully for 31 days (₹15500.00)",
  "bookingsData": {
    "2025-01-01_4:30 PM - 6:00 PM": {
      "id": 123,
      "name": "Academy",
      "actual_name": "Cricket Academy",
      "phone": "+91 9876543210",
      "booking_date": "2025-01-01",
      "time_slot": "4:30 PM - 6:00 PM",
      "booking_type": "ACADEMY",
      "academy_start_date": "2025-01-01",
      "academy_end_date": "2025-01-31",
      "academy_notes": "Monthly cricket training",
      "booked_by": "admin"
    },
    // ... entries for all dates in the period
  }
}
```

### Creating a Normal Booking

**Endpoint:** `POST /api/add_booking`

**Parameters:**
```
name: "John Doe"
phone: "+91 9876543210"
booking_date: "2025-01-15"
time_slot: "4:30 PM - 6:00 PM"
booking_type: "NORMAL"                     # Default value
```

## Conflict Detection

The system automatically prevents conflicts:

1. **Academy vs Normal**: Cannot book a normal slot if an academy booking covers that date
2. **Academy vs Academy**: Cannot book overlapping academy periods for the same slot
3. **Normal vs Academy**: When creating academy booking, checks for existing normal bookings in that period

**Example Conflict Scenarios:**

❌ **Blocked:** Normal booking on Jan 15 when academy booked Jan 1-31
❌ **Blocked:** Academy booking Jan 15-Feb 15 when academy already booked Jan 1-31
✅ **Allowed:** Normal booking on Feb 1 when academy booked Jan 1-31
✅ **Allowed:** Academy booking Feb 1-28 when academy booked Jan 1-31

## Setting Up Academy Pricing

### Step 1: Add Academy Prices to `slot_prices` Table

```sql
-- Example: Set academy rate for a time slot
INSERT INTO slot_prices (time_slot, day_of_week, price, booking_type, is_default)
VALUES
  ('4:30 PM - 6:00 PM', 'MONDAY', 500.00, 'ACADEMY', true),
  ('4:30 PM - 6:00 PM', 'TUESDAY', 500.00, 'ACADEMY', true),
  -- ... repeat for all days of the week
```

### Step 2: Normal vs Academy Pricing

```sql
-- Normal pricing (existing)
INSERT INTO slot_prices (time_slot, day_of_week, price, booking_type, is_default)
VALUES ('4:30 PM - 6:00 PM', 'MONDAY', 800.00, NULL, true);

-- Academy pricing (discounted rate)
INSERT INTO slot_prices (time_slot, day_of_week, price, booking_type, is_default)
VALUES ('4:30 PM - 6:00 PM', 'MONDAY', 500.00, 'ACADEMY', true);
```

## Frontend Integration

### Displaying Academy Bookings

Academy bookings return entries for **every day** in the period:

```javascript
// The bookingsData will have entries for all dates
{
  "2025-01-01_4:30 PM - 6:00 PM": { name: "Academy", booking_type: "ACADEMY", ... },
  "2025-01-02_4:30 PM - 6:00 PM": { name: "Academy", booking_type: "ACADEMY", ... },
  // ... all 31 days
  "2025-01-31_4:30 PM - 6:00 PM": { name: "Academy", booking_type: "ACADEMY", ... }
}
```

### Recommended UI

1. **Display**: Show "Academy" in booking matrix
2. **Color**: Use different background color (e.g., purple/blue vs green for normal)
3. **Details**: Show full name and period on hover/click:
   ```
   Academy
   Cricket Academy
   Jan 1 - Jan 31, 2025
   ```
4. **Form**: Add booking type selector:
   - Radio buttons: "Normal Booking" / "Academy Booking"
   - Show date range picker when "Academy" selected
   - Calculate and show estimated price

### Example React Component Logic

```jsx
const BookingCard = ({ booking }) => {
  const isAcademy = booking.booking_type === 'ACADEMY';

  return (
    <div className={isAcademy ? 'academy-booking' : 'normal-booking'}>
      <div className="booking-name">{booking.name}</div>
      {isAcademy && (
        <div className="academy-details">
          <small>
            {booking.academy_start_date} to {booking.academy_end_date}
          </small>
        </div>
      )}
    </div>
  );
};
```

## Transaction Handling

When an academy booking is created, a `TransactionSummary` is automatically created with:
- `total_price`: Calculated total (rate × days)
- `total_paid`: 0 (initially)
- `leftover`: Full amount
- `status`: PENDING

You can then add transactions (booking payment, monthly installments, etc.) using the existing transaction endpoints.

## Testing

### Test Academy Booking

```bash
curl -X POST http://localhost:8000/api/add_booking \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "name=Cricket Academy" \
  -F "phone=+919876543210" \
  -F "booking_date=2025-01-01" \
  -F "time_slot=4:30 PM - 6:00 PM" \
  -F "booking_type=ACADEMY" \
  -F "academy_start_date=2025-01-01" \
  -F "academy_end_date=2025-01-31" \
  -F "academy_notes=Monthly training"
```

### Test Conflict Detection

```bash
# This should fail with conflict message
curl -X POST http://localhost:8000/api/add_booking \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "name=John Doe" \
  -F "phone=+919876543210" \
  -F "booking_date=2025-01-15" \
  -F "time_slot=4:30 PM - 6:00 PM" \
  -F "booking_type=NORMAL"
```

## Common Use Cases

### Monthly Academy Booking
```
Scenario: Cricket academy wants 4:30-6:00 PM slot for entire January
Solution: Create academy booking Jan 1-31
Pricing: Daily rate × 31 days
```

### Partial Month Academy
```
Scenario: Academy needs slot from Jan 15-31 (mid-month start)
Solution: Create academy booking Jan 15-31
Pricing: Daily rate × 17 days
```

### Multi-Month Academy
```
Scenario: Academy wants 3 months (Jan-Mar)
Solution: Create separate bookings for each month
- Booking 1: Jan 1-31
- Booking 2: Feb 1-28
- Booking 3: Mar 1-31
```

## Migration

The database migration has already been applied. All existing bookings are marked as `booking_type = 'NORMAL'`.

## Notes

- Academy bookings use the first day as `booking_date` for database consistency
- The system calculates exact number of days between start and end dates
- Academy prices fall back to normal prices if no academy rate is configured
- All academy dates share the same booking ID (single database record)
- Deletingupdating an academy booking affects the entire period

## Future Enhancements

Potential features to consider:
1. Auto-renewal for monthly academies
2. Bulk discount for long-term bookings
3. Academy-specific reporting
4. Attendance tracking for academy slots
5. Multiple slot discount (if academy books multiple slots)
