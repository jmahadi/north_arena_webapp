# Customer Booking App Implementation Guide

## Overview
This guide outlines the easiest approach to build a customer-facing slot booking system with bKash payment integration for your existing FastAPI + Next.js application.

## Architecture Decision: **Recommended Approach**

### Option 1: Separate Customer Route in Existing Frontend ⭐ **EASIEST**
- **Pros**: Leverage existing infrastructure, single deployment, shared API client
- **Cons**: Slightly larger bundle size
- **Best for**: Quick launch, easier maintenance

### Option 2: Separate Customer Next.js App
- **Pros**: Completely isolated, can optimize separately
- **Cons**: More deployment complexity, code duplication
- **Best for**: If you expect customer app to scale independently

**Recommendation**: Go with **Option 1** for fastest implementation.

---

## User Journey Design (Seamless 4-Step Flow)

### Step 1: Landing Page → Slot Selection
```
┌─────────────────────────────────┐
│     🏟️ Book Your Slot          │
│                                  │
│  Select Date: [Calendar Picker]  │
│                                  │
│  Available Slots:                │
│  ┌─────────────────────────┐   │
│  │ 6:00 AM - 7:00 AM       │   │
│  │ ✅ Available | BDT 800  │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 7:00 AM - 8:00 AM       │   │
│  │ ❌ Booked               │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

### Step 2: Customer Details
```
┌─────────────────────────────────┐
│  📱 Your Information            │
│                                  │
│  Phone Number *                  │
│  [+880 ______________]          │
│                                  │
│  Name *                          │
│  [________________]             │
│                                  │
│  Selected: Dec 25, 6:00-7:00 AM │
│  Price: BDT 800                  │
│                                  │
│  [Continue to Payment →]        │
└─────────────────────────────────┘
```

### Step 3: bKash Payment
```
┌─────────────────────────────────┐
│  💳 Payment                     │
│                                  │
│  Amount: BDT 800                 │
│                                  │
│  [Pay with bKash]               │
│                                  │
│  (Redirects to bKash checkout)  │
└─────────────────────────────────┘
```

### Step 4: Confirmation
```
┌─────────────────────────────────┐
│  ✅ Booking Confirmed!          │
│                                  │
│  Booking ID: #12345              │
│  Date: Dec 25, 2024              │
│  Time: 6:00 AM - 7:00 AM         │
│                                  │
│  📱 SMS sent to +880 1234567890 │
│                                  │
│  [View Booking Details]          │
│  [Book Another Slot]             │
└─────────────────────────────────┘
```

---

## Backend API Endpoints Needed

### 1. Get Available Slots (Already exists, may need adjustment)
```python
GET /api/customer/slots/available
Query params:
  - date: YYYY-MM-DD
  - booking_type: NORMAL (default)

Response:
{
  "date": "2024-12-25",
  "slots": [
    {
      "time_slot": "6:00 AM - 7:00 AM",
      "price": 800,
      "available": true
    },
    {
      "time_slot": "7:00 AM - 8:00 AM",
      "price": 800,
      "available": false
    }
  ]
}
```

### 2. Create Customer Booking (NEW)
```python
POST /api/customer/bookings/create
Body:
{
  "phone": "+8801234567890",
  "name": "John Doe",
  "booking_date": "2024-12-25",
  "time_slot": "6:00 AM - 7:00 AM",
  "booking_type": "NORMAL"
}

Response:
{
  "booking_id": 12345,
  "payment_required": true,
  "amount": 800,
  "bkash_payment_url": "https://checkout.bkash.com/..."
}
```

### 3. bKash Payment Callback (NEW)
```python
POST /api/customer/payment/bkash/callback
Body: {
  "paymentID": "xxx",
  "status": "success",
  "trxID": "xxx"
}

Response:
{
  "booking_confirmed": true,
  "booking_id": 12345,
  "transaction_id": 789
}
```

### 4. Get Booking Status (NEW)
```python
GET /api/customer/bookings/{booking_id}
Query params:
  - phone: +8801234567890 (for verification)

