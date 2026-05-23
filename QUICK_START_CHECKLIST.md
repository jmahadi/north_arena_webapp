# Customer Booking App - Quick Start Checklist

## Phase 1: Preparation (30 minutes)

### 1. bKash Merchant Account
- [ ] Apply for bKash merchant account at https://www.bka.sh/merchant
- [ ] Get sandbox credentials for testing
- [ ] Note down: App Key, App Secret, Username, Password

### 2. Backend Setup
- [ ] Add bKash credentials to `backend/.env`
```env
BKASH_BASE_URL=https://checkout.sandbox.bka.sh/v1.2.0-beta
BKASH_APP_KEY=your_sandbox_app_key
BKASH_APP_SECRET=your_sandbox_app_secret
BKASH_USERNAME=your_sandbox_username
BKASH_PASSWORD=your_sandbox_password
BKASH_CALLBACK_URL=http://localhost:8000/api/customer/payment/bkash/callback
```

- [ ] Install httpx for async HTTP requests
```bash
cd backend
pip install httpx --break-system-packages
```

### 3. Database Migration
- [ ] Add bKash fields to Booking model
- [ ] Run migration
```bash
cd backend
alembic revision --autogenerate -m "Add bKash payment fields"
alembic upgrade head
```

---

## Phase 2: Backend Development (4-5 hours)

### Step 1: Create bKash Service (1 hour)
- [ ] Create `backend/app/bkash.py`
- [ ] Implement `get_token()` method
- [ ] Implement `create_payment()` method
- [ ] Implement `execute_payment()` method
- [ ] Test token generation in sandbox

### Step 2: Add Customer API Endpoints (2 hours)
Add to `backend/app/routes.py`:

- [ ] `GET /api/customer/slots/available` - Get available slots for a date
- [ ] `POST /api/customer/bookings/create` - Create booking + initiate payment
- [ ] `GET /api/customer/payment/bkash/callback` - Handle bKash callback
- [ ] `GET /api/customer/bookings/{id}` - Get booking details

### Step 3: Test Backend (1 hour)
- [ ] Test available slots endpoint with Postman
- [ ] Test create booking endpoint
- [ ] Verify bKash payment creation returns URL
- [ ] Test payment execution flow

---

## Phase 3: Frontend Development (5-6 hours)

### Step 1: Create Customer Routes (30 minutes)
```bash
cd frontend
mkdir -p app/book/{details,payment,confirmation}
```

Create these files:
- [ ] `app/book/page.tsx` - Main booking page (date + slots)
- [ ] `app/book/details/page.tsx` - Customer info form
- [ ] `app/book/payment/page.tsx` - Payment processing
- [ ] `app/book/confirmation/page.tsx` - Success page

### Step 2: Build Slot Selection Page (2 hours)
- [ ] Date picker component
- [ ] Fetch available slots from API
- [ ] Display slots grid with price and availability
- [ ] Handle slot selection
- [ ] Store selected slot in state/localStorage

### Step 3: Build Customer Details Form (1 hour)
- [ ] Phone number input with Bangladesh format validation
- [ ] Name input field
- [ ] Display selected slot summary
- [ ] Form validation
- [ ] "Continue to Payment" button

### Step 4: Build Payment Flow (1.5 hours)
- [ ] Call create booking API
- [ ] Redirect to bKash checkout URL
- [ ] Handle callback redirect
- [ ] Display loading states

### Step 5: Build Confirmation Page (1 hour)
- [ ] Display booking details
- [ ] Show booking ID
- [ ] Success message
- [ ] "Book Another Slot" button
- [ ] "View My Bookings" link

---

## Phase 4: Testing & Polish (3-4 hours)

### Testing Scenarios
- [ ] Book a slot successfully (end-to-end)
- [ ] Try booking the same slot twice (should fail)
- [ ] Test invalid phone number format
- [ ] Test bKash payment cancellation
- [ ] Test payment timeout scenario
- [ ] Verify booking appears in admin panel
- [ ] Check transaction record creation

### Mobile Testing
- [ ] Test on mobile phone (responsive design)
- [ ] Test bKash redirect on mobile browser
- [ ] Verify payment flow on mobile

### Polish
- [ ] Add loading spinners
- [ ] Add error messages
- [ ] Improve UI/UX
- [ ] Add confirmation dialogs
- [ ] Test accessibility

---

## Phase 5: Deployment (2-3 hours)

### Backend Deployment
- [ ] Get production bKash credentials
- [ ] Update production environment variables
- [ ] Deploy backend to Railway/Heroku
- [ ] Test production bKash integration
- [ ] Setup error monitoring

### Frontend Deployment
- [ ] Update API URL to production backend
- [ ] Build Next.js app (`npm run build`)
- [ ] Deploy to Vercel/Netlify
- [ ] Test production booking flow

### Post-Deployment
- [ ] Make a test booking with real money (BDT 10)
- [ ] Verify payment callback works
- [ ] Check database records
- [ ] Monitor error logs

---

## Optional Enhancements (Future)

### Week 2+
- [ ] SMS notifications (booking confirmation)
- [ ] Booking lookup by phone number
- [ ] Cancel/reschedule booking
- [ ] Email notifications
- [ ] Customer booking history
- [ ] Promo code system

---

## Estimated Timeline

| Phase | Duration | Total Hours |
|-------|----------|-------------|
| Preparation | 30 min | 0.5 |
| Backend Development | 4-5 hours | 4.5 |
| Frontend Development | 5-6 hours | 5.5 |
| Testing & Polish | 3-4 hours | 3.5 |
| Deployment | 2-3 hours | 2.5 |
| **TOTAL** | | **~16 hours** |

**Target: Launch in 2-3 days** ⚡

---

## Key Files Reference

### Backend Files to Create/Modify
```
backend/
├── app/
│   ├── bkash.py              (NEW - bKash service)
│   ├── routes.py             (MODIFY - add customer endpoints)
│   ├── models.py             (MODIFY - add bKash fields)
│   └── config.py             (MODIFY - add bKash settings)
├── .env                      (MODIFY - add bKash credentials)
└── requirements.txt          (MODIFY - add httpx)
```

### Frontend Files to Create
```
frontend/
├── app/
│   ├── book/
│   │   ├── page.tsx                    (NEW - slot selection)
│   │   ├── details/page.tsx            (NEW - customer form)
│   │   ├── payment/page.tsx            (NEW - payment processing)
│   │   └── confirmation/page.tsx       (NEW - success page)
│   └── lib/
│       └── customer-api.ts             (NEW - API functions)
```

---

## Support Resources

- **Full Guide**: See `CUSTOMER_BOOKING_APP_GUIDE.md`
- **Flow Diagram**: See `BOOKING_FLOW_DIAGRAM.mermaid`
- **bKash API Docs**: https://developer.bka.sh
- **bKash Merchant Support**: merchant@bkash.com

---

## Pro Tips 💡

1. **Start with Sandbox**: Always test bKash integration in sandbox first
2. **Test Early**: Test each component as you build, don't wait till the end
3. **Mobile First**: Build UI mobile-first since most customers use phones
4. **Error Handling**: Add proper error messages for better UX
5. **Keep It Simple**: Launch with core features, add enhancements later

---

## Need Help?

Common issues and solutions:

**Issue**: bKash token generation fails
- Solution: Double-check credentials in .env file

**Issue**: Payment callback not received
- Solution: Ensure callback URL is publicly accessible (use ngrok for local testing)

**Issue**: Phone validation too strict
- Solution: Adjust regex to support different formats

**Issue**: Slot shows available but booking fails
- Solution: Add proper database locking/transactions

---

Good luck! 🚀 You've got this!
