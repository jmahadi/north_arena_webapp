"""
Setup academy pricing for specific slots
Days: Tuesday, Friday, Saturday
Slots: 3:00 PM - 4:30 PM, 4:30 PM - 6:00 PM, 6:00 PM - 7:30 PM
Academy Rate: ₹2,000 per day per slot

Usage: python3 setup_academy_pricing.py
"""
import asyncio
from sqlalchemy import text
from app.database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def setup_academy_prices():
    """Add academy pricing for specified slots"""

    academy_slots = [
        ('3:00 PM - 4:30 PM', 'TUESDAY', 2000.00),
        ('4:30 PM - 6:00 PM', 'TUESDAY', 2000.00),
        ('6:00 PM - 7:30 PM', 'TUESDAY', 2000.00),
        ('3:00 PM - 4:30 PM', 'FRIDAY', 2000.00),
        ('4:30 PM - 6:00 PM', 'FRIDAY', 2000.00),
        ('6:00 PM - 7:30 PM', 'FRIDAY', 2000.00),
        ('3:00 PM - 4:30 PM', 'SATURDAY', 2000.00),
        ('4:30 PM - 6:00 PM', 'SATURDAY', 2000.00),
        ('6:00 PM - 7:30 PM', 'SATURDAY', 2000.00),
    ]

    async with SessionLocal() as session:
        try:
            logger.info("Setting up academy pricing...")
            logger.info(f"Academy Rate: ₹2,000 per day")
            logger.info("-" * 60)

            for time_slot, day_of_week, price in academy_slots:
                # Check if academy price already exists
                result = await session.execute(text("""
                    SELECT id FROM slot_prices
                    WHERE time_slot = :time_slot
                    AND day_of_week = :day_of_week
                    AND booking_type = 'ACADEMY'
                """), {"time_slot": time_slot, "day_of_week": day_of_week})

                existing = result.scalar_one_or_none()

                if existing:
                    # Update existing academy price
                    await session.execute(text("""
                        UPDATE slot_prices
                        SET price = :price, is_default = true
                        WHERE id = :id
                    """), {"price": price, "id": existing})
                    logger.info(f"✅ Updated: {day_of_week:<10} | {time_slot:<20} | ₹{price:>7.2f}")
                else:
                    # Insert new academy price
                    await session.execute(text("""
                        INSERT INTO slot_prices (time_slot, day_of_week, price, booking_type, is_default)
                        VALUES (:time_slot, :day_of_week, :price, 'ACADEMY', true)
                    """), {"time_slot": time_slot, "day_of_week": day_of_week, "price": price})
                    logger.info(f"✅ Added:   {day_of_week:<10} | {time_slot:<20} | ₹{price:>7.2f}")

            await session.commit()

            logger.info("-" * 60)
            logger.info("✅ Academy pricing setup completed!")
            logger.info("")
            logger.info("Summary:")
            logger.info("  - 9 slots configured for academy bookings")
            logger.info("  - Days: Tuesday, Friday, Saturday")
            logger.info("  - Rate: ₹2,000 per day per slot")
            logger.info("")
            logger.info("Example monthly cost:")
            logger.info("  - 30 days: ₹2,000 × 30 = ₹60,000 per slot")
            logger.info("  - 31 days: ₹2,000 × 31 = ₹62,000 per slot")

        except Exception as e:
            await session.rollback()
            logger.error(f"❌ Error setting up academy pricing: {e}")
            raise


if __name__ == "__main__":
    print("=" * 60)
    print("Academy Pricing Setup")
    print("=" * 60)
    asyncio.run(setup_academy_prices())