Response:
{
  "booking_id": 12345,
  "name": "John Doe",
  "phone": "+8801234567890",
  "booking_date": "2024-12-25",
  "time_slot": "6:00 AM - 7:00 AM",
  "payment_status": "SUCCESSFUL",
  "created_at": "2024-12-20T10:30:00Z"
}
```

---

## bKash Checkout Integration

### Requirements
1. **bKash Merchant Account** (Apply at https://www.bka.sh/merchant)
2. **Credentials**:
   - App Key
   - App Secret
   - Username
   - Password
   - Merchant Invoice Number prefix

### Environment Variables (Add to backend/.env)
```env
BKASH_BASE_URL=https://checkout.sandbox.bka.sh/v1.2.0-beta
BKASH_APP_KEY=your_app_key
BKASH_APP_SECRET=your_app_secret
BKASH_USERNAME=your_username
BKASH_PASSWORD=your_password
BKASH_MERCHANT_NUMBER=01234567890
BKASH_CALLBACK_URL=https://yourapp.com/api/customer/payment/bkash/callback
```

### Implementation Flow

#### 1. Grant Token (Before each payment)
```python
POST https://checkout.bka.sh/v1.2.0-beta/checkout/token/grant
Headers:
  - username: {BKASH_USERNAME}
  - password: {BKASH_PASSWORD}

Body:
{
  "app_key": "{BKASH_APP_KEY}",
  "app_secret": "{BKASH_APP_SECRET}"
}

