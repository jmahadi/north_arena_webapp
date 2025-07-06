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
from .models import User , Booking , Transaction, SlotPrice, PaymentMethod , TransactionStatus , TransactionType , TransactionSummary, DayOfWeek
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
INDEX ROUTE
--------------------
'''

@router.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return RedirectResponse(url="/login", status_code=303)

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
        first_day_of_month = today.replace(day=1)
        last_month_start = (first_day_of_month - timedelta(days=1)).replace(day=1)

        bookings_this_month = await db.execute(
            select(func.count(Booking.id)).filter(Booking.booking_date >= first_day_of_month)
        )
        bookings_this_month = bookings_this_month.scalar_one()

        upcoming_bookings = await db.execute(
            select(func.count(Booking.id)).filter(Booking.booking_date >= today)
        )
        upcoming_bookings = upcoming_bookings.scalar_one()

        revenue_this_month = await db.execute(
            select(func.sum(Transaction.amount))
            .filter(Transaction.created_at >= first_day_of_month)
        )
        revenue_this_month = revenue_this_month.scalar_one() or 0

        revenue_last_month = await db.execute(
            select(func.sum(Transaction.amount))
            .filter(Transaction.created_at >= last_month_start, Transaction.created_at < first_day_of_month)
        )
        revenue_last_month = revenue_last_month.scalar_one() or 0

        revenue_change = ((revenue_this_month - revenue_last_month) / revenue_last_month * 100) if revenue_last_month else 100

        days_this_month = (today - first_day_of_month).days + 1
        avg_bookings_per_day = bookings_this_month / days_this_month if days_this_month > 0 else 0
        
        logger.info("Dashboard data successfully retrieved")
        return {
            "bookings_this_month": bookings_this_month,
            "upcoming_bookings": upcoming_bookings,
            "revenue_this_month": revenue_this_month,
            "revenue_change": revenue_change,
            "avg_bookings_per_day": avg_bookings_per_day
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
    start_date: str = Form(None),  # Added parameter for date range
    end_date: str = Form(None),    # Added parameter for date range
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    try:
        booking_date_parsed = datetime.strptime(booking_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")

    try:
        existing_booking_result = await db.execute(select(Booking).filter(Booking.booking_date == booking_date_parsed, Booking.time_slot == time_slot))
        existing_booking = existing_booking_result.scalar_one_or_none()
        
        if existing_booking:
            return JSONResponse(content={
                "success": False,
                "message": "This slot is already booked"
            })
        else:
            booking = Booking(
                booked_by=current_user.id,
                name=name,
                phone=phone,
                booking_date=booking_date_parsed,
                time_slot=time_slot,
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


        # Fetch updated bookings for the entire date range
        bookings_result = await db.execute(
            select(Booking)
            .options(joinedload(Booking.user))
            .filter(Booking.booking_date.between(fetch_start_date, fetch_end_date))
            .order_by(Booking.booking_date, Booking.time_slot)
        )
        bookings = bookings_result.scalars().all()

        # Create bookingsData dictionary
        bookings_data = {
            f"{b.booking_date.isoformat()}_{b.time_slot}": {
                "id": b.id,
                "name": b.name,
                "phone": b.phone,
                "booking_date": b.booking_date.isoformat(),
                "time_slot": b.time_slot,
                "booked_by": b.user.username
            }
            for b in bookings
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
    start_date: str = Form(None),  # Add this parameter
    end_date: str = Form(None),    # Add this parameter
    current_user: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    try:
        booking_result = await db.execute(select(Booking).filter(Booking.id == booking_id))
        booking = booking_result.scalar_one_or_none()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")

        try:
            new_booking_date = datetime.strptime(booking_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")

        # Store the old booking date and time slot for reference
        old_booking_date = booking.booking_date
        old_time_slot = booking.time_slot

        # Check if the new slot is already booked
        existing_booking_result = await db.execute(
            select(Booking).filter(
                Booking.booking_date == new_booking_date,
                Booking.time_slot == time_slot,
                Booking.id != booking_id  # Exclude the current booking
            )
        )
        existing_booking = existing_booking_result.scalar_one_or_none()
        
        if existing_booking:
            raise HTTPException(status_code=409, detail="This slot is already booked. Please choose another.")

        booking.name = name
        booking.phone = phone
        booking.booking_date = new_booking_date
        booking.time_slot = time_slot
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
    
        # Fetch bookings for the determined date range
        bookings_result = await db.execute(
            select(Booking)
            .options(joinedload(Booking.user))
            .filter(Booking.booking_date.between(fetch_start_date, fetch_end_date))
            .order_by(Booking.booking_date, Booking.time_slot)
        )
        bookings = bookings_result.scalars().all()

        # Create bookingsData dictionary
        bookings_data = {
            f"{b.booking_date.isoformat()}_{b.time_slot}": {
                "id": b.id,
                "name": b.name,
                "phone": b.phone,
                "booking_date": b.booking_date.isoformat(),
                "time_slot": b.time_slot,
                "booked_by": b.user.username
            }
            for b in bookings
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
        
        # Store booking date before deletion for fetching updated bookings
        booking_date = booking.booking_date
        
        await db.delete(booking)
        await db.commit()

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

        # Fetch bookings for the selected date range
        bookings_result = await db.execute(
            select(Booking)
            .options(joinedload(Booking.user))
            .filter(Booking.booking_date.between(fetch_start_date, fetch_end_date))
            .order_by(Booking.booking_date, Booking.time_slot)
        )
        bookings = bookings_result.scalars().all()

        # Create updated bookingsData dictionary
        bookings_data = {
            f"{b.booking_date.isoformat()}_{b.time_slot}": {
                "id": b.id,
                "name": b.name,
                "phone": b.phone,
                "booking_date": b.booking_date.isoformat(),
                "time_slot": b.time_slot,
                "booked_by": b.user.username
            }
            for b in bookings
        }

        return JSONResponse(content={
            "success": True,
            "message": "Booking deleted successfully",
            "bookingsData": bookings_data
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
    
    bookings_result = await db.execute(
        select(Booking)
        .options(joinedload(Booking.user))
        .filter(Booking.booking_date.between(start_date, end_date))
        .order_by(Booking.booking_date, Booking.time_slot)
    )
    bookings = bookings_result.scalars().all()

    bookings_data = {}
    for booking in bookings:
        key = f"{booking.booking_date.isoformat()}_{booking.time_slot}"
        bookings_data[key] = {
            "id": booking.id,
            "name": booking.name,
            "phone": booking.phone,
            "booking_date": booking.booking_date.isoformat(),
            "time_slot": booking.time_slot,
            "booked_by": booking.user.username
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
        # Check if a slot price already exists for this time slot and day of week
        existing_slot_price = await db.execute(
            select(SlotPrice).filter(
                SlotPrice.time_slot == time_slot,
                SlotPrice.day_of_week == DayOfWeek[day_of_week]
            )
        )
        existing_slot_price = existing_slot_price.scalar_one_or_none()

        if existing_slot_price:
            # Update existing slot price
            existing_slot_price.price = price
            existing_slot_price.start_date = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else None
            existing_slot_price.end_date = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else None
            existing_slot_price.is_default = is_default
        else:
            # Create new slot price
            new_slot_price = SlotPrice(
                time_slot=time_slot,
                day_of_week=DayOfWeek[day_of_week],
                price=price,
                start_date=datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else None,
                end_date=datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else None,
                is_default=is_default
            )
            db.add(new_slot_price)

        await db.commit()
        return JSONResponse(content={"success": True, "message": "Slot price added/updated successfully"})
    except Exception as exc:
        await db.rollback()
        logging.error(f"Error adding/updating slot price: {str(exc)}")
        return JSONResponse(status_code=500, content={"success": False, "message": f"Error adding/updating slot price: {str(exc)}"})




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
                "payment_method": t.payment_method.value,
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
                "payment_method": t.payment_method.value,
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
    payment_method: str = Form(...),
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

        transaction = Transaction(
            booking_id=booking_id,
            transaction_type=TransactionType[transaction_type],
            payment_method=PaymentMethod[payment_method],
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
        summary.leftover = summary.total_price - summary.total_paid
        summary.booking_payment = sum(t.amount for t in transactions if t.transaction_type == TransactionType.BOOKING_PAYMENT)
        summary.slot_payment = sum(t.amount for t in transactions if t.transaction_type == TransactionType.SLOT_PAYMENT)
        summary.cash_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.CASH)
        summary.bkash_payment = sum(t.amount for t in transactions if t.payment_method == PaymentMethod.BKASH)
        
        if not summary.booking_payment_date and transaction.transaction_type == TransactionType.BOOKING_PAYMENT:
            summary.booking_payment_date = transaction.created_at.date()

        if summary.leftover == 0:
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
        if transaction_type:
            try:
                transaction.transaction_type = TransactionType[transaction_type]
                logging.info(f"Updated transaction type to {transaction_type}")
            except (KeyError, ValueError) as e:
                logging.error(f"Invalid transaction type: {transaction_type}")
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "message": f"Invalid transaction type: {transaction_type}"
                })
                
        if payment_method:
            try:
                transaction.payment_method = PaymentMethod[payment_method]
                logging.info(f"Updated payment method to {payment_method}")
            except (KeyError, ValueError) as e:
                logging.error(f"Invalid payment method: {payment_method}")
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "message": f"Invalid payment method: {payment_method}"
                })
                
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
            summary.leftover = summary.total_price - summary.total_paid
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
                "payment_method": updated_transaction.payment_method.value,
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
            summary.leftover = summary.total_price - summary.total_paid
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