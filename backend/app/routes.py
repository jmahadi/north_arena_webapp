from fastapi import APIRouter, Depends, Request, Form, HTTPException , Query , Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import text , func
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, and_
from fastapi.responses import HTMLResponse , RedirectResponse , JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
from datetime import datetime , timedelta  ,timezone , date
from dateutil.relativedelta import relativedelta
from .database import get_db
from .models import User , Booking , Transaction, SlotPrice, PaymentMethod , TransactionStatus , TransactionType , TransactionSummary, DayOfWeek, BookingType
from .auth import create_access_token, get_current_user
from sqlalchemy.exc import SQLAlchemyError
from pydantic import ValidationError
from enum import Enum
import logging

router = APIRouter()

templates = Jinja2Templates(directory="app/templates")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)


'''
--------------------
ACADEMY BOOKING HELPER FUNCTIONS
--------------------
'''

async def calculate_academy_price(db: AsyncSession, time_slot: str, start_date: date, end_date: date, days_of_week: str = None) -> float:
    """
    Calculate the total price for an academy booking
    Price = (rate per day × number of matching days in period)

    Args:
        days_of_week: Comma-separated days (e.g., "MONDAY,FRIDAY") or None for all days
    """
    from calendar import monthrange
    from datetime import timedelta

    # Parse selected days of week if provided
    selected_days = None
    if days_of_week:
        selected_days = [day.strip().upper() for day in days_of_week.split(',')]

    # Count only days that match the selected days of week
    current_date = start_date
    matching_days = 0

    while current_date <= end_date:
        day_name = current_date.strftime('%A').upper()

        # If no specific days selected, count all days
        # Otherwise, only count if this day matches the selection
        if not selected_days or day_name in selected_days:
            matching_days += 1

        current_date += timedelta(days=1)

    if matching_days == 0:
        raise HTTPException(status_code=400, detail="No matching days found in the selected period")

    # Get a sample day to fetch pricing
    sample_date = start_date
    if selected_days:
        # Find the first date that matches our selection
        while sample_date <= end_date:
            if sample_date.strftime('%A').upper() in selected_days:
                break
            sample_date += timedelta(days=1)

    day_of_week = DayOfWeek[sample_date.strftime('%A').upper()]

    # Get the academy price for this time slot and day
    slot_price_result = await db.execute(
        select(SlotPrice)
        .filter(
            SlotPrice.time_slot == time_slot,
            SlotPrice.day_of_week == day_of_week,
            SlotPrice.booking_type == BookingType.ACADEMY
        )
    )
    academy_price = slot_price_result.scalar_one_or_none()

    if not academy_price:
        # Fallback to normal price if no academy price found
        slot_price_result = await db.execute(
            select(SlotPrice)
            .filter(
                SlotPrice.time_slot == time_slot,
                SlotPrice.day_of_week == day_of_week,
                or_(
                    SlotPrice.booking_type == None,
                    SlotPrice.booking_type == BookingType.NORMAL
                )
            )
        )
        academy_price = slot_price_result.scalar_one_or_none()

    if not academy_price:
        raise HTTPException(status_code=404, detail=f"No price found for time slot {time_slot}")

    # Total price = price per day × number of matching days
    total_price = academy_price.price * matching_days

    return total_price, academy_price.price, matching_days


async def check_academy_booking_conflicts(
    db: AsyncSession,
    time_slot: str,
    start_date: date,
    end_date: date,
    exclude_booking_id: int = None
) -> bool:
    """
    Check if there are any conflicting bookings for this academy slot.
    Returns True if there's a conflict, False otherwise.
    """
    # Check for normal bookings in the date range
    normal_query = select(Booking).filter(
        Booking.time_slot == time_slot,
        Booking.booking_type == BookingType.NORMAL,
        Booking.booking_date >= start_date,
        Booking.booking_date <= end_date
    )

    if exclude_booking_id:
        normal_query = normal_query.filter(Booking.id != exclude_booking_id)

    result = await db.execute(normal_query)
    normal_conflicts = result.scalars().all()

    if normal_conflicts:
        return True, normal_conflicts

    # Check for academy bookings that might overlap
    academy_query = select(Booking).filter(
        Booking.time_slot == time_slot,
        Booking.booking_type == BookingType.ACADEMY,
        Booking.academy_start_date <= end_date,
        Booking.academy_end_date >= start_date
    )

    if exclude_booking_id:
        academy_query = academy_query.filter(Booking.id != exclude_booking_id)

    result = await db.execute(academy_query)
    academy_bookings = result.scalars().all()

    # For each academy booking, check if any dates in the range match its selected days
    conflicting_academy_bookings = []
    for academy_booking in academy_bookings:
        # Parse the selected days of week
        if academy_booking.academy_days_of_week:
            selected_days = [day.strip().upper() for day in academy_booking.academy_days_of_week.split(',')]
        else:
            selected_days = None

        # Check each date in the range
        current_date = max(start_date, academy_booking.academy_start_date)
        end_check = min(end_date, academy_booking.academy_end_date)

        while current_date <= end_check:
            day_name = current_date.strftime('%A').upper()
            # If no days specified or this day matches the selected days, it's a conflict
            if not selected_days or day_name in selected_days:
                conflicting_academy_bookings.append(academy_booking)
                break
            current_date += timedelta(days=1)

    return len(conflicting_academy_bookings) > 0, conflicting_academy_bookings


'''
--------------------
INDEX ROUTE
--------------------
'''

@router.get("/")
async def index(request: Request):
    # Return 200 OK for healthchecks (Railway checks / by default)
    return {"status": "healthy", "service": "North Arena Booking System"}

@router.post("/register", response_class=HTMLResponse)
async def register(request: Request, username: str = Form(...), email: str = Form(...), password: str = Form(...), db: AsyncSession = Depends(get_db)):
    user = User(username=username, email=email)
    user.set_password(password)
    db.add(user)
    await db.commit()
    return RedirectResponse(url="/login", status_code=303)