Response:
{
  "id_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

#### 2. Create Payment
```python
POST https://checkout.bka.sh/v1.2.0-beta/checkout/create
Headers:
  - Authorization: Bearer {id_token}
  - X-APP-Key: {BKASH_APP_KEY}

Body:
{
  "mode": "0011",  # For checkout
  "payerReference": "{customer_phone}",
  "callbackURL": "{BKASH_CALLBACK_URL}",
  "amount": "800",
  "currency": "BDT",
  "intent": "sale",
  "merchantInvoiceNumber": "BOOKING-12345"
}

Response:
{
  "paymentID": "TR0000ABC123",
  "bkashURL": "https://checkout.bka.sh/payment/1234",
  "callbackURL": "https://yourapp.com/api/...",
  "successCallbackURL": "https://yourapp.com/success",
  "failureCallbackURL": "https://yourapp.com/failure",
  "statusCode": "0000",
  "statusMessage": "Successful"
}
```

#### 3. Execute Payment (After user completes in bKash)
```python
POST https://checkout.bka.sh/v1.2.0-beta/checkout/execute
Headers:
  - Authorization: Bearer {id_token}
  - X-APP-Key: {BKASH_APP_KEY}

Body:
{
  "paymentID": "{paymentID_from_create}"
}

Response:
{
  "paymentID": "TR0000ABC123",
  "trxID": "ABC1234567",
  "transactionStatus": "Completed",
  "amount": "800",
  "currency": "BDT",
  "statusCode": "0000",
  "statusMessage": "Successful"
}
```

---

## Database Schema (Already Good! ✅)

Your existing schema supports this perfectly:
- ✅ `Booking` table has `phone` and `name` fields
- ✅ `Transaction` table supports bKash payment method
- ✅ `TransactionSummary` tracks payment status

**Minor Addition Recommended**:
Add a field to store bKash transaction details:

```python
# In Booking model
class Booking(Base):
    # ... existing fields ...
    bkash_payment_id = Column(String, nullable=True)  # Store bKash paymentID
    bkash_trx_id = Column(String, nullable=True)      # Store bKash trxID
```

Run migration:
```bash
cd backend
alembic revision --autogenerate -m "Add bKash payment fields"
alembic upgrade head
```

---

## Implementation Steps (Easy 6-Step Plan)

### Step 1: Setup Frontend Routes (2 hours)
```bash
cd frontend
mkdir -p app/book
```

Create these pages:
- `app/book/page.tsx` - Landing page with date/slot selector
- `app/book/details/page.tsx` - Customer information form
- `app/book/payment/page.tsx` - Payment processing
- `app/book/confirmation/page.tsx` - Booking confirmation

### Step 2: Create Backend Routes (3 hours)
```bash
cd backend/app
```

Add to `routes.py`:
```python
# Customer Booking Endpoints (no authentication required)
@app.get("/api/customer/slots/available")
async def get_available_customer_slots(...)

@app.post("/api/customer/bookings/create")
async def create_customer_booking(...)

@app.get("/api/customer/bookings/{booking_id}")
async def get_customer_booking(...)
```

### Step 3: Implement bKash Integration (4 hours)
```bash
cd backend/app
touch bkash.py  # Create bKash service module
```

Create helper functions:
- `get_bkash_token()` - Get grant token
- `create_bkash_payment()` - Create payment
- `execute_bkash_payment()` - Execute payment
- `verify_bkash_payment()` - Verify payment status

### Step 4: Connect Frontend to Backend (3 hours)
```typescript
// frontend/app/lib/customer-api.ts
export async function getAvailableSlots(date: string) { ... }
export async function createBooking(data: BookingData) { ... }
export async function getBookingStatus(id: number, phone: string) { ... }
```

### Step 5: Add Phone Number Validation (1 hour)
```typescript
// Use Bangladesh phone number format
const phoneRegex = /^(\+880|880)?[1][3-9]\d{8}$/;
```

### Step 6: Testing & Deploy (2 hours)
- Test on bKash sandbox environment
- Verify booking flow end-to-end
- Test payment success/failure scenarios
- Deploy to production

**Total Estimated Time: 15 hours (2 days)**

---

## Code Snippets to Get Started

### Frontend: Slot Selection Component
```typescript
// app/book/page.tsx
'use client';
import { useState } from 'react';
import { format } from 'date-fns';

export default function BookingPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchSlots = async (date: Date) => {
    setLoading(true);
    const response = await fetch(
      `/api/customer/slots/available?date=${format(date, 'yyyy-MM-dd')}`
    );
    const data = await response.json();
    setSlots(data.slots);
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Book Your Slot</h1>

      {/* Date Picker */}
      <input
        type="date"
        value={format(selectedDate, 'yyyy-MM-dd')}
        onChange={(e) => {
          const newDate = new Date(e.target.value);
          setSelectedDate(newDate);
          fetchSlots(newDate);
        }}
        className="w-full p-3 border rounded-lg mb-6"
      />

      {/* Slots Grid */}
      <div className="space-y-3">
        {slots.map((slot) => (
          <div
            key={slot.time_slot}
            className={`p-4 border rounded-lg ${
              slot.available
                ? 'cursor-pointer hover:border-blue-500'
                : 'bg-gray-100 cursor-not-allowed'
            }`}
            onClick={() => slot.available && handleSlotSelect(slot)}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{slot.time_slot}</span>
              <span className="text-lg font-bold">
                {slot.available ? `BDT ${slot.price}` : 'Booked'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Backend: Available Slots Endpoint
```python
# backend/app/routes.py
from datetime import datetime, date
from fastapi import Query

@app.get("/api/customer/slots/available")
async def get_available_customer_slots(
    date: date = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db)
):
    """Get available slots for a specific date (customer-facing)"""

    # Get all slots for this day of week
    day_of_week = DayOfWeek[date.strftime("%A").upper()]

    # Get prices for all slots
    slot_prices_result = await db.execute(
        select(SlotPrice)
        .filter(
            SlotPrice.day_of_week == day_of_week,
            or_(
                SlotPrice.booking_type == None,
                SlotPrice.booking_type == BookingType.NORMAL
            )
        )
    )
    slot_prices = slot_prices_result.scalars().all()

    # Get existing bookings for this date
    bookings_result = await db.execute(
        select(Booking)
        .filter(
            Booking.booking_date == date,
            Booking.is_cancelled == False
        )
    )
    booked_slots = {b.time_slot for b in bookings_result.scalars().all()}

    # Build response
    slots = []
    for slot_price in slot_prices:
        slots.append({
            "time_slot": slot_price.time_slot,
            "price": slot_price.price,
            "available": slot_price.time_slot not in booked_slots
        })

    return {
        "date": date.isoformat(),
        "slots": slots
    }
