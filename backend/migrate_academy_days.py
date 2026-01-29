"""
Migration script to add academy_days_of_week column to bookings table

This allows academy bookings to specify which days of the week they apply to
(e.g., "Every Thursday" or "Every Monday,Wednesday,Friday")

Usage: python3 migrate_academy_days.py
"""
import asyncio
from sqlalchemy import text
from app.database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_academy_days():
    """Add academy_days_of_week column to bookings table"""

    async with SessionLocal() as session:
        try:
            logger.info("Starting migration: Adding academy_days_of_week column...")

            # Check if column already exists
            result = await session.execute(text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name='bookings'
                AND column_name='academy_days_of_week'
            """))

            if result.scalar_one_or_none():
                logger.info("✅ Column academy_days_of_week already exists!")
                return

            # Add the column
            await session.execute(text("""
                ALTER TABLE bookings
                ADD COLUMN academy_days_of_week VARCHAR
            """))

            await session.commit()
            logger.info("✅ Successfully added academy_days_of_week column!")
            logger.info("")
            logger.info("Column Details:")
            logger.info("  - Name: academy_days_of_week")
            logger.info("  - Type: VARCHAR")
            logger.info("  - Purpose: Store comma-separated days (e.g., 'MONDAY,FRIDAY')")
            logger.info("")
            logger.info("Example usage:")
            logger.info("  - Every Thursday: 'THURSDAY'")
            logger.info("  - Mon/Wed/Fri: 'MONDAY,WEDNESDAY,FRIDAY'")
            logger.info("  - Tue/Thu/Sat: 'TUESDAY,THURSDAY,SATURDAY'")

        except Exception as e:
            await session.rollback()
            logger.error(f"❌ Error during migration: {e}")
            raise


if __name__ == "__main__":
    print("=" * 60)
    print("Academy Days Migration")
    print("=" * 60)
    asyncio.run(migrate_academy_days())
