from fastapi import APIRouter, Depends, Request, Form, HTTPException , Query , Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.sql import text , func
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, and_, case, literal
from fastapi.responses import HTMLResponse , RedirectResponse , JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.security import OAuth2PasswordRequestForm
from passlib.context import CryptContext
from datetime import datetime , timedelta  ,timezone , date
from dateutil.relativedelta import relativedelta
from .database import get_db, SessionLocal
from .models import User , Booking , Transaction, SlotPrice, PaymentMethod , TransactionStatus , TransactionType , TransactionSummary, DayOfWeek, BookingType, UserRole, AuditLog
from .auth import create_access_token, get_current_user, require_master
import os
import asyncio
from sqlalchemy.exc import SQLAlchemyError
from pydantic import ValidationError
from enum import Enum
import logging
import time
import json

router = APIRouter()

templates = Jinja2Templates(directory="app/templates")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)

# Simple in-memory cache for dashboard data (TTL-based).
# TTL defaults to 5 minutes; override via DASHBOARD_CACHE_TTL_SECONDS env if you
# need a fresher dashboard (busy multi-admin) or a longer one (single admin).
_dashboard_cache: dict = {"data": None, "timestamp": 0}
DASHBOARD_CACHE_TTL = int(os.getenv("DASHBOARD_CACHE_TTL_SECONDS", "300"))


def invalidate_dashboard_cache():
    """Call this after any booking/transaction mutation to bust the cache."""
    _dashboard_cache["data"] = None
    _dashboard_cache["timestamp"] = 0


# Per-process cache for booking payment summaries. Keyed by booking_id, very
# short TTL (3s) — purpose is to absorb modal-open / re-open bursts and the
# refreshSummary call right after a transaction CUD. Invalidated explicitly on
# any transaction add/update/delete for the booking.
_booking_summary_cache: dict = {}
BOOKING_SUMMARY_CACHE_TTL = int(os.getenv("BOOKING_SUMMARY_CACHE_TTL_SECONDS", "3"))


def invalidate_booking_summary_cache(booking_id: int | None = None):
    """Drop one booking's cached payment summary, or all if None."""
    if booking_id is None:
        _booking_summary_cache.clear()
    else:
        _booking_summary_cache.pop(booking_id, None)


'''
--------------------
AUDIT LOG HELPER
--------------------
'''

async def record_audit(user, action: str, entity_type: str = None, entity_id: int = None,
                       summary: str = None, details: dict = None):
    """Append one row to the activity trail.

    Runs in its own session so an audit failure can never roll back or break the
    business action that triggered it (best-effort logging). Call AFTER the main
    mutation has committed.
    """
    try:
        async with SessionLocal() as session:
            session.add(AuditLog(
                user_id=getattr(user, 'id', None),
                actor_name=getattr(user, 'username', None),
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                summary=summary,
                details=json.dumps(details, default=str) if details is not None else None,
            ))
            await session.commit()
    except Exception as e:
        logger.error(f"Audit log failed for action={action}: {e}")


'''
--------------------
MATRIX RESPONSE HELPER
--------------------
'''

def _expand_booking_dates(b):
    """Yield (date, key_suffix) for every matrix cell a booking occupies.

    Normal bookings occupy a single date; academy bookings expand across their
    date range, honouring the selected days-of-week.
    """
    if b.booking_type == BookingType.ACADEMY and b.academy_start_date and b.academy_end_date:
        selected_days = None
        if b.academy_days_of_week:
            selected_days = [d.strip().upper() for d in b.academy_days_of_week.split(',')]
        current = b.academy_start_date
        while current <= b.academy_end_date:
            if not selected_days or current.strftime('%A').upper() in selected_days:
                yield current
            current += timedelta(days=1)
    else:
        yield b.booking_date