@router.get("/register", response_class=HTMLResponse)
async def register_get(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

'''
--------------------
LOGIN ROUTE
--------------------
'''

@router.post("/api/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    logger.info(f"Login attempt for user: {form_data.username}")
    user_result = await db.execute(select(User).filter(User.email == form_data.username))
    user = user_result.scalar_one_or_none()
    if not user or not user.check_password(form_data.password):
        logger.warning(f"Failed login attempt for user: {form_data.username}")
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    access_token = create_access_token(data={"sub": user.email})
    logger.info(f"Successful login for user: {form_data.username}")
    return {"access_token": access_token, "token_type": "bearer"}

'''
--------------------
LOGOUT ROUTE
--------------------
'''

@router.post("/api/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token")
    return {"message": "Logged out successfully"}

'''
--------------------
DASHBOARD ROUTE
--------------------
'''

@router.get("/api/dashboard")
async def dashboard(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    logger.info(f"Dashboard accessed by user: {current_user.email}")
    
    if not current_user:
        logger.warning("Unauthorized access attempt to dashboard")
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        today = datetime.now().date()
        current_time = datetime.now()
        first_day_of_month = today.replace(day=1)
        last_month_start = (first_day_of_month - timedelta(days=1)).replace(day=1)
        seven_days_ago = today - timedelta(days=7)
        thirty_days_ago = today - timedelta(days=30)
        payment_types = [TransactionType.BOOKING_PAYMENT, TransactionType.SLOT_PAYMENT]

        # Basic metrics
        bookings_this_month = await db.execute(
            select(func.count(Booking.id)).filter(Booking.booking_date >= first_day_of_month)
        )
        bookings_this_month = bookings_this_month.scalar_one()

        upcoming_bookings = await db.execute(
            select(func.count(Booking.id)).filter(Booking.booking_date >= today)
        )
        upcoming_bookings = upcoming_bookings.scalar_one()

        # Revenue metrics
        revenue_this_month = await db.execute(
            select(func.sum(Transaction.amount))
            .filter(
                Transaction.created_at >= first_day_of_month,
                Transaction.transaction_type.in_(payment_types)
            )
        )
        revenue_this_month = revenue_this_month.scalar_one() or 0

        revenue_last_month = await db.execute(
            select(func.sum(Transaction.amount))
            .filter(
                Transaction.created_at >= last_month_start,
                Transaction.created_at < first_day_of_month,
                Transaction.transaction_type.in_(payment_types)
            )
        )
        revenue_last_month = revenue_last_month.scalar_one() or 0

        revenue_change = ((revenue_this_month - revenue_last_month) / revenue_last_month * 100) if revenue_last_month else 100

        # New enhanced metrics
        total_bookings = await db.execute(select(func.count(Booking.id)))
        total_bookings = total_bookings.scalar_one()

        total_revenue = await db.execute(
            select(func.sum(Transaction.amount))
            .filter(Transaction.transaction_type.in_(payment_types))
        )
        total_revenue = total_revenue.scalar_one() or 0

        bookings_last_week = await db.execute(
            select(func.count(Booking.id)).filter(Booking.booking_date >= seven_days_ago)
        )
        bookings_last_week = bookings_last_week.scalar_one()

        revenue_last_30_days = await db.execute(
            select(func.sum(Transaction.amount))
            .filter(
                Transaction.created_at >= thirty_days_ago,
                Transaction.transaction_type.in_(payment_types)
            )
        )
        revenue_last_30_days = revenue_last_30_days.scalar_one() or 0

        # Today's bookings
        todays_bookings = await db.execute(
            select(func.count(Booking.id)).filter(Booking.booking_date == today)
        )
        todays_bookings = todays_bookings.scalar_one()

        # Most popular time slots (last 30 days)
        popular_slots = await db.execute(
            select(Booking.time_slot, func.count(Booking.id).label('count'))
            .filter(Booking.booking_date >= thirty_days_ago)
            .group_by(Booking.time_slot)
            .order_by(func.count(Booking.id).desc())
            .limit(5)
        )
        popular_slots_data = [{"time_slot": row[0], "count": row[1]} for row in popular_slots]

        # Revenue by payment method (last 30 days)
        payment_breakdown = await db.execute(
            select(Transaction.payment_method, func.sum(Transaction.amount))
            .filter(
                Transaction.created_at >= thirty_days_ago,
                Transaction.transaction_type.in_(payment_types)
            )
            .group_by(Transaction.payment_method)
        )
        payment_data = [
            {"method": row[0].value, "amount": float(row[1])}
            for row in payment_breakdown
            if row[0] is not None
        ]

        # Daily revenue for last 30 days (OPTIMIZED: single query with GROUP BY)
        daily_revenue_result = await db.execute(
            select(
                func.date(Transaction.created_at).label('date'),
                func.sum(Transaction.amount).label('revenue')
            )
            .filter(
                Transaction.created_at >= thirty_days_ago,
                Transaction.transaction_type.in_(payment_types)
            )
            .group_by(func.date(Transaction.created_at))
        )
        daily_revenue_map = {str(row[0]): float(row[1]) for row in daily_revenue_result}

        # Build the daily revenue list with all 30 days (fill gaps with 0)
        daily_revenue = []
        for i in range(30):
            day = today - timedelta(days=29-i)
            day_str = day.isoformat()
            daily_revenue.append({"date": day_str, "revenue": daily_revenue_map.get(day_str, 0)})

        # Daily bookings for last 30 days (OPTIMIZED: single query with GROUP BY)
        daily_bookings_result = await db.execute(
            select(
                Booking.booking_date,
                func.count(Booking.id).label('count')
            )
            .filter(Booking.booking_date >= thirty_days_ago)
            .group_by(Booking.booking_date)
        )
        daily_bookings_map = {str(row[0]): row[1] for row in daily_bookings_result}

        # Build the daily bookings list with all 30 days (fill gaps with 0)
        daily_bookings = []
        for i in range(30):
            day = today - timedelta(days=29-i)
            day_str = day.isoformat()
            daily_bookings.append({"date": day_str, "bookings": daily_bookings_map.get(day_str, 0)})

        # Recent bookings (last 5)
        recent_bookings = await db.execute(
            select(Booking.name, Booking.booking_date, Booking.time_slot, Booking.created_at)
            .order_by(Booking.created_at.desc())
            .limit(5)
        )
        recent_bookings_data = [{
            "name": row[0], 
            "booking_date": row[1].isoformat(), 
            "time_slot": row[2], 
            "created_at": row[3].isoformat()
        } for row in recent_bookings]

        # Pending vs completed transactions
        pending_transactions = await db.execute(
            select(func.count(TransactionSummary.booking_id))
            .filter(TransactionSummary.status == TransactionStatus.PENDING)
        )
        pending_transactions = pending_transactions.scalar_one()

        completed_transactions = await db.execute(
            select(func.count(TransactionSummary.booking_id))
            .filter(TransactionSummary.status == TransactionStatus.SUCCESSFUL)
        )
        completed_transactions = completed_transactions.scalar_one()

        # Average booking value
        avg_booking_value = revenue_this_month / bookings_this_month if bookings_this_month > 0 else 0

        days_this_month = (today - first_day_of_month).days + 1
        avg_bookings_per_day = bookings_this_month / days_this_month if days_this_month > 0 else 0
        
        logger.info("Enhanced dashboard data successfully retrieved")
        return {
            # Basic metrics
            "bookings_this_month": bookings_this_month,
            "upcoming_bookings": upcoming_bookings,
            "revenue_this_month": float(revenue_this_month),
            "revenue_change": float(revenue_change),
            "avg_bookings_per_day": float(avg_bookings_per_day),
            
            # Enhanced metrics
            "total_bookings": total_bookings,
            "total_revenue": float(total_revenue),
            "bookings_last_week": bookings_last_week,
            "revenue_last_30_days": float(revenue_last_30_days),
            "todays_bookings": todays_bookings,
            "avg_booking_value": float(avg_booking_value),
            "pending_transactions": pending_transactions,
            "completed_transactions": completed_transactions,
            
            # Chart data
            "daily_revenue": daily_revenue,
            "daily_bookings": daily_bookings,
            "popular_time_slots": popular_slots_data,
            "payment_breakdown": payment_data,
            "recent_bookings": recent_bookings_data
        }
    except Exception as e:
        logger.error(f"Error retrieving dashboard data: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")




'''
--------------------
BOOKING ROUTE
--------------------
'''



@router.post("/api/add_booking", response_class=JSONResponse)
async def book(
    request: Request,
    name: str = Form(...),
    phone: str = Form(...),
    booking_date: str = Form(...),
    time_slot: str = Form(...),
    booking_type: str = Form("NORMAL"),  # NORMAL or ACADEMY
    academy_start_date: str = Form(None),  # For academy bookings
    academy_end_date: str = Form(None),    # For academy bookings
    academy_days_of_week: str = Form(None),  # Comma-separated days (e.g., "MONDAY,FRIDAY")
    academy_notes: str = Form(None),       # Optional notes for academy
    start_date: str = Form(None),  # For date range display
    end_date: str = Form(None),    # For date range display
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        booking_date_parsed = datetime.strptime(booking_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")

    try:
        # Parse booking type
        try:
            booking_type_enum = BookingType[booking_type]
        except KeyError:
            return JSONResponse(content={
                "success": False,
                "message": f"Invalid booking type: {booking_type}"
            }, status_code=400)

        # Handle Academy booking
        if booking_type_enum == BookingType.ACADEMY:
            if not academy_start_date or not academy_end_date:
                return JSONResponse(content={
                    "success": False,
                    "message": "Academy bookings require start and end dates"
                }, status_code=400)

            try:
                academy_start = datetime.strptime(academy_start_date, "%Y-%m-%d").date()
                academy_end = datetime.strptime(academy_end_date, "%Y-%m-%d").date()
            except ValueError:
                return JSONResponse(content={
                    "success": False,
                    "message": "Invalid academy date format. Use YYYY-MM-DD."
                }, status_code=400)

            # Check for conflicts
            has_conflict, conflicts = await check_academy_booking_conflicts(
                db, time_slot, academy_start, academy_end
            )

            if has_conflict:
                conflict_details = [
                    f"{c.name} ({c.booking_date if c.booking_type == BookingType.NORMAL else f'{c.academy_start_date} to {c.academy_end_date}'})"
                    for c in conflicts
                ]
                return JSONResponse(content={
                    "success": False,
                    "message": f"Conflict with existing bookings: {', '.join(conflict_details[:3])}"
                }, status_code=409)

            # Calculate price and days
            total_price, price_per_day, days_count = await calculate_academy_price(
                db, time_slot, academy_start, academy_end, academy_days_of_week
            )

            # Create academy booking
            booking = Booking(
                booked_by=current_user.id,
                name=name,
                phone=phone,
                booking_date=academy_start,  # Store the start date as booking_date
                time_slot=time_slot,
                booking_type=BookingType.ACADEMY,
                academy_start_date=academy_start,
                academy_end_date=academy_end,
                academy_month_days=days_count,
                academy_days_of_week=academy_days_of_week,  # Store selected days of week
                academy_notes=academy_notes,
                last_modified_by=current_user.id
            )
            db.add(booking)
            await db.flush()  # Get the booking ID

            # Create transaction summary for academy booking
            summary = TransactionSummary(
                booking_id=booking.id,
                total_price=total_price,
                total_paid=0,
                leftover=total_price,
                status=TransactionStatus.PENDING
            )
            db.add(summary)
            await db.commit()

            message = f"Academy slot booked successfully for {days_count} days (₹{total_price:.2f})"

        # Handle Normal booking (including bulk normal bookings)
        else:
            # Check if this is a bulk booking (has start and end dates)
            if academy_start_date and academy_end_date:
                # Bulk normal booking - create multiple bookings
                try:
                    bulk_start = datetime.strptime(academy_start_date, "%Y-%m-%d").date()
                    bulk_end = datetime.strptime(academy_end_date, "%Y-%m-%d").date()
                except ValueError:
                    return JSONResponse(content={
                        "success": False,
                        "message": "Invalid date format. Use YYYY-MM-DD."
                    }, status_code=400)

                # Parse selected days of week
                selected_days = None
                if academy_days_of_week:
                    selected_days = [day.strip().upper() for day in academy_days_of_week.split(',')]

                # Collect dates that match the criteria
                dates_to_book = []
                current_date = bulk_start
                while current_date <= bulk_end:
                    day_name = current_date.strftime('%A').upper()
                    # Only include dates that match the selected days of week
                    if not selected_days or day_name in selected_days:
                        dates_to_book.append(current_date)
                    current_date += timedelta(days=1)

                if not dates_to_book:
                    return JSONResponse(content={
                        "success": False,
                        "message": "No matching days found in the selected period"
                    }, status_code=400)

                # Check for conflicts on all dates
                conflicts = []
                for date_to_check in dates_to_book:
                    # Check if slot is already booked on this date
                    existing_booking_result = await db.execute(
                        select(Booking).filter(
                            Booking.booking_date == date_to_check,
                            Booking.time_slot == time_slot
                        )
                    )
                    existing_booking = existing_booking_result.scalar_one_or_none()
                    if existing_booking:
                        conflicts.append(f"{date_to_check.isoformat()}")

                    # Check if there's an academy booking covering this slot
                    has_conflict, academy_conflicts = await check_academy_booking_conflicts(
                        db, time_slot, date_to_check, date_to_check
                    )
                    if has_conflict:
                        conflicts.append(f"{date_to_check.isoformat()} (academy)")

                if conflicts:
                    return JSONResponse(content={
                        "success": False,
                        "message": f"Conflict on dates: {', '.join(conflicts[:5])}"
                    }, status_code=409)

                # Create bookings for all dates
                for date_to_book in dates_to_book:
                    booking = Booking(
                        booked_by=current_user.id,
                        name=name,
                        phone=phone,
                        booking_date=date_to_book,
                        time_slot=time_slot,
                        booking_type=BookingType.NORMAL,
                        last_modified_by=current_user.id
                    )
                    db.add(booking)

                await db.commit()
                message = f"Successfully booked {len(dates_to_book)} slots"

            else:
                # Single normal booking
                # Check if slot is already booked
                existing_booking_result = await db.execute(
                    select(Booking).filter(
                        Booking.booking_date == booking_date_parsed,
                        Booking.time_slot == time_slot
                    )
                )
                existing_booking = existing_booking_result.scalar_one_or_none()

                if existing_booking:
                    return JSONResponse(content={
                        "success": False,
                        "message": "This slot is already booked"
                    })

                # Check if there's an academy booking covering this slot
                has_conflict, conflicts = await check_academy_booking_conflicts(
                    db, time_slot, booking_date_parsed, booking_date_parsed
                )

                if has_conflict:
                    return JSONResponse(content={
                        "success": False,
                        "message": "This slot is blocked by an academy booking"
                    }, status_code=409)

                # Create normal booking
                booking = Booking(
                    booked_by=current_user.id,
                    name=name,
                    phone=phone,
                    booking_date=booking_date_parsed,
                    time_slot=time_slot,
                    booking_type=BookingType.NORMAL,
                    last_modified_by=current_user.id
                )
                db.add(booking)
                await db.commit()
                message = "Slot has been successfully booked"

        # Determine date range for returning bookings
        fetch_start_date = None
        fetch_end_date = None
        
        # Use the provided date range if available
        if start_date and end_date:
            try:
                fetch_start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
                fetch_end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                # Fall back to default range
                today = datetime.now().date()
                fetch_start_date = today
                fetch_end_date = today + timedelta(days=6)
        else:
            # Default range centered on the booking date
            fetch_start_date = booking_date_parsed - timedelta(days=3)
            fetch_end_date = booking_date_parsed + timedelta(days=3)
        
        # Ensure the range doesn't exceed 3 months
        max_end_date = fetch_start_date + relativedelta(months=3)
        fetch_end_date = min(fetch_end_date, max_end_date)


        # Fetch updated bookings for the entire date range (including academy bookings that overlap)
        bookings_result = await db.execute(
            select(Booking)
            .options(joinedload(Booking.user))
            .filter(
                or_(
                    # Normal bookings within the date range
                    and_(
                        Booking.booking_type == BookingType.NORMAL,
                        Booking.booking_date.between(fetch_start_date, fetch_end_date)
                    ),
                    # Academy bookings that overlap with the date range
                    and_(
                        Booking.booking_type == BookingType.ACADEMY,
                        Booking.academy_start_date <= fetch_end_date,
                        Booking.academy_end_date >= fetch_start_date
                    )
                )
            )
            .order_by(Booking.booking_date, Booking.time_slot)
        )
        bookings = bookings_result.scalars().all()

        # Create bookingsData dictionary
        bookings_data = {}
        for b in bookings:
            # For academy bookings, create entries for all dates in the range
            if b.booking_type == BookingType.ACADEMY:
                # Parse selected days of week if available
                selected_days = None
                if b.academy_days_of_week:
                    selected_days = [day.strip().upper() for day in b.academy_days_of_week.split(',')]

                current_date = b.academy_start_date
                while current_date <= b.academy_end_date:
                    day_name = current_date.strftime('%A').upper()

                    # Only include dates that match the selected days of week
                    if not selected_days or day_name in selected_days:
                        key = f"{current_date.isoformat()}_{b.time_slot}"
                        bookings_data[key] = {
                            "id": b.id,
                            "name": b.name,
                            "phone": b.phone,
                            "booking_date": current_date.isoformat(),
                            "time_slot": b.time_slot,
                            "booking_type": b.booking_type.value,
                            "academy_start_date": b.academy_start_date.isoformat(),
                            "academy_end_date": b.academy_end_date.isoformat(),
                            "academy_days_of_week": b.academy_days_of_week,
                            "academy_notes": b.academy_notes,
                            "booked_by": b.user.username
                    }
                    current_date += timedelta(days=1)
            else:
                # Normal booking
                key = f"{b.booking_date.isoformat()}_{b.time_slot}"
                bookings_data[key] = {
                    "id": b.id,
                    "name": b.name,
                    "phone": b.phone,
                    "booking_date": b.booking_date.isoformat(),
                    "time_slot": b.time_slot,
                    "booking_type": b.booking_type.value,
                    "booked_by": b.user.username
                }

        return JSONResponse(content={
            "success": True,
            "message": message,
            "bookingsData": bookings_data
        })
    except Exception as e:
        print(f"Error in add_booking: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")



'''
--------------------
UPDATE BOOKING ROUTE
--------------------
'''

@router.post("/api/update_booking", response_class=JSONResponse)
async def update_booking(
    request: Request,
    booking_id: int = Form(...),
    name: str = Form(...),
    phone: str = Form(...),
    booking_date: str = Form(...),
    time_slot: str = Form(...),
    booking_type: str = Form("NORMAL"),  # NORMAL or ACADEMY
    academy_start_date: str = Form(None),  # For academy bookings
    academy_end_date: str = Form(None),    # For academy bookings
    academy_days_of_week: str = Form(None),  # Comma-separated days
    academy_notes: str = Form(None),       # Optional notes
    start_date: str = Form(None),  # For date range display
    end_date: str = Form(None),    # For date range display
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        booking_result = await db.execute(select(Booking).filter(Booking.id == booking_id))
        booking = booking_result.scalar_one_or_none()

        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")

        try:
            booking_type_enum = BookingType[booking_type]
        except KeyError:
            return JSONResponse(content={
                "success": False,
                "message": f"Invalid booking type: {booking_type}"
            }, status_code=400)

        # Store the old booking info for reference
        old_booking_date = booking.booking_date
        old_time_slot = booking.time_slot
        old_booking_type = booking.booking_type

        # Handle Academy booking update
        if booking_type_enum == BookingType.ACADEMY:
            if not academy_start_date or not academy_end_date:
                return JSONResponse(content={
                    "success": False,
                    "message": "Academy bookings require start and end dates"
                }, status_code=400)

            try:
                academy_start = datetime.strptime(academy_start_date, "%Y-%m-%d").date()
                academy_end = datetime.strptime(academy_end_date, "%Y-%m-%d").date()
            except ValueError:
                return JSONResponse(content={
                    "success": False,
                    "message": "Invalid academy date format. Use YYYY-MM-DD."
                }, status_code=400)

            # Check for conflicts (excluding this booking)
            has_conflict, conflicts = await check_academy_booking_conflicts(
                db, time_slot, academy_start, academy_end, exclude_booking_id=booking_id
            )

            if has_conflict:
                conflict_details = [
                    f"{c.name} ({c.booking_date if c.booking_type == BookingType.NORMAL else f'{c.academy_start_date} to {c.academy_end_date}'})"
                    for c in conflicts
                ]
                return JSONResponse(content={
                    "success": False,
                    "message": f"Conflict with existing bookings: {', '.join(conflict_details[:3])}"
                }, status_code=409)

            # Calculate price and days
            total_price, price_per_day, days_count = await calculate_academy_price(
                db, time_slot, academy_start, academy_end, academy_days_of_week
            )

            # Update academy booking fields
            booking.name = name
            booking.phone = phone
            booking.booking_date = academy_start
            booking.time_slot = time_slot
            booking.booking_type = BookingType.ACADEMY
            booking.academy_start_date = academy_start
            booking.academy_end_date = academy_end
            booking.academy_month_days = days_count
            booking.academy_days_of_week = academy_days_of_week
            booking.academy_notes = academy_notes
            booking.last_modified_by = current_user.id
            booking.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

            # Update transaction summary if it exists
            transaction_summary_result = await db.execute(
                select(TransactionSummary).filter(TransactionSummary.booking_id == booking_id)
            )
            transaction_summary = transaction_summary_result.scalar_one_or_none()

            if transaction_summary:
                transaction_summary.total_price = total_price
                transaction_summary.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        else:
            # Handle Normal booking update
            try:
                new_booking_date = datetime.strptime(booking_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")

            # Check if the new slot is already booked
            existing_booking_result = await db.execute(
                select(Booking).filter(
                    Booking.booking_date == new_booking_date,
                    Booking.time_slot == time_slot,
                    Booking.id != booking_id
                )
            )
            existing_booking = existing_booking_result.scalar_one_or_none()

            if existing_booking:
                return JSONResponse(content={
                    "success": False,
                    "message": "This slot is already booked. Please choose another."
                }, status_code=409)

            # Check for academy booking conflicts
            has_conflict, conflicts = await check_academy_booking_conflicts(
                db, time_slot, new_booking_date, new_booking_date, exclude_booking_id=booking_id
            )

            if has_conflict:
                return JSONResponse(content={
                    "success": False,
                    "message": "This slot is blocked by an academy booking"
                }, status_code=409)

            booking.name = name
            booking.phone = phone
            booking.booking_date = new_booking_date
            booking.time_slot = time_slot
            booking.booking_type = BookingType.NORMAL
            booking.academy_start_date = None
            booking.academy_end_date = None
            booking.academy_month_days = None
            booking.academy_days_of_week = None
            booking.academy_notes = None
            booking.last_modified_by = current_user.id
            booking.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

        await db.commit()

        # Use the provided date range if available
        fetch_start_date = None
        fetch_end_date = None

        if start_date and end_date:
            try:
                fetch_start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
                fetch_end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                # Fallback to default range
                today = datetime.now().date()
                fetch_start_date = today
                fetch_end_date = today + timedelta(days=6)
        else:
            # Default range based on old and new booking dates
            today = datetime.now().date()
            fetch_start_date = min(old_booking_date, new_booking_date, today)
            fetch_end_date = max(old_booking_date, new_booking_date) + timedelta(days=6)
        
        # Ensure the range doesn't exceed 3 months
        max_end_date = fetch_start_date + relativedelta(months=3)
        fetch_end_date = min(fetch_end_date, max_end_date)

        # Fetch bookings for the determined date range (both normal and academy bookings)
        bookings_result = await db.execute(
            select(Booking)
            .options(joinedload(Booking.user))
            .filter(
                or_(
                    # Normal bookings within the date range
                    and_(
                        Booking.booking_type == BookingType.NORMAL,
                        Booking.booking_date.between(fetch_start_date, fetch_end_date)
                    ),
                    # Academy bookings that overlap with the date range
                    and_(
                        Booking.booking_type == BookingType.ACADEMY,
                        Booking.academy_start_date <= fetch_end_date,
                        Booking.academy_end_date >= fetch_start_date
                    )
                )
            )
            .order_by(Booking.booking_date, Booking.time_slot)
        )
        bookings = bookings_result.scalars().all()

        # Create bookingsData dictionary
        bookings_data = {}
        for b in bookings:
            # For academy bookings, create entries for all dates in the range
            if b.booking_type == BookingType.ACADEMY:
                # Parse selected days of week if available
                selected_days = None
                if b.academy_days_of_week:
                    selected_days = [day.strip().upper() for day in b.academy_days_of_week.split(',')]

                current_date = b.academy_start_date
                while current_date <= b.academy_end_date:
                    day_name = current_date.strftime('%A').upper()

                    # Only include dates that match the selected days of week
                    if not selected_days or day_name in selected_days:
                        key = f"{current_date.isoformat()}_{b.time_slot}"
                        bookings_data[key] = {
                            "id": b.id,
                            "name": b.name,
                            "phone": b.phone,
                            "booking_date": current_date.isoformat(),
                            "time_slot": b.time_slot,
                            "booking_type": b.booking_type.value,
                            "academy_start_date": b.academy_start_date.isoformat(),
                            "academy_end_date": b.academy_end_date.isoformat(),
                            "academy_days_of_week": b.academy_days_of_week,
                            "academy_notes": b.academy_notes,
                            "booked_by": b.user.username
                    }
                    current_date += timedelta(days=1)
            else:
                # Normal booking
                key = f"{b.booking_date.isoformat()}_{b.time_slot}"
                bookings_data[key] = {
                    "id": b.id,
                    "name": b.name,
                    "phone": b.phone,
                    "booking_date": b.booking_date.isoformat(),
                    "time_slot": b.time_slot,
                    "booking_type": b.booking_type.value,
                    "booked_by": b.user.username
                }

        return JSONResponse(content={
            "success": True,
            "message": "Booking updated successfully",
            "bookingsData": bookings_data
        })

    except HTTPException as http_exc:
        return JSONResponse(status_code=http_exc.status_code, content={"success": False, "message": http_exc.detail})
    except SQLAlchemyError as db_exc:
        print(f"Database error in update_booking: {str(db_exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": "Database error occurred"})
    except Exception as exc:
        print(f"Unexpected error in update_booking: {str(exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": "An unexpected error occurred"})



'''
--------------------
DELETE BOOKING ROUTE
--------------------
'''

@router.delete("/api/delete_booking/{booking_id}", response_class=JSONResponse)
async def delete_booking(
    booking_id: int,
    start_date: str = Query(None),
    end_date: str = Query(None),
    retain_payments: bool = Query(True),  # New parameter to control soft vs hard delete
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        booking_result = await db.execute(select(Booking).filter(Booking.id == booking_id))
        booking = booking_result.scalar_one_or_none()

        if not booking:
            return JSONResponse(content={
                "success": False,
                "message": "Booking not found"
            }, status_code=404)

        # Store booking info before deletion for fetching updated bookings
        booking_date = booking.booking_date
        booking_type = booking.booking_type
        academy_start_date = booking.academy_start_date if booking_type == BookingType.ACADEMY else None
        academy_end_date = booking.academy_end_date if booking_type == BookingType.ACADEMY else None

        # Check if booking has transactions
        transactions_result = await db.execute(
            select(Transaction).filter(Transaction.booking_id == booking_id)
        )
        transactions = transactions_result.scalars().all()
        has_transactions = len(transactions) > 0

        if has_transactions and retain_payments:
            # Soft delete: Mark booking as cancelled but retain transactions
            booking.is_cancelled = True
            booking.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
            booking.last_modified_by = current_user.id
            await db.commit()
            message = "Booking cancelled. Payment records retained for accounting."
        else:
            # Hard delete: Remove everything
            # Delete related transaction summary first (if exists)
            transaction_summary_result = await db.execute(
                select(TransactionSummary).filter(TransactionSummary.booking_id == booking_id)
            )
            transaction_summary = transaction_summary_result.scalar_one_or_none()
            if transaction_summary:
                await db.delete(transaction_summary)

            # Delete related transactions
            for transaction in transactions:
                await db.delete(transaction)

            # Delete the booking
            await db.delete(booking)
            await db.commit()
            message = "Booking deleted successfully"

        # Handle date range for fetching updated bookings
        fetch_start_date = None
        fetch_end_date = None
        
        # Use provided date range if available
        if start_date and end_date:
            try:
                fetch_start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
                fetch_end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            except ValueError:
                # If there's a problem with the date format, use sensible defaults
                today = datetime.now().date()
                fetch_start_date = today
                fetch_end_date = today + timedelta(days=6)
        else:
            # Use sensible defaults centered around the deleted booking date
            fetch_start_date = booking_date - timedelta(days=3)
            fetch_end_date = booking_date + timedelta(days=3)
        
        # Ensure the range doesn't exceed 3 months
        max_end_date = fetch_start_date + relativedelta(months=3)
        fetch_end_date = min(fetch_end_date, max_end_date)

        # Fetch bookings for the selected date range (both normal and academy bookings)
        # IMPORTANT: Filter out cancelled bookings
        bookings_result = await db.execute(
            select(Booking)
            .options(joinedload(Booking.user))
            .filter(
                Booking.is_cancelled == False,  # Exclude cancelled bookings
                or_(
                    # Normal bookings within the date range
                    and_(
                        Booking.booking_type == BookingType.NORMAL,
                        Booking.booking_date.between(fetch_start_date, fetch_end_date)
                    ),
                    # Academy bookings that overlap with the date range
                    and_(
                        Booking.booking_type == BookingType.ACADEMY,
                        Booking.academy_start_date <= fetch_end_date,
                        Booking.academy_end_date >= fetch_start_date
                    )
                )
            )
            .order_by(Booking.booking_date, Booking.time_slot)
        )
        bookings = bookings_result.scalars().all()

        # Create updated bookingsData dictionary
        bookings_data = {}
        for b in bookings:
            # For academy bookings, create entries for all dates in the range
            if b.booking_type == BookingType.ACADEMY:
                # Parse selected days of week if available
                selected_days = None
                if b.academy_days_of_week:
                    selected_days = [day.strip().upper() for day in b.academy_days_of_week.split(',')]

                current_date = b.academy_start_date
                while current_date <= b.academy_end_date:
                    # Only show dates within the requested range
                    if fetch_start_date <= current_date <= fetch_end_date:
                        day_name = current_date.strftime('%A').upper()

                        # Only include dates that match the selected days of week
                        if not selected_days or day_name in selected_days:
                            key = f"{current_date.isoformat()}_{b.time_slot}"
                            bookings_data[key] = {
                                "id": b.id,
                                "name": b.name,
                                "phone": b.phone,
                                "booking_date": current_date.isoformat(),
                                "time_slot": b.time_slot,
                                "booking_type": b.booking_type.value,
                                "academy_start_date": b.academy_start_date.isoformat(),
                                "academy_end_date": b.academy_end_date.isoformat(),
                                "academy_days_of_week": b.academy_days_of_week,
                                "academy_notes": b.academy_notes,
                                "booked_by": b.user.username
                            }
                    current_date += timedelta(days=1)
            else:
                # Normal booking
                key = f"{b.booking_date.isoformat()}_{b.time_slot}"
                bookings_data[key] = {
                    "id": b.id,
                    "name": b.name,
                    "phone": b.phone,
                    "booking_date": b.booking_date.isoformat(),
                    "time_slot": b.time_slot,
                    "booking_type": b.booking_type.value,
                    "booked_by": b.user.username
                }

        return JSONResponse(content={
            "success": True,
            "message": message,
            "bookingsData": bookings_data,
            "was_soft_deleted": has_transactions and retain_payments
        })
    except Exception as e:
        print(f"Error in delete_booking: {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"An error occurred: {str(e)}"
        })

'''
--------------------
BOOKINGS MATRIX ROUTE
--------------------
'''


@router.get("/api/bookings")
async def bookings(
    request: Request,
    start_date: str = None,
    end_date: str = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not current_user:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    today = datetime.now().date()

    if start_date:
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    else:
        start_date = today

    if end_date:
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
    else:
        end_date = start_date + timedelta(days=6)

    # Ensure the range doesn't exceed 3 months
    max_end_date = start_date + relativedelta(months=3)
    end_date = min(end_date, max_end_date)

    # Query for both normal bookings and academy bookings that overlap with the date range
    # Exclude cancelled bookings from the matrix view
    bookings_result = await db.execute(
        select(Booking)
        .options(joinedload(Booking.user))
        .filter(
            or_(Booking.is_cancelled == False, Booking.is_cancelled == None),  # Exclude cancelled bookings
            or_(
                # Normal bookings within the date range
                and_(
                    Booking.booking_type == BookingType.NORMAL,
                    Booking.booking_date.between(start_date, end_date)
                ),
                # Academy bookings that overlap with the date range
                and_(
                    Booking.booking_type == BookingType.ACADEMY,
                    Booking.academy_start_date <= end_date,
                    Booking.academy_end_date >= start_date
                )
            )
        )
        .order_by(Booking.booking_date, Booking.time_slot)
    )
    bookings = bookings_result.scalars().all()

    bookings_data = {}
    for b in bookings:
        # For academy bookings, create entries for all dates in the range
        if b.booking_type == BookingType.ACADEMY:
            # Parse selected days of week if available
            selected_days = None
            if b.academy_days_of_week:
                selected_days = [day.strip().upper() for day in b.academy_days_of_week.split(',')]

            current_date = b.academy_start_date
            while current_date <= b.academy_end_date:
                # Only show dates within the requested range
                if start_date <= current_date <= end_date:
                    day_name = current_date.strftime('%A').upper()

                    # Only include dates that match the selected days of week
                    if not selected_days or day_name in selected_days:
                        key = f"{current_date.isoformat()}_{b.time_slot}"
                        bookings_data[key] = {
                            "id": b.id,
                            "name": b.name,
                            "phone": b.phone,
                            "booking_date": current_date.isoformat(),
                            "time_slot": b.time_slot,
                            "booking_type": b.booking_type.value,
                            "academy_start_date": b.academy_start_date.isoformat(),
                            "academy_end_date": b.academy_end_date.isoformat(),
                            "academy_days_of_week": b.academy_days_of_week,
                            "academy_notes": b.academy_notes,
                            "booked_by": b.user.username
                        }
                current_date += timedelta(days=1)
        else:
            # Normal booking
            key = f"{b.booking_date.isoformat()}_{b.time_slot}"
            bookings_data[key] = {
                "id": b.id,
                "name": b.name,
                "phone": b.phone,
                "booking_date": b.booking_date.isoformat(),
                "time_slot": b.time_slot,
                "booking_type": b.booking_type.value,
                "booked_by": b.user.username
            }

    return JSONResponse(content={"bookingsData": bookings_data})





'''
--------------------
SLOT PRICE ROUTE
--------------------
'''

@router.get("/slot_prices", response_class=HTMLResponse)
async def slot_prices_page(request: Request, current_user: User = Depends(get_current_user)):
    if not current_user:
        return RedirectResponse(url="/login", status_code=303)
    return templates.TemplateResponse("slot_prices.html", {"request": request, "current_user": current_user})

@router.get("/list_slot_prices", response_class=JSONResponse)
async def list_slot_prices(db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(select(SlotPrice))
        slot_prices = result.scalars().all()
        return JSONResponse(content={
            "success": True,
            "slot_prices": [{
                "id": sp.id,
                "time_slot": sp.time_slot,
                "day_of_week": sp.day_of_week.value,
                "price": sp.price,
                "start_date": sp.start_date.isoformat() if sp.start_date else None,
                "end_date": sp.end_date.isoformat() if sp.end_date else None,
                "is_default": sp.is_default
            } for sp in slot_prices]
        })
    except Exception as exc:
        logging.error(f"Error fetching slot prices: {str(exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Error fetching slot prices: {str(exc)}"})

@router.get("/available_time_slots", response_class=JSONResponse)
async def get_available_time_slots(db: AsyncSession = Depends(get_db)):
    try:
        # Canonical time slot order (chronological)
        SLOT_ORDER = [
            "9:30 AM - 11:00 AM",
            "11:00 AM - 12:30 PM",
            "12:30 PM - 2:00 PM",
            "3:00 PM - 4:30 PM",
            "4:30 PM - 6:00 PM",
            "6:00 PM - 7:30 PM",
            "7:30 PM - 9:00 PM",
            "9:00 PM - 10:30 PM"
        ]

        # Get all unique time slots from the slot_prices table
        result = await db.execute(
            select(SlotPrice.time_slot).distinct()
        )
        db_time_slots = [row[0] for row in result.fetchall()]

        # Sort by canonical order, putting any unknown slots at the end
        time_slots = sorted(
            db_time_slots,
            key=lambda x: SLOT_ORDER.index(x) if x in SLOT_ORDER else 999
        )

        return JSONResponse(content={
            "success": True,
            "time_slots": time_slots
        })
    except Exception as exc:
        logging.error(f"Error fetching available time slots: {str(exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Error fetching available time slots: {str(exc)}"})


@router.get("/current_slot_prices", response_class=JSONResponse)
async def get_current_slot_prices(db: AsyncSession = Depends(get_db)):
    try:
        slot_order = [
            "9:30 AM - 11:00 AM",
            "11:00 AM - 12:30 PM",
            "12:30 PM - 2:00 PM",
            "3:00 PM - 4:30 PM",
            "4:30 PM - 6:00 PM",
            "6:00 PM - 7:30 PM",
            "7:30 PM - 9:00 PM",
            "9:00 PM - 10:30 PM"
        ]
        day_order = [
            DayOfWeek.MONDAY,
            DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY,
            DayOfWeek.SATURDAY,
            DayOfWeek.SUNDAY
        ]

        def is_day_slot(slot: str) -> bool:
            start_time = slot.split(" - ")[0].strip()
            parts = start_time.split(" ")
            if len(parts) != 2:
                return False
            time_part, am_pm = parts
            hour = int(time_part.split(":")[0])
            if am_pm == "AM":
                return True
            if am_pm == "PM" and hour == 12:
                return True
            if am_pm == "PM" and hour < 6:
                return True
            return False

        all_prices_result = await db.execute(select(SlotPrice))
        all_prices = all_prices_result.scalars().all()

        distinct_slots = sorted(
            list({sp.time_slot for sp in all_prices}),
            key=lambda x: slot_order.index(x) if x in slot_order else 999
        )
        day_slots = [slot for slot in distinct_slots if is_day_slot(slot)]
        night_slots = [slot for slot in distinct_slots if not is_day_slot(slot)]
        today = datetime.now().date()

        def pick_effective(prices: list[SlotPrice]) -> tuple[SlotPrice | None, str]:
            if not prices:
                return None, "NONE"

            active_temporary = [
                sp for sp in prices
                if (not sp.is_default)
                and sp.start_date is not None
                and sp.end_date is not None
                and sp.start_date <= today <= sp.end_date
            ]
            if active_temporary:
                selected = sorted(active_temporary, key=lambda sp: sp.start_date or today)[-1]
                return selected, "ACTIVE_TEMPORARY"

            default_rows = [sp for sp in prices if sp.is_default]
            clean_defaults = [sp for sp in default_rows if sp.start_date is None and sp.end_date is None]
            if clean_defaults:
                return clean_defaults[0], "DEFAULT"
            if default_rows:
                return default_rows[0], "DEFAULT"

            selected = sorted(prices, key=lambda sp: sp.start_date or today)[-1]
            return selected, "FALLBACK"

        effective_prices = []
        for slot in distinct_slots:
            for day in day_order:
                candidates = [
                    sp for sp in all_prices
                    if sp.time_slot == slot and sp.day_of_week == day
                ]
                selected, source = pick_effective(candidates)
                effective_prices.append({
                    "time_slot": slot,
                    "day_of_week": day.name,
                    "price": selected.price if selected else None,
                    "source": source,
                    "entry_id": selected.id if selected else None,
                    "is_default": selected.is_default if selected else None,
                    "start_date": selected.start_date.isoformat() if selected and selected.start_date else None,
                    "end_date": selected.end_date.isoformat() if selected and selected.end_date else None,
                    "candidate_count": len(candidates)
                })

        return JSONResponse(content={
            "success": True,
            "day_slots": day_slots,
            "night_slots": night_slots,
            "prices": effective_prices
        })
    except Exception as exc:
        logging.error(f"Error fetching current slot prices: {str(exc)}")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"Error fetching current slot prices: {str(exc)}"
        })


@router.post("/add_update_slot_price", response_class=JSONResponse)
async def add_update_slot_price(
    time_slot: str = Form(...),
    day_of_week: str = Form(...),
    price: float = Form(...),
    start_date: str = Form(None),
    end_date: str = Form(None),
    is_default: bool = Form(True),
    db: AsyncSession = Depends(get_db)
):
    try:
        # Normalize day_of_week to enum (accept name or value)
        try:
            day_key = day_of_week.strip().upper()
            if day_key in DayOfWeek.__members__:
                day_enum = DayOfWeek[day_key]
            else:
                day_enum = next(
                    d for d in DayOfWeek
                    if d.value.lower() == day_of_week.strip().lower()
                )
        except Exception:
            return JSONResponse(status_code=400, content={
                "success": False,
                "message": f"Invalid day_of_week: {day_of_week}"
            })

        start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else None
        end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else None

        # Fetch all matching rows (there can be multiple due to temporary pricing)
        existing_slot_prices_result = await db.execute(
            select(SlotPrice)
            .filter(
                SlotPrice.time_slot == time_slot,
                SlotPrice.day_of_week == day_enum
            )
        )
        existing_slot_prices = existing_slot_prices_result.scalars().all()

        # Pick the most appropriate row to update
        existing_slot_price = None
        if is_default:
            # Prefer a default row with no date range
            for sp in existing_slot_prices:
                if sp.is_default and sp.start_date is None and sp.end_date is None:
                    existing_slot_price = sp
                    break
            # If no clean default exists, fall back to any default row
            if not existing_slot_price:
                existing_slot_price = next((sp for sp in existing_slot_prices if sp.is_default), None)
        else:
            # Temporary pricing should match the same date range
            for sp in existing_slot_prices:
                if sp.start_date == start_date_obj and sp.end_date == end_date_obj and not sp.is_default:
                    existing_slot_price = sp
                    break

        if existing_slot_price:
            # Update existing slot price
            existing_slot_price.price = price
            existing_slot_price.start_date = start_date_obj
            existing_slot_price.end_date = end_date_obj
            existing_slot_price.is_default = is_default
        else:
            # Create new slot price
            new_slot_price = SlotPrice(
                time_slot=time_slot,
                day_of_week=day_enum,
                price=price,
                start_date=start_date_obj,
                end_date=end_date_obj,
                is_default=is_default
            )
            db.add(new_slot_price)

        await db.commit()
        return JSONResponse(content={"success": True, "message": "Slot price added/updated successfully"})
    except Exception as exc:
        await db.rollback()
        logging.error(f"Error adding/updating slot price: {str(exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Error adding/updating slot price: {str(exc)}"})

@router.delete("/delete_slot_price/{slot_price_id}", response_class=JSONResponse)
async def delete_slot_price(
    slot_price_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        if not current_user:
            return JSONResponse(status_code=401, content={"success": False, "message": "Not authenticated"})
        
        # Find the slot price to delete
        slot_price_result = await db.execute(
            select(SlotPrice).filter(SlotPrice.id == slot_price_id)
        )
        slot_price = slot_price_result.scalar_one_or_none()
        
        if not slot_price:
            return JSONResponse(status_code=404, content={"success": False, "message": "Slot price not found"})
        
        await db.delete(slot_price)
        await db.commit()
        
        return JSONResponse(content={"success": True, "message": "Slot price deleted successfully"})
    except Exception as exc:
        await db.rollback()
        logging.error(f"Error deleting slot price: {str(exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Error deleting slot price: {str(exc)}"})


'''
--------------------
TRANSACTION ROUTE
--------------------
'''



@router.get("/bookings_for_date")
async def get_bookings_for_date(date: str, db: AsyncSession = Depends(get_db)):
    try:
        booking_date = datetime.strptime(date, "%Y-%m-%d").date()
        bookings = await db.execute(
            select(Booking)
            .filter(Booking.booking_date == booking_date)
            .order_by(Booking.time_slot)
        )
        return [
            {
                "id": b.id,
                "name": b.name,
                "time_slot": b.time_slot,
            } for b in bookings.scalars()
        ]
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/transactions_list")
async def get_transactions(
    start_date: str = None,
    end_date: str = None,
    db: AsyncSession = Depends(get_db)
):
    try:
        query = select(Transaction).options(joinedload(Transaction.booking), joinedload(Transaction.creator))
        
        if start_date:
            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            query = query.filter(Transaction.created_at >= start_date)
        
        if end_date:
            end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            query = query.filter(Transaction.created_at <= end_date)
        
        query = query.order_by(Transaction.created_at.desc())
        
        transactions = await db.execute(query)
        
        result = [
            {
                "id": t.id,
                "booking_date": t.booking.booking_date.isoformat(),
                "time_slot": t.booking.time_slot,
                "transaction_type": t.transaction_type.value,
                "payment_method": t.payment_method.value if t.payment_method else None,
                "amount": t.amount,
                "creator": t.creator.username,
                "created_at": t.created_at.isoformat()
            } for t in transactions.scalars()
        ]
        return JSONResponse(content={"success": True, "transactions": result})
    except SQLAlchemyError as e:
        logging.error(f"Database error in get_transactions: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Database error: {str(e)}"})
    except Exception as e:
        logging.error(f"Unexpected error in get_transactions: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Unexpected error: {str(e)}"})



