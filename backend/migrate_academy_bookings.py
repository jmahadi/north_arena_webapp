"""
Database migration script to add academy booking support

This script adds the following columns:
- bookings.booking_type (ENUM: NORMAL, ACADEMY)
- bookings.academy_start_date (DATE, nullable)
- bookings.academy_end_date (DATE, nullable)
- bookings.academy_month_days (INTEGER, nullable)
- bookings.academy_notes (STRING, nullable)
- slot_prices.booking_type (ENUM: NORMAL, ACADEMY, nullable)

Usage: python3 migrate_academy_bookings.py
"""
import asyncio
from sqlalchemy import text
from app.database import SessionLocal, engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_migration():
    """Run the database migration"""

    async with engine.begin() as conn:
        try:
            logger.info("Starting migration for academy bookings...")

            # 1. Create BookingType ENUM if it doesn't exist
            logger.info("Creating BookingType enum type...")
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bookingtype') THEN
                        CREATE TYPE bookingtype AS ENUM ('NORMAL', 'ACADEMY');
                    END IF;
                END $$;
            """))

            # 2. Add booking_type column to bookings table
            logger.info("Adding booking_type column to bookings table...")
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'bookings' AND column_name = 'booking_type'
                    ) THEN
                        ALTER TABLE bookings
                        ADD COLUMN booking_type bookingtype NOT NULL DEFAULT 'NORMAL';
                    END IF;
                END $$;
            """))

            # 3. Add academy_start_date column
            logger.info("Adding academy_start_date column...")
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'bookings' AND column_name = 'academy_start_date'
                    ) THEN
                        ALTER TABLE bookings
                        ADD COLUMN academy_start_date DATE;
                    END IF;
                END $$;
            """))

            # 4. Add academy_end_date column
            logger.info("Adding academy_end_date column...")
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'bookings' AND column_name = 'academy_end_date'
                    ) THEN
                        ALTER TABLE bookings
                        ADD COLUMN academy_end_date DATE;
                    END IF;
                END $$;
            """))

            # 5. Add academy_month_days column
            logger.info("Adding academy_month_days column...")
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'bookings' AND column_name = 'academy_month_days'
                    ) THEN
                        ALTER TABLE bookings
                        ADD COLUMN academy_month_days INTEGER;
                    END IF;
                END $$;
            """))

            # 6. Add academy_notes column
            logger.info("Adding academy_notes column...")
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'bookings' AND column_name = 'academy_notes'
                    ) THEN
                        ALTER TABLE bookings
                        ADD COLUMN academy_notes VARCHAR;
                    END IF;
                END $$;
            """))

            # 7. Add booking_type column to slot_prices table
            logger.info("Adding booking_type column to slot_prices table...")
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'slot_prices' AND column_name = 'booking_type'
                    ) THEN
                        ALTER TABLE slot_prices
                        ADD COLUMN booking_type bookingtype;
                    END IF;
                END $$;
            """))

            logger.info("✅ Migration completed successfully!")
            logger.info("")
            logger.info("Summary of changes:")
            logger.info("  - Added BookingType enum (Normal, Academy)")
            logger.info("  - Added 5 new columns to bookings table")
            logger.info("  - Added 1 new column to slot_prices table")
            logger.info("")
            logger.info("Next steps:")
            logger.info("  1. Set up academy pricing in slot_prices table")
            logger.info("  2. Use the updated booking form to create academy bookings")

        except Exception as e:
            logger.error(f"❌ Migration failed: {e}")
            raise


if __name__ == "__main__":
    print("=" * 60)
    print("Database Migration: Academy Booking Support")
    print("=" * 60)
    asyncio.run(run_migration())