async def build_matrix_response(db: AsyncSession, start_date: date, end_date: date):
    """Build the matrix payload for a date range.

    Returns (bookings_data, cancelled_data):
      - bookings_data: active (non-cancelled) bookings, keyed "YYYY-MM-DD_slot".
      - cancelled_data: cancelled bookings that still hold money (total_paid > 0),
        keyed the same way but each value is a LIST — a slot can accumulate more
        than one cancelled-but-paid booking over its lifetime, and it can also
        have a live booking sitting on top of it.
    """
    result = await db.execute(
        select(Booking)
        .options(
            joinedload(Booking.user),
            joinedload(Booking.transaction_summary),
        )
        .filter(
            or_(
                and_(
                    Booking.booking_type == BookingType.NORMAL,
                    Booking.booking_date.between(start_date, end_date),
                ),
                and_(
                    Booking.booking_type == BookingType.ACADEMY,
                    Booking.academy_start_date <= end_date,
                    Booking.academy_end_date >= start_date,
                ),
            )
        )
        .order_by(Booking.booking_date, Booking.time_slot)
    )
    bookings = result.unique().scalars().all()

    bookings_data: dict = {}
    cancelled_data: dict = {}

    for b in bookings:
        summary = b.transaction_summary
        txn_status = summary.status.name if (summary and summary.status) else None
        is_cancelled = bool(getattr(b, 'is_cancelled', False))
        total_paid = float(summary.total_paid) if summary and summary.total_paid else 0.0

        for current in _expand_booking_dates(b):
            if not (start_date <= current <= end_date):
                continue
            key = f"{current.isoformat()}_{b.time_slot}"

            if is_cancelled:
                # Only surface cancelled bookings that still hold money — a
                # plain cancelled/empty slot should just look open.
                if total_paid <= 0:
                    continue
                cancelled_data.setdefault(key, []).append({
                    "id": b.id,
                    "name": b.name,
                    "phone": b.phone,
                    "booking_type": b.booking_type.value,
                    "transaction_status": txn_status,
                    "total_price": float(summary.total_price) if summary else 0.0,
                    "total_paid": total_paid,
                    "leftover": float(summary.leftover) if summary else 0.0,
                    "cancelled_at": b.cancelled_at.isoformat() if b.cancelled_at else None,
                })
                continue

            entry = {
                "id": b.id,
                "name": b.name,
                "phone": b.phone,
                "booking_date": current.isoformat(),
                "time_slot": b.time_slot,
                "booking_type": b.booking_type.value,
                "booked_by": b.user.username if b.user else "Unknown",
                "transaction_status": txn_status,
            }
            if b.booking_type == BookingType.ACADEMY:
                entry.update({
                    "academy_start_date": b.academy_start_date.isoformat() if b.academy_start_date else None,
                    "academy_end_date": b.academy_end_date.isoformat() if b.academy_end_date else None,
                    "academy_days_of_week": b.academy_days_of_week,
                    "academy_notes": b.academy_notes,
                })
            bookings_data[key] = entry

    return bookings_data, cancelled_data


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
    if getattr(user, "is_active", True) is False:
        logger.warning(f"Deactivated user login blocked: {form_data.username}")
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Contact an administrator.")
    access_token = create_access_token(data={"sub": user.email})
    logger.info(f"Successful login for user: {form_data.username}")
    await record_audit(user, "auth.login", "auth", user.id, f"{user.username} signed in")
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
async def dashboard(current_user: User = Depends(get_current_user)):
    logger.info(f"Dashboard accessed by user: {current_user.email}")

    if not current_user:
        logger.warning("Unauthorized access attempt to dashboard")
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Return cached data if still fresh
    now = time.time()
    if _dashboard_cache["data"] and (now - _dashboard_cache["timestamp"]) < DASHBOARD_CACHE_TTL:
        logger.info("Returning cached dashboard data")
        return _dashboard_cache["data"]

    try:
        today = datetime.now().date()
        first_day_of_month = today.replace(day=1)
        last_month_start = (first_day_of_month - timedelta(days=1)).replace(day=1)
        seven_days_ago = today - timedelta(days=7)
        thirty_days_ago = today - timedelta(days=30)
        payment_types = [TransactionType.BOOKING_PAYMENT, TransactionType.SLOT_PAYMENT]
        active_booking_filter = or_(Booking.is_cancelled == False, Booking.is_cancelled.is_(None))

        # Run each query in its own session so they can execute concurrently —
        # AsyncSession itself doesn't permit overlapping operations. With the
        # pool sized at 15/+20 this fans out cleanly.
        async def _run(query, extract):
            async with SessionLocal() as session:
                return extract(await session.execute(query))

        q_booking_counts = select(
            func.count(Booking.id).label('total'),
            func.count(case((Booking.booking_date >= first_day_of_month, Booking.id))).label('this_month'),
            func.count(case((Booking.booking_date >= today, Booking.id))).label('upcoming'),
            func.count(case((Booking.booking_date >= seven_days_ago, Booking.id))).label('last_week'),
            func.count(case((Booking.booking_date == today, Booking.id))).label('today'),
            func.count(case((Booking.booking_date >= thirty_days_ago, Booking.id))).label('last_30d'),
            func.count(case((and_(Booking.booking_type == BookingType.ACADEMY, Booking.booking_date >= first_day_of_month), Booking.id))).label('academy_this_month'),
            func.count(case((and_(Booking.booking_type == BookingType.NORMAL, Booking.booking_date >= first_day_of_month), Booking.id))).label('normal_this_month'),
        ).filter(active_booking_filter)

        q_revenue_sums = select(
            func.coalesce(func.sum(Transaction.amount), 0).label('total'),
            func.coalesce(func.sum(case((Transaction.created_at >= first_day_of_month, Transaction.amount), else_=literal(0))), 0).label('this_month'),
            func.coalesce(func.sum(case((and_(Transaction.created_at >= last_month_start, Transaction.created_at < first_day_of_month), Transaction.amount), else_=literal(0))), 0).label('last_month'),
            func.coalesce(func.sum(case((Transaction.created_at >= thirty_days_ago, Transaction.amount), else_=literal(0))), 0).label('last_30d'),
            func.coalesce(func.sum(case((Transaction.created_at >= today, Transaction.amount), else_=literal(0))), 0).label('today'),
        ).filter(Transaction.transaction_type.in_(payment_types))

        # Summary aggregates joined to bookings so payment-status counts and
        # outstanding dues reflect only LIVE bookings, while retained money from
        # cancelled bookings is tallied separately.
        q_txn_counts = (
            select(
                func.count(case((and_(active_booking_filter, TransactionSummary.status == TransactionStatus.PENDING), TransactionSummary.booking_id))).label('pending'),
                func.count(case((and_(active_booking_filter, TransactionSummary.status == TransactionStatus.SUCCESSFUL), TransactionSummary.booking_id))).label('completed'),
                func.count(case((and_(active_booking_filter, TransactionSummary.status == TransactionStatus.PARTIAL), TransactionSummary.booking_id))).label('partial'),
                func.coalesce(func.sum(case((active_booking_filter, TransactionSummary.leftover), else_=literal(0))), 0).label('outstanding_dues'),
                func.coalesce(func.sum(case((Booking.is_cancelled == True, TransactionSummary.total_paid), else_=literal(0))), 0).label('cancelled_retained'),
                func.count(case((and_(Booking.is_cancelled == True, TransactionSummary.total_paid > 0), TransactionSummary.booking_id))).label('cancelled_paid_count'),
            )
            .select_from(TransactionSummary)
            .join(Booking, Booking.id == TransactionSummary.booking_id)
        )

        q_popular_slots = (
            select(Booking.time_slot, func.count(Booking.id).label('count'))
            .filter(Booking.booking_date >= thirty_days_ago, active_booking_filter)
            .group_by(Booking.time_slot)
            .order_by(func.count(Booking.id).desc())
            .limit(5)
        )

        q_payment_breakdown = (
            select(Transaction.payment_method, func.sum(Transaction.amount))
            .filter(Transaction.created_at >= thirty_days_ago, Transaction.transaction_type.in_(payment_types))
            .group_by(Transaction.payment_method)
        )

        q_daily_revenue = (
            select(func.date(Transaction.created_at).label('date'), func.sum(Transaction.amount).label('revenue'))
            .filter(Transaction.created_at >= thirty_days_ago, Transaction.transaction_type.in_(payment_types))
            .group_by(func.date(Transaction.created_at))
        )

        q_daily_bookings = (
            select(Booking.booking_date, func.count(Booking.id).label('count'))
            .filter(Booking.booking_date >= thirty_days_ago, active_booking_filter)
            .group_by(Booking.booking_date)
        )

        q_recent_bookings = (
            select(Booking.name, Booking.booking_date, Booking.time_slot, Booking.created_at)
            .filter(active_booking_filter)
            .order_by(Booking.created_at.desc())
            .limit(5)
        )

        (
            bc, rv, tc,
            popular_slots_data, payment_data,
            daily_revenue_map, daily_bookings_map, recent_bookings_data,
        ) = await asyncio.gather(
            _run(q_booking_counts, lambda r: r.one()),
            _run(q_revenue_sums, lambda r: r.one()),
            _run(q_txn_counts, lambda r: r.one()),
            _run(q_popular_slots, lambda r: [{"time_slot": row[0], "count": row[1]} for row in r]),
            _run(q_payment_breakdown, lambda r: [{"method": row[0].value, "amount": float(row[1])} for row in r if row[0] is not None]),
            _run(q_daily_revenue, lambda r: {str(row[0]): float(row[1]) for row in r}),
            _run(q_daily_bookings, lambda r: {str(row[0]): row[1] for row in r}),
            _run(q_recent_bookings, lambda r: [{
                "name": row[0],
                "booking_date": row[1].isoformat(),
                "time_slot": row[2],
                "created_at": row[3].isoformat(),
            } for row in r]),
        )

        total_bookings = bc.total
        bookings_this_month = bc.this_month
        upcoming_bookings = bc.upcoming
        bookings_last_week = bc.last_week
        todays_bookings = bc.today

        total_revenue = float(rv.total)
        revenue_this_month = float(rv.this_month)
        revenue_last_month = float(rv.last_month)
        revenue_last_30_days = float(rv.last_30d)
        revenue_today = float(rv.today)
        revenue_change = ((revenue_this_month - revenue_last_month) / revenue_last_month * 100) if revenue_last_month else 100

        pending_transactions = tc.pending
        completed_transactions = tc.completed
        partial_transactions = tc.partial
        outstanding_dues = float(tc.outstanding_dues)
        cancelled_retained_revenue = float(tc.cancelled_retained)
        cancelled_paid_count = tc.cancelled_paid_count

        # Occupancy over the last 30 days: 8 slots/day across 30 days = 240 slot-days.
        SLOTS_PER_DAY = 8
        occupancy_rate = (bc.last_30d / (SLOTS_PER_DAY * 30) * 100) if bc.last_30d else 0

        # Densify daily series so the chart always shows 30 contiguous days.
        daily_revenue = []
        daily_bookings = []
        for i in range(30):
            day = today - timedelta(days=29 - i)
            day_str = day.isoformat()
            daily_revenue.append({"date": day_str, "revenue": daily_revenue_map.get(day_str, 0)})
            daily_bookings.append({"date": day_str, "bookings": daily_bookings_map.get(day_str, 0)})

        # Computed metrics
        avg_booking_value = revenue_this_month / bookings_this_month if bookings_this_month > 0 else 0
        days_this_month = (today - first_day_of_month).days + 1
        avg_bookings_per_day = bookings_this_month / days_this_month if days_this_month > 0 else 0

        result = {
            "bookings_this_month": bookings_this_month,
            "upcoming_bookings": upcoming_bookings,
            "revenue_this_month": float(revenue_this_month),
            "revenue_change": float(revenue_change),
            "avg_bookings_per_day": float(avg_bookings_per_day),
            "total_bookings": total_bookings,
            "total_revenue": float(total_revenue),
            "bookings_last_week": bookings_last_week,
            "revenue_last_30_days": float(revenue_last_30_days),
            "todays_bookings": todays_bookings,
            "avg_booking_value": float(avg_booking_value),
            "pending_transactions": pending_transactions,
            "completed_transactions": completed_transactions,
            "partial_transactions": partial_transactions,
            "revenue_today": revenue_today,
            "outstanding_dues": outstanding_dues,
            "occupancy_rate": float(occupancy_rate),
            "cancelled_retained_revenue": cancelled_retained_revenue,
            "cancelled_paid_count": cancelled_paid_count,
            "academy_bookings_this_month": bc.academy_this_month,
            "normal_bookings_this_month": bc.normal_this_month,
            "daily_revenue": daily_revenue,
            "daily_bookings": daily_bookings,
            "popular_time_slots": popular_slots_data,
            "payment_breakdown": payment_data,
            "recent_bookings": recent_bookings_data
        }

        # Cache the result
        _dashboard_cache["data"] = result
        _dashboard_cache["timestamp"] = time.time()

        logger.info("Dashboard data successfully retrieved (8 queries, cached)")
        return result
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
            new_booking_id = booking.id  # capture before commit (expire_on_commit)

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
            await record_audit(current_user, "booking.create", "booking", new_booking_id,
                               f"Created academy booking for {name} · {time_slot}",
                               {"type": "ACADEMY", "days": days_count, "total_price": total_price,
                                "start": str(academy_start), "end": str(academy_end)})

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
                await record_audit(current_user, "booking.create", "booking", None,
                                   f"Created {len(dates_to_book)} bookings for {name} · {time_slot}",
                                   {"type": "BULK", "count": len(dates_to_book), "slot": time_slot,
                                    "dates": [d.isoformat() for d in dates_to_book[:20]]})

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
                await db.flush()
                new_booking_id = booking.id  # capture before commit (expire_on_commit)
                await db.commit()
                message = "Slot has been successfully booked"
                await record_audit(current_user, "booking.create", "booking", new_booking_id,
                                   f"Booked {name} · {booking_date_parsed} · {time_slot}",
                                   {"type": "NORMAL", "date": str(booking_date_parsed), "slot": time_slot})

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
        await record_audit(current_user, "booking.update", "booking", booking_id,
                           f"Edited booking for {name} · {time_slot}",
                           {"name": name, "phone": phone, "slot": time_slot, "type": booking_type})

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
    current_user: User = Depends(require_master),  # master-only: destructive
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
        booking_name = booking.name
        booking_slot = booking.time_slot
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

        await record_audit(current_user,
                           "booking.cancel" if (has_transactions and retain_payments) else "booking.delete",
                           "booking", booking_id,
                           f"{'Cancelled' if (has_transactions and retain_payments) else 'Permanently deleted'} booking for {booking_name} · {booking_slot}",
                           {"had_transactions": has_transactions, "retained": bool(has_transactions and retain_payments)})

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
CANCEL / RESTORE BOOKING ROUTE
--------------------
'''

@router.post("/api/cancel_booking/{booking_id}", response_class=JSONResponse)
async def cancel_booking(
    booking_id: int,
    start_date: str = Query(None),
    end_date: str = Query(None),
    restore: bool = Query(False),  # true → un-cancel (bring the slot back to life)
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a booking as cancelled WITHOUT touching its money.

    Unlike delete, this always keeps the transactions and the transaction
    summary intact so any payment already collected stays on the books (visible
    in the financial journal and, if money was paid, as a "cancelled" overlay on
    the matrix). Pass ?restore=true to reverse a cancellation.
    """
    try:
        booking_result = await db.execute(select(Booking).filter(Booking.id == booking_id))
        booking = booking_result.scalar_one_or_none()

        if not booking:
            return JSONResponse(status_code=404, content={"success": False, "message": "Booking not found"})

        if restore:
            # Refuse to restore if the slot is now occupied by a live booking.
            occupied = await db.execute(
                select(Booking.id).filter(
                    Booking.booking_date == booking.booking_date,
                    Booking.time_slot == booking.time_slot,
                    Booking.id != booking_id,
                    or_(Booking.is_cancelled == False, Booking.is_cancelled == None),
                )
            )
            if occupied.scalar_one_or_none():
                return JSONResponse(status_code=409, content={
                    "success": False,
                    "message": "Can't restore — this slot is already booked by someone else.",
                })
            booking.is_cancelled = False
            booking.cancelled_at = None
            message = "Booking restored."
        else:
            booking.is_cancelled = True
            booking.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
            message = "Booking cancelled. Payment records retained for accounting."

        booking.last_modified_by = current_user.id
        b_name = booking.name
        b_slot = booking.time_slot
        b_date = booking.booking_date
        await db.commit()
        invalidate_dashboard_cache()
        invalidate_booking_summary_cache(booking_id)
        await record_audit(current_user,
                           "booking.restore" if restore else "booking.cancel",
                           "booking", booking_id,
                           f"{'Restored' if restore else 'Cancelled'} booking for {b_name} · {b_slot}")

        # Return the refreshed matrix for the requested range so the client can
        # patch both live and cancelled overlays in one shot.
        today = datetime.now().date()
        try:
            fetch_start = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else b_date - timedelta(days=3)
            fetch_end = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else b_date + timedelta(days=3)
        except ValueError:
            fetch_start, fetch_end = today, today + timedelta(days=6)
        fetch_end = min(fetch_end, fetch_start + relativedelta(months=3))

        bookings_data, cancelled_data = await build_matrix_response(db, fetch_start, fetch_end)

        return JSONResponse(content={
            "success": True,
            "message": message,
            "bookingsData": bookings_data,
            "cancelledData": cancelled_data,
        })
    except Exception as e:
        await db.rollback()
        print(f"Error in cancel_booking: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"An error occurred: {str(e)}"})


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

    # Tell the browser NOT to cache this response. We rely on SWR's in-memory
    # cache for fast re-renders; a browser-level HTTP cache would intercept
    # the post-mutation refetch and return a stale response (without the
    # newly added booking), making new slots appear "missing" until refresh.
    _bookings_cache_headers = {"Cache-Control": "private, no-store"}

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

    # bookingsData = live bookings; cancelledData = cancelled bookings that still
    # hold money (rendered as a "cancelled but paid" overlay on the matrix).
    bookings_data, cancelled_data = await build_matrix_response(db, start_date, end_date)

    return JSONResponse(
        content={"bookingsData": bookings_data, "cancelledData": cancelled_data},
        headers=_bookings_cache_headers,
    )





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
    current_user: User = Depends(require_master),  # master-only: pricing
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
        await record_audit(current_user, "slot_price.update", "slot_price", None,
                           f"Set price ৳{price:g} for {time_slot} · {day_of_week}",
                           {"time_slot": time_slot, "day": day_of_week, "price": price,
                            "is_default": is_default, "start": start_date, "end": end_date})
        return JSONResponse(content={"success": True, "message": "Slot price added/updated successfully"})
    except Exception as exc:
        await db.rollback()
        logging.error(f"Error adding/updating slot price: {str(exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Error adding/updating slot price: {str(exc)}"})

@router.delete("/delete_slot_price/{slot_price_id}", response_class=JSONResponse)
async def delete_slot_price(
    slot_price_id: int,
    current_user: User = Depends(require_master),  # master-only: pricing
    db: AsyncSession = Depends(get_db)
):
    try:
        # Find the slot price to delete
        slot_price_result = await db.execute(
            select(SlotPrice).filter(SlotPrice.id == slot_price_id)
        )
        slot_price = slot_price_result.scalar_one_or_none()

        if not slot_price:
            return JSONResponse(status_code=404, content={"success": False, "message": "Slot price not found"})

        price_desc = f"{slot_price.time_slot} · {slot_price.day_of_week.value} · ৳{slot_price.price:g}"
        await db.delete(slot_price)
        await db.commit()
        await record_audit(current_user, "slot_price.delete", "slot_price", slot_price_id,
                           f"Deleted price {price_desc}")

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
        # Capture values before commit expires the ORM objects (expire_on_commit).
        new_txn_id = transaction.id
        booking_name = booking.name
        txn_type_value = transaction_type_enum.value
        method_value = payment_method_enum.value if payment_method_enum else None
        # The transactions_sync_summary AFTER trigger recomputes the matching
        # transaction_summaries row (including total_price lookup if it's the
        # first transaction for this booking). No Python-side recompute needed.
        await db.commit()
        invalidate_booking_summary_cache(booking_id)
        invalidate_dashboard_cache()
        await record_audit(current_user, "transaction.create", "transaction", new_txn_id,
                           f"Added ৳{amount:g} ({txn_type_value}) to {booking_name}'s booking",
                           {"booking_id": booking_id, "amount": amount,
                            "type": txn_type_value, "method": method_value})
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

        # Capture post-update values before commit (expire_on_commit).
        new_amount_value = transaction.amount
        new_type_value = transaction.transaction_type.value
        old_type_value = original_transaction_type.value if original_transaction_type else None

        # Commit the transaction update — the transactions_sync_summary AFTER
        # trigger recomputes the matching transaction_summaries row.
        await db.commit()
        invalidate_booking_summary_cache(booking_id)
        invalidate_dashboard_cache()
        await record_audit(current_user, "transaction.update", "transaction", transaction_id,
                           f"Edited payment #{transaction_id}",
                           {"booking_id": booking_id,
                            "old_amount": original_amount, "new_amount": new_amount_value,
                            "old_type": old_type_value, "new_type": new_type_value})
        logging.info(f"Transaction {transaction_id} updated successfully")

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

        booking_id_for_invalidation = transaction.booking_id
        deleted_amount = transaction.amount
        deleted_type = transaction.transaction_type.value

        # Delete the transaction — the transactions_sync_summary AFTER trigger
        # recomputes (or deletes, if no transactions remain) the summary row.
        await db.delete(transaction)
        await db.commit()
        invalidate_booking_summary_cache(booking_id_for_invalidation)
        invalidate_dashboard_cache()
        await record_audit(current_user, "transaction.delete", "transaction", transaction_id,
                           f"Deleted payment of ৳{deleted_amount:g} ({deleted_type})",
                           {"booking_id": booking_id_for_invalidation, "amount": deleted_amount, "type": deleted_type})
        logging.info(f"Transaction {transaction_id} deleted")

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

    Responses include a short stale-while-revalidate Cache-Control header so
    rapid open/close/re-open patterns (e.g. browsing through bookings) can be
    served from browser/SWR cache without re-hitting the DB.
    Mutations call invalidate_booking_summary_cache(booking_id) to bust both
    the in-memory cache and any client caches.
    """
    # Server-side in-memory cache handles burst-read amortization with
    # explicit busting on transaction CUD. We deliberately do NOT enable
    # browser HTTP caching here — after a payment add/update/delete, the
    # client's refresh round-trip must hit the server (not the browser cache)
    # to read the just-updated summary.
    cache_headers = {"Cache-Control": "private, no-store"}

    # In-memory cache (per FastAPI worker process). 3s TTL is short enough that
    # this never serves materially stale data even without explicit busting.
    import time as _time
    now = _time.time()
    cached = _booking_summary_cache.get(booking_id)
    if cached and (now - cached["timestamp"]) < BOOKING_SUMMARY_CACHE_TTL:
        return JSONResponse(content=cached["data"], headers=cache_headers)

    try:
        # Get booking with transaction summary
        booking_result = await db.execute(
            select(Booking)
            .options(
                joinedload(Booking.transaction_summary),
                joinedload(Booking.user),
                joinedload(Booking.last_modified_by_user),
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

        payload = {
            "success": True,
            "booking": {
                "id": booking.id,
                "name": booking.name,
                "phone": booking.phone,
                "booking_date": booking.booking_date.isoformat(),
                "time_slot": booking.time_slot,
                "booking_type": booking.booking_type.value,
                "is_cancelled": getattr(booking, 'is_cancelled', False),
                "created_by": booking.user.username if booking.user else "Unknown",
                "last_modified_by": booking.last_modified_by_user.username if booking.last_modified_by_user else None,
            },
            "summary": {
                "total_price": total_price,
                "total_paid": total_paid,
                "leftover": leftover,
                "status": status
            },
            "transactions": transactions_data
        }
        _booking_summary_cache[booking_id] = {"data": payload, "timestamp": now}
        return JSONResponse(content=payload, headers=cache_headers)

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


'''
--------------------
CURRENT USER / USER MANAGEMENT / AUDIT LOG ROUTES
--------------------
'''

def _serialize_user(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "role": u.role.value if u.role else "STAFF",
        "is_active": bool(getattr(u, "is_active", True)),
        "is_master": getattr(u, "is_master", False),
        "created_at": u.created_at.isoformat() if getattr(u, "created_at", None) else None,
    }


@router.get("/api/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Identity + role of the logged-in admin — used by the frontend to gate UI."""
    return {"success": True, "user": _serialize_user(current_user)}


@router.get("/api/users")
async def list_users(current_user: User = Depends(require_master), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.id))
    users = result.scalars().all()
    return {"success": True, "users": [_serialize_user(u) for u in users]}


@router.post("/api/users")
async def create_user_account(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    role: str = Form("STAFF"),
    current_user: User = Depends(require_master),
    db: AsyncSession = Depends(get_db),
):
    try:
        role_key = (role or "STAFF").strip().upper()
        if role_key not in UserRole.__members__:
            return JSONResponse(status_code=400, content={"success": False, "message": f"Invalid role: {role}"})
        if len(password) < 6:
            return JSONResponse(status_code=400, content={"success": False, "message": "Password must be at least 6 characters."})

        existing = await db.execute(
            select(User).filter(or_(User.email == email, User.username == username))
        )
        if existing.scalar_one_or_none():
            return JSONResponse(status_code=409, content={"success": False, "message": "A user with that email or username already exists."})

        user = User(username=username, email=email, role=UserRole[role_key], is_active=True)
        user.set_password(password)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        await record_audit(current_user, "user.create", "user", user.id,
                           f"Created {role_key.lower()} account for {username} ({email})",
                           {"role": role_key})
        return {"success": True, "user": _serialize_user(user)}
    except SQLAlchemyError as e:
        await db.rollback()
        logging.error(f"Database error in create_user_account: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": "Database error"})


@router.patch("/api/users/{user_id}")
async def update_user_account(
    user_id: int,
    role: str = Form(None),
    is_active: bool = Form(None),
    password: str = Form(None),
    current_user: User = Depends(require_master),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return JSONResponse(status_code=404, content={"success": False, "message": "User not found"})

        changes = {}

        # Count remaining active masters to prevent locking everyone out.
        masters_result = await db.execute(
            select(func.count(User.id)).filter(User.role == UserRole.MASTER, User.is_active == True)
        )
        active_masters = masters_result.scalar() or 0

        if role is not None:
            role_key = role.strip().upper()
            if role_key not in UserRole.__members__:
                return JSONResponse(status_code=400, content={"success": False, "message": f"Invalid role: {role}"})
            new_role = UserRole[role_key]
            if user.role == UserRole.MASTER and new_role != UserRole.MASTER and active_masters <= 1:
                return JSONResponse(status_code=400, content={"success": False, "message": "Can't demote the last master account."})
            if user.id == current_user.id and new_role != UserRole.MASTER:
                return JSONResponse(status_code=400, content={"success": False, "message": "You can't remove your own master role."})
            changes["role"] = role_key
            user.role = new_role

        if is_active is not None:
            if not is_active and user.id == current_user.id:
                return JSONResponse(status_code=400, content={"success": False, "message": "You can't deactivate your own account."})
            if not is_active and user.role == UserRole.MASTER and active_masters <= 1:
                return JSONResponse(status_code=400, content={"success": False, "message": "Can't deactivate the last master account."})
            changes["is_active"] = is_active
            user.is_active = is_active

        if password:
            if len(password) < 6:
                return JSONResponse(status_code=400, content={"success": False, "message": "Password must be at least 6 characters."})
            user.set_password(password)
            changes["password_reset"] = True

        await db.commit()
        await db.refresh(user)
        await record_audit(current_user, "user.update", "user", user.id,
                           f"Updated account {user.username}", changes)
        return {"success": True, "user": _serialize_user(user)}
    except SQLAlchemyError as e:
        await db.rollback()
        logging.error(f"Database error in update_user_account: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": "Database error"})


@router.get("/api/audit-logs")
async def get_audit_logs(
    start_date: str = Query(None),
    end_date: str = Query(None),
    action: str = Query(None),          # comma-separated action prefixes/exact
    entity_type: str = Query(None),     # comma-separated
    user_id: int = Query(None),
    limit: int = Query(100),
    offset: int = Query(0),
    current_user: User = Depends(require_master),
    db: AsyncSession = Depends(get_db),
):
    """Filterable, paginated activity trail. Master-only oversight view."""
    try:
        query = select(AuditLog)
        if start_date:
            start = datetime.strptime(start_date, "%Y-%m-%d").date()
            query = query.filter(AuditLog.created_at >= datetime.combine(start, datetime.min.time()))
        if end_date:
            end = datetime.strptime(end_date, "%Y-%m-%d").date()
            query = query.filter(AuditLog.created_at <= datetime.combine(end, datetime.max.time()))
        if action:
            query = query.filter(AuditLog.action.in_([a.strip() for a in action.split(',')]))
        if entity_type:
            query = query.filter(AuditLog.entity_type.in_([e.strip() for e in entity_type.split(',')]))
        if user_id:
            query = query.filter(AuditLog.user_id == user_id)

        count_result = await db.execute(select(func.count()).select_from(query.subquery()))
        total = count_result.scalar() or 0

        limit = max(1, min(limit, 500))
        query = query.order_by(AuditLog.created_at.desc()).limit(limit).offset(max(0, offset))
        result = await db.execute(query)
        logs = result.scalars().all()

        rows = []
        for log in logs:
            details = None
            if log.details:
                try:
                    details = json.loads(log.details)
                except Exception:
                    details = log.details
            rows.append({
                "id": log.id,
                "actor": log.actor_name or "System",
                "user_id": log.user_id,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "summary": log.summary,
                "details": details,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            })

        return {"success": True, "logs": rows, "total": total, "limit": limit, "offset": offset}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"success": False, "message": f"Invalid parameter: {str(e)}"})
    except SQLAlchemyError as e:
        logging.error(f"Database error in get_audit_logs: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "message": "Database error"})