@router.get("/transaction_summaries")
async def get_transaction_summaries(db: AsyncSession = Depends(get_db)):
    try:
        summaries = await db.execute(
            select(TransactionSummary)
            .options(joinedload(TransactionSummary.booking))
            .order_by(TransactionSummary.updated_at.desc())
            .limit(10)
        )
        
        result = []
        for summary in summaries.scalars():
            booking = summary.booking
            result.append({
                "booking_id": booking.id,  # Added this field
                "booking_date": booking.booking_date.isoformat(),
                "slot": booking.time_slot,
                "status": summary.status.value,
                "total_paid": summary.total_paid,
                "leftover": summary.leftover,
                "booking_payment": summary.booking_payment,
                "slot_payment": summary.slot_payment,
                "cash_payment": summary.cash_payment,
                "bkash_payment": summary.bkash_payment,
                "last_payment_date": summary.updated_at.date().isoformat(),
                "booking_payment_date": summary.booking_payment_date.isoformat() if summary.booking_payment_date else None,
            })
        
        return JSONResponse(content={"success": True, "summaries": result})
    except SQLAlchemyError as e:
        logging.error(f"Database error in get_transaction_summaries: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Database error: {str(e)}"})
    except Exception as e:
        logging.error(f"Unexpected error in get_transaction_summaries: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Unexpected error: {str(e)}"})