```

### Backend: Create Booking Endpoint
```python
from pydantic import BaseModel, Field

class CustomerBookingCreate(BaseModel):
    phone: str = Field(..., regex=r'^(\+880|880)?[1][3-9]\d{8}$')
    name: str = Field(..., min_length=2, max_length=50)
    booking_date: date
    time_slot: str
    booking_type: BookingType = BookingType.NORMAL

@app.post("/api/customer/bookings/create")
async def create_customer_booking(
    booking_data: CustomerBookingCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new booking from customer (no auth required)"""

    # 1. Check if slot is available
    existing_booking = await db.execute(
        select(Booking)
        .filter(
            Booking.booking_date == booking_data.booking_date,
            Booking.time_slot == booking_data.time_slot,
            Booking.is_cancelled == False
        )
    )
    if existing_booking.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slot already booked")

    # 2. Get slot price
    day_of_week = DayOfWeek[booking_data.booking_date.strftime("%A").upper()]
    slot_price_result = await db.execute(
        select(SlotPrice)
        .filter(
            SlotPrice.time_slot == booking_data.time_slot,
            SlotPrice.day_of_week == day_of_week
        )
    )
    slot_price = slot_price_result.scalar_one_or_none()
    if not slot_price:
        raise HTTPException(status_code=404, detail="Slot price not found")

    # 3. Create booking (payment pending)
    new_booking = Booking(
        booked_by=None,  # Customer bookings have no user
        name=booking_data.name,
        phone=booking_data.phone,
        booking_date=booking_data.booking_date,
        time_slot=booking_data.time_slot,
        booking_type=booking_data.booking_type
    )
    db.add(new_booking)
    await db.commit()
    await db.refresh(new_booking)

    # 4. Create transaction summary
    transaction_summary = TransactionSummary(
        booking_id=new_booking.id,
        total_price=slot_price.price,
        total_paid=0,
        status=TransactionStatus.PENDING
    )
    db.add(transaction_summary)
    await db.commit()

    # 5. Create bKash payment
    from .bkash import create_bkash_payment
    bkash_response = await create_bkash_payment(
        amount=slot_price.price,
        invoice_number=f"BOOKING-{new_booking.id}",
        payer_reference=booking_data.phone
    )

    # 6. Update booking with payment ID
    new_booking.bkash_payment_id = bkash_response['paymentID']
    await db.commit()

    return {
        "booking_id": new_booking.id,
        "payment_required": True,
        "amount": slot_price.price,
        "bkash_payment_url": bkash_response['bkashURL']
    }
```

### Backend: bKash Service Module
```python
# backend/app/bkash.py
import httpx
from typing import Dict
from .config import settings

class BkashService:
    def __init__(self):
        self.base_url = settings.BKASH_BASE_URL
        self.app_key = settings.BKASH_APP_KEY
        self.app_secret = settings.BKASH_APP_SECRET
        self.username = settings.BKASH_USERNAME
        self.password = settings.BKASH_PASSWORD
        self._token = None

    async def get_token(self) -> str:
        """Get bKash grant token"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/checkout/token/grant",
                json={
                    "app_key": self.app_key,
                    "app_secret": self.app_secret
                },
                headers={
                    "username": self.username,
                    "password": self.password
                }
            )
            data = response.json()
            self._token = data['id_token']
            return self._token

    async def create_payment(
        self,
        amount: float,
        invoice_number: str,
        payer_reference: str
    ) -> Dict:
        """Create bKash payment"""
        if not self._token:
            await self.get_token()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/checkout/create",
                json={
                    "mode": "0011",
                    "payerReference": payer_reference,
                    "callbackURL": settings.BKASH_CALLBACK_URL,
                    "amount": str(amount),
                    "currency": "BDT",
                    "intent": "sale",
                    "merchantInvoiceNumber": invoice_number
                },
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "X-APP-Key": self.app_key
                }
            )
            return response.json()

    async def execute_payment(self, payment_id: str) -> Dict:
        """Execute bKash payment after user approval"""
        if not self._token:
            await self.get_token()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/checkout/execute",
                json={"paymentID": payment_id},
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "X-APP-Key": self.app_key
                }
            )
            return response.json()