@router.get("/transaction_details")
async def get_transaction_details(
    booking_id: int,
    db: AsyncSession = Depends(get_db)
):
    try:
        transactions = await db.execute(
            select(Transaction)
            .options(joinedload(Transaction.booking),
                      joinedload(Transaction.creator),
                      joinedload(Transaction.updater)  # This relationship already exists in your model
            )
            .filter(Transaction.booking_id == booking_id)
            .order_by(Transaction.created_at.desc())
        )
        transactions = transactions.scalars().all()

        if not transactions:
            return JSONResponse(status_code=404, content={
                "success": False, 
                "message": "No transactions found for this booking"
            })

        return JSONResponse(content={
            "success": True,
            "transactions": [{
                "id": t.id,
                "booking_id": t.booking_id,
                "transaction_type": t.transaction_type.value,
                "payment_method": t.payment_method.value if t.payment_method else None,
                "amount": t.amount,
                "created_by": t.creator.username,
                "created_at": t.created_at.isoformat(),
                "updated_by": t.updater.username if t.updater else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None
            } for t in transactions]
        })
    except Exception as exc:
        logging.error(f"Unexpected error in get_transaction_details: {str(exc)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Unexpected error: {str(exc)}"}
        )



@router.post("/add_transaction")
async def add_transaction(
    booking_id: int = Form(...),
    transaction_type: str = Form(...),
    payment_method: str = Form(None),
    amount: float = Form(...),
    created_at: str = Form(...), 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        # Use UTC timestamp for created_at
        created_at = datetime.now(timezone.utc)
        booking = await db.get(Booking, booking_id)
        if not booking:
            return JSONResponse(status_code=404, content={"success": False, "message": "Booking not found"})

    # Get the slot price for this booking
        slot_price_result = await db.execute(
            select(SlotPrice)
            .filter(
                SlotPrice.time_slot == booking.time_slot,
                SlotPrice.day_of_week == DayOfWeek[booking.booking_date.strftime('%A').upper()],
                or_(
                    and_(
                        SlotPrice.start_date <= booking.booking_date,
                        SlotPrice.end_date >= booking.booking_date
                    ),
                    and_(
                        SlotPrice.start_date == None,
                        SlotPrice.end_date == None
                    )
                )
            )
            .order_by(SlotPrice.is_default.desc())
        )
        slot_prices = slot_price_result.scalars().all()

        if not slot_prices:
            return JSONResponse(status_code=404, content={
                "success": False, 
                "message": f"Slot price not found for booking (ID: {booking_id}, Date: {booking.booking_date}, Time: {booking.time_slot})"
            })

        # Use the first (most specific) slot price
        slot_price = slot_prices[0]

        try:
            transaction_type_enum = TransactionType[transaction_type]
        except (KeyError, ValueError):
            return JSONResponse(status_code=400, content={
                "success": False,
                "message": f"Invalid transaction type: {transaction_type}"
            })

        payment_method_enum = None
        if payment_method:
            try:
                payment_method_enum = PaymentMethod[payment_method]
            except (KeyError, ValueError):
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "message": f"Invalid payment method: {payment_method}"
                })
        elif transaction_type_enum not in [TransactionType.DISCOUNT, TransactionType.OTHER_ADJUSTMENT]:
            return JSONResponse(status_code=400, content={
                "success": False,
                "message": "Payment method is required for this transaction type"
            })

        transaction = Transaction(
            booking_id=booking_id,
            transaction_type=transaction_type_enum,
            payment_method=payment_method_enum,
            amount=amount,
            created_by=current_user.id,
            created_at=created_at
        )
        db.add(transaction)
        await db.flush()

        summary = await db.get(TransactionSummary, booking_id)
        if not summary:
            summary = TransactionSummary(booking_id=booking_id, total_price=slot_price.price)
            db.add(summary)

        transactions = await db.execute(
            select(Transaction).filter(Transaction.booking_id == booking_id)
        )
        transactions = transactions.scalars().all()

        summary.total_paid = sum(t.amount for t in transactions if t.transaction_type in [TransactionType.BOOKING_PAYMENT, TransactionType.SLOT_PAYMENT])
        summary.discount = sum(t.amount for t in transactions if t.transaction_type == TransactionType.DISCOUNT)
        summary.other_adjustments = sum(t.amount for t in transactions if t.transaction_type == TransactionType.OTHER_ADJUSTMENT)
        summary.leftover = summary.total_price - summary.total_paid - summary.discount - summary.other_adjustments
        summary.booking_payment = sum(t.amount for t in transactions if t.transaction_type == TransactionType.BOOKING_PAYMENT)
        summary.slot_payment = sum(t.amount for t in transactions if t.transaction_type == TransactionType.SLOT_PAYMENT)
        summary.cash_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.CASH)
        summary.bkash_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.BKASH)
        
        if not summary.booking_payment_date and transaction.transaction_type == TransactionType.BOOKING_PAYMENT:
            summary.booking_payment_date = transaction.created_at.date()

        if summary.leftover <= 0:
            summary.status = TransactionStatus.SUCCESSFUL
        elif summary.total_paid > 0:
            summary.status = TransactionStatus.PARTIAL
        else:
            summary.status = TransactionStatus.PENDING

        await db.commit()
        return JSONResponse(content={"success": True, "message": "Transaction added successfully"})
    
    except SQLAlchemyError as db_exc:
        await db.rollback()
        logging.error(f"Database error in add_transaction: {str(db_exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Database error: {str(db_exc)}"})
    except Exception as exc:
        logging.error(f"Unexpected error in add_transaction: {str(exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Unexpected error: {str(exc)}"})