# Singleton instance
bkash_service = BkashService()

# Helper functions
async def create_bkash_payment(amount: float, invoice_number: str, payer_reference: str):
    return await bkash_service.create_payment(amount, invoice_number, payer_reference)

async def execute_bkash_payment(payment_id: str):
    return await bkash_service.execute_payment(payment_id)
```

---

## Security Considerations

### 1. Rate Limiting
Prevent abuse by limiting booking attempts:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/api/customer/bookings/create")
@limiter.limit("5/minute")  # Max 5 bookings per minute per IP
async def create_customer_booking(...):
    ...
```

### 2. Phone Number Verification (Optional but Recommended)
Send OTP via SMS to verify phone numbers:
```python
# Consider using services like:
# - Twilio SMS API
# - Bangladesh SMS gateways (SSL Wireless, Grameenphone, etc.)
```

### 3. Booking Timeout
Automatically cancel unpaid bookings after 15 minutes:
```python
# Add a background task to check and cancel
from datetime import datetime, timedelta

async def cancel_expired_bookings():
    cutoff_time = datetime.now() - timedelta(minutes=15)
    expired_bookings = await db.execute(
        select(Booking)
        .join(TransactionSummary)
        .filter(
            Booking.created_at < cutoff_time,
            TransactionSummary.status == TransactionStatus.PENDING
        )
    )
    # Cancel these bookings
```

---

## Testing Checklist

### Development (Sandbox)
- [ ] bKash sandbox account setup
- [ ] Successfully create booking
- [ ] Redirect to bKash checkout page
- [ ] Complete payment in sandbox
- [ ] Payment callback received
- [ ] Booking status updated to SUCCESSFUL
- [ ] Test payment failure scenario
- [ ] Test duplicate booking prevention
- [ ] Test phone number validation

### Production
- [ ] bKash production credentials configured
- [ ] SSL certificate active
- [ ] Test with real BDT 10 transaction
- [ ] Monitor payment callback logs
- [ ] Setup error alerting
- [ ] Customer SMS notifications (optional)

---

## Deployment Notes

### Environment Variables
```env
# Production bKash credentials
BKASH_BASE_URL=https://checkout.pay.bka.sh/v1.2.0-beta
BKASH_APP_KEY=production_app_key
BKASH_APP_SECRET=production_app_secret
BKASH_USERNAME=production_username
BKASH_PASSWORD=production_password
BKASH_CALLBACK_URL=https://yourdomain.com/api/customer/payment/bkash/callback
```

### CORS Configuration
Allow customer app to access backend:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Future Enhancements

1. **SMS Notifications**
   - Booking confirmation SMS
   - Reminder SMS 24 hours before slot

2. **Booking Management**
   - View booking by phone number
   - Cancel/reschedule bookings

3. **Multi-language Support**
   - Bengali language option
   - Language switcher

4. **Analytics**
   - Track conversion rates
   - Popular time slots
   - Payment success rates

5. **Promotional Codes**
   - Discount codes
   - Referral system

---

## Support & Resources

- **bKash Merchant Portal**: https://merchant.bka.sh
- **bKash API Docs**: https://developer.bka.sh
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **Next.js Docs**: https://nextjs.org/docs

---

## Questions?

If you need help with:
- bKash merchant account setup
- API integration issues
- Database migrations
- Frontend component design

Feel free to ask! 🚀