@router.post("/update_transaction")
async def update_transaction(
    transaction_id: int = Form(...),
    transaction_type: str = Form(None),
    payment_method: str = Form(None),
    amount: float = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a transaction with the given ID."""
    logging.info(f"Updating transaction {transaction_id}")
    logging.info(f"Transaction type: {transaction_type}")
    logging.info(f"Payment method: {payment_method}")
    logging.info(f"Amount: {amount}")
    
    try:
        # Get transaction
        transaction_result = await db.execute(
            select(Transaction).filter(Transaction.id == transaction_id)
        )
        transaction = transaction_result.scalar_one_or_none()

        if not transaction:
            logging.warning(f"Transaction {transaction_id} not found")
            return JSONResponse(status_code=404, content={
                "success": False,
                "message": "Transaction not found"
            })

        # Store original values before update
        original_amount = transaction.amount
        original_transaction_type = transaction.transaction_type
        original_payment_method = transaction.payment_method
        booking_id = transaction.booking_id

        # Update fields if provided
        new_transaction_type = None
        if transaction_type:
            try:
                new_transaction_type = TransactionType[transaction_type]
                transaction.transaction_type = new_transaction_type
                logging.info(f"Updated transaction type to {transaction_type}")
            except (KeyError, ValueError) as e:
                logging.error(f"Invalid transaction type: {transaction_type}")
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "message": f"Invalid transaction type: {transaction_type}"
                })
                
        if payment_method is not None:
            if payment_method == "" or payment_method.upper() == "NONE":
                effective_type = new_transaction_type or transaction.transaction_type
                if effective_type in [TransactionType.DISCOUNT, TransactionType.OTHER_ADJUSTMENT]:
                    transaction.payment_method = None
                    logging.info("Cleared payment method")
                else:
                    return JSONResponse(status_code=400, content={
                        "success": False,
                        "message": "Payment method is required for this transaction type"
                    })
            else:
                try:
                    transaction.payment_method = PaymentMethod[payment_method]
                    logging.info(f"Updated payment method to {payment_method}")
                except (KeyError, ValueError) as e:
                    logging.error(f"Invalid payment method: {payment_method}")
                    return JSONResponse(status_code=400, content={
                        "success": False,
                        "message": f"Invalid payment method: {payment_method}"
                    })
        elif new_transaction_type in [TransactionType.DISCOUNT, TransactionType.OTHER_ADJUSTMENT]:
            transaction.payment_method = None

        if amount is not None:
            transaction.amount = amount
            logging.info(f"Updated amount to {amount}")

        # Update the modifier information
        transaction.updated_by = current_user.id
        transaction.updated_at = datetime.now(timezone.utc)

        # Commit the transaction update
        await db.commit()
        logging.info(f"Transaction {transaction_id} updated successfully")
        
        # Now update the TransactionSummary
        summary = await db.get(TransactionSummary, booking_id)
        if summary:
            # Get all transactions for this booking
            transactions_result = await db.execute(
                select(Transaction).filter(Transaction.booking_id == booking_id)
            )
            transactions = transactions_result.scalars().all()
            
            # Recalculate summary fields
            summary.total_paid = sum(t.amount for t in transactions if t.transaction_type in [TransactionType.BOOKING_PAYMENT, TransactionType.SLOT_PAYMENT])
            summary.discount = sum(t.amount for t in transactions if t.transaction_type == TransactionType.DISCOUNT)
            summary.other_adjustments = sum(t.amount for t in transactions if t.transaction_type == TransactionType.OTHER_ADJUSTMENT)
            summary.leftover = summary.total_price - summary.total_paid - summary.discount - summary.other_adjustments
            summary.booking_payment = sum(t.amount for t in transactions if t.transaction_type == TransactionType.BOOKING_PAYMENT)
            summary.slot_payment = sum(t.amount for t in transactions if t.transaction_type == TransactionType.SLOT_PAYMENT)
            summary.cash_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.CASH)
            summary.bkash_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.BKASH)
            summary.nagad_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.NAGAD)
            summary.card_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.CARD)
            summary.bank_transfer_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.BANK_TRANSFER)

            # Update status based on payments
            if summary.leftover <= 0:
                summary.status = TransactionStatus.SUCCESSFUL
            elif summary.total_paid > 0:
                summary.status = TransactionStatus.PARTIAL
            else:
                summary.status = TransactionStatus.PENDING
                
            summary.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await db.commit()
            logging.info(f"Transaction summary for booking {booking_id} updated")

        # Get fresh data to return
        transaction_result = await db.execute(
            select(Transaction)
            .options(
                joinedload(Transaction.booking),
                joinedload(Transaction.creator),
                joinedload(Transaction.updater)
            )
            .filter(Transaction.id == transaction_id)
        )
        updated_transaction = transaction_result.scalar_one_or_none()

        # Return updated transaction with all relationships
        return JSONResponse(content={
            "success": True,
            "message": "Transaction updated successfully",
            "transaction": {
                "id": updated_transaction.id,
                "booking_id": updated_transaction.booking_id,
                "transaction_type": updated_transaction.transaction_type.value,
                "payment_method": updated_transaction.payment_method.value if updated_transaction.payment_method else None,
                "amount": updated_transaction.amount,
                "created_by": updated_transaction.creator.username if updated_transaction.creator else "Unknown",
                "created_at": updated_transaction.created_at.isoformat(),
                "updated_by": updated_transaction.updater.username if updated_transaction.updater else None,
                "updated_at": updated_transaction.updated_at.isoformat() if updated_transaction.updated_at else None
            }
        })

    except SQLAlchemyError as e:
        await db.rollback()
        logging.error(f"Database error in update_transaction: {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"Database error: {str(e)}"
        })
    except Exception as e:
        logging.error(f"Unexpected error in update_transaction: {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"Unexpected error: {str(e)}"
        })





@router.delete("/delete_transaction/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a transaction with the given ID and update the related summary."""
    logging.info(f"Deleting transaction {transaction_id}")
    try:
        # Get the transaction
        transaction_result = await db.execute(
            select(Transaction).filter(Transaction.id == transaction_id)
        )
        transaction = transaction_result.scalar_one_or_none()

        if not transaction:
            logging.warning(f"Transaction {transaction_id} not found for deletion")
            return JSONResponse(
                status_code=404,
                content={"success": False, "message": "Transaction not found"}
            )

        # Get the booking_id before deleting the transaction
        booking_id = transaction.booking_id

        # Delete the transaction
        await db.delete(transaction)
        await db.commit()
        logging.info(f"Transaction {transaction_id} deleted")

        # Update the transaction summary
        summary = await db.get(TransactionSummary, booking_id)
        if summary:
            # Get all remaining transactions for this booking
            transactions_result = await db.execute(
                select(Transaction).filter(Transaction.booking_id == booking_id)
            )
            transactions = transactions_result.scalars().all()

            # If no transactions left, delete the summary
            if not transactions:
                await db.delete(summary)
                await db.commit()
                logging.info(f"No transactions left for booking {booking_id}, deleted summary")
                return JSONResponse(content={
                    "success": True,
                    "message": "Transaction deleted and summary removed"
                })

            # Otherwise, recalculate summary fields
            summary.total_paid = sum(t.amount for t in transactions if t.transaction_type in [TransactionType.BOOKING_PAYMENT, TransactionType.SLOT_PAYMENT])
            summary.discount = sum(t.amount for t in transactions if t.transaction_type == TransactionType.DISCOUNT)
            summary.other_adjustments = sum(t.amount for t in transactions if t.transaction_type == TransactionType.OTHER_ADJUSTMENT)
            summary.leftover = summary.total_price - summary.total_paid - summary.discount - summary.other_adjustments
            summary.booking_payment = sum(t.amount for t in transactions if t.transaction_type == TransactionType.BOOKING_PAYMENT)
            summary.slot_payment = sum(t.amount for t in transactions if t.transaction_type == TransactionType.SLOT_PAYMENT)
            summary.cash_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.CASH)
            summary.bkash_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.BKASH)
            summary.nagad_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.NAGAD)
            summary.card_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.CARD)
            summary.bank_transfer_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.BANK_TRANSFER)

            # Update status based on payments
            if summary.leftover <= 0:
                summary.status = TransactionStatus.SUCCESSFUL
            elif summary.total_paid > 0:
                summary.status = TransactionStatus.PARTIAL
            else:
                summary.status = TransactionStatus.PENDING

            summary.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await db.commit()
            logging.info(f"Updated transaction summary for booking {booking_id}")

        return JSONResponse(content={
            "success": True,
            "message": "Transaction deleted successfully"
        })

    except SQLAlchemyError as e:
        await db.rollback()
        logging.error(f"Database error in delete_transaction: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Database error: {str(e)}"}
        )
    except Exception as e:
        logging.error(f"Unexpected error in delete_transaction: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Unexpected error: {str(e)}"}
        )


'''
--------------------
FINANCIAL JOURNAL ROUTE
--------------------
'''

@router.get("/api/financial-journal")
async def get_financial_journal(
    start_date: str = Query(...),
    end_date: str = Query(...),
    payment_method: str = Query(None),  # Comma-separated: "CASH,BKASH"
    transaction_type: str = Query(None),  # Comma-separated: "BOOKING_PAYMENT,SLOT_PAYMENT"
    booking_type: str = Query(None),  # "NORMAL" or "ACADEMY"
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all transactions for the Financial Journal view.
    Includes transactions from cancelled bookings for accurate financial records.
    Returns chronological list with daily totals per payment method.
    """
    try:
        # Parse date range
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()

        # Start building the query with eager loading
        query = (
            select(Transaction)
            .options(
                joinedload(Transaction.booking),
                joinedload(Transaction.creator),
                joinedload(Transaction.updater)
            )
            .filter(
                Transaction.created_at >= datetime.combine(start, datetime.min.time()),
                Transaction.created_at <= datetime.combine(end, datetime.max.time())
            )
        )

        # Apply payment method filter
        if payment_method:
            methods = [PaymentMethod[m.strip()] for m in payment_method.split(',')]
            query = query.filter(Transaction.payment_method.in_(methods))

        # Apply transaction type filter
        if transaction_type:
            types = [TransactionType[t.strip()] for t in transaction_type.split(',')]
            query = query.filter(Transaction.transaction_type.in_(types))

        # Apply booking type filter (join with booking)
        if booking_type:
            booking_types = [BookingType[bt.strip()] for bt in booking_type.split(',')]
            query = query.join(Transaction.booking).filter(Booking.booking_type.in_(booking_types))

        # Order by created_at descending (most recent first)
        query = query.order_by(Transaction.created_at.desc())

        # Execute query
        result = await db.execute(query)
        transactions = result.scalars().all()

        # Build response with transaction details
        transactions_data = []
        daily_totals = {}  # {date: {payment_method: amount}}

        for t in transactions:
            booking = t.booking
            is_cancelled = getattr(booking, 'is_cancelled', False) if booking else False

            transaction_date = t.created_at.date().isoformat()

            # Track daily totals
            if transaction_date not in daily_totals:
                daily_totals[transaction_date] = {
                    'CASH': 0, 'BKASH': 0, 'NAGAD': 0, 'CARD': 0, 'BANK_TRANSFER': 0
                }

            # Only count positive amounts towards totals (not discounts/adjustments)
            if t.transaction_type in [TransactionType.BOOKING_PAYMENT, TransactionType.SLOT_PAYMENT] and t.payment_method:
                daily_totals[transaction_date][t.payment_method.name] += t.amount

            transactions_data.append({
                "id": t.id,
                "created_at": t.created_at.isoformat(),
                "booking_id": t.booking_id,
                "customer_name": booking.name if booking else "Unknown",
                "customer_phone": booking.phone if booking else "Unknown",
                "booking_date": booking.booking_date.isoformat() if booking else None,
                "time_slot": booking.time_slot if booking else None,
                "booking_type": booking.booking_type.value if booking else None,
                "is_cancelled": is_cancelled,
                "transaction_type": t.transaction_type.value,
                "payment_method": t.payment_method.value if t.payment_method else None,
                "amount": t.amount,
                "created_by": t.creator.username if t.creator else "Unknown",
                "updated_by": t.updater.username if t.updater else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None
            })

        # Calculate period totals
        period_totals = {
            'CASH': 0, 'BKASH': 0, 'NAGAD': 0, 'CARD': 0, 'BANK_TRANSFER': 0
        }
        for date_totals in daily_totals.values():
            for method, amount in date_totals.items():
                period_totals[method] += amount

        grand_total = sum(period_totals.values())

        return JSONResponse(content={
            "success": True,
            "transactions": transactions_data,
            "daily_totals": daily_totals,
            "period_totals": period_totals,
            "grand_total": grand_total,
            "transaction_count": len(transactions_data)
        })

    except ValueError as e:
        return JSONResponse(status_code=400, content={
            "success": False,
            "message": f"Invalid parameter: {str(e)}"
        })
    except SQLAlchemyError as e:
        logging.error(f"Database error in get_financial_journal: {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"Database error: {str(e)}"
        })
    except Exception as e:
        logging.error(f"Unexpected error in get_financial_journal: {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"Unexpected error: {str(e)}"
        })


@router.get("/api/booking-payment-summary/{booking_id}")
async def get_booking_payment_summary(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get detailed payment summary for a specific booking.
    Used in the booking details modal for payment management.
    """
    try:
        # Get booking with transaction summary
        booking_result = await db.execute(
            select(Booking)
            .options(
                joinedload(Booking.transaction_summary),
                joinedload(Booking.user)
            )
            .filter(Booking.id == booking_id)
        )
        booking = booking_result.scalar_one_or_none()

        if not booking:
            return JSONResponse(status_code=404, content={
                "success": False,
                "message": "Booking not found"
            })

        # Get all transactions for this booking
        transactions_result = await db.execute(
            select(Transaction)
            .options(
                joinedload(Transaction.creator),
                joinedload(Transaction.updater)
            )
            .filter(Transaction.booking_id == booking_id)
            .order_by(Transaction.created_at.desc())
        )
        transactions = transactions_result.scalars().all()

        # Get or calculate summary data
        summary = booking.transaction_summary

        # If no summary exists, calculate it from slot price
        if not summary:
            # Try to get slot price
            slot_price_result = await db.execute(
                select(SlotPrice)
                .filter(
                    SlotPrice.time_slot == booking.time_slot,
                    SlotPrice.day_of_week == DayOfWeek[booking.booking_date.strftime('%A').upper()]
                )
            )
            slot_price = slot_price_result.scalar_one_or_none()
            total_price = slot_price.price if slot_price else 0
            total_paid = 0
            leftover = total_price
            status = "PENDING"
        else:
            total_price = summary.total_price
            total_paid = summary.total_paid
            leftover = summary.leftover
            status = summary.status.value

        transactions_data = [{
            "id": t.id,
            "transaction_type": t.transaction_type.value,
            "payment_method": t.payment_method.value if t.payment_method else None,
            "amount": t.amount,
            "created_by": t.creator.username if t.creator else "Unknown",
            "created_at": t.created_at.isoformat(),
            "updated_by": t.updater.username if t.updater else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None
        } for t in transactions]

        return JSONResponse(content={
            "success": True,
            "booking": {
                "id": booking.id,
                "name": booking.name,
                "phone": booking.phone,
                "booking_date": booking.booking_date.isoformat(),
                "time_slot": booking.time_slot,
                "booking_type": booking.booking_type.value,
                "is_cancelled": getattr(booking, 'is_cancelled', False),
                "created_by": booking.user.username if booking.user else "Unknown"
            },
            "summary": {
                "total_price": total_price,
                "total_paid": total_paid,
                "leftover": leftover,
                "status": status
            },
            "transactions": transactions_data
        })

    except SQLAlchemyError as e:
        logging.error(f"Database error in get_booking_payment_summary: {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"Database error: {str(e)}"
        })
    except Exception as e:
        logging.error(f"Unexpected error in get_booking_payment_summary: {str(e)}")
        return JSONResponse(status_code=500, content={
            "success": False,
            "message": f"Unexpected error: {str(e)}"
        })
