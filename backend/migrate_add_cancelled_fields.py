"""
Migration script to add is_cancelled and cancelled_at fields to the bookings table.
Run this script to update the database schema.

Usage:
    python migrate_add_cancelled_fields.py
"""

import asyncio
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


async def migrate():
    """Add is_cancelled and cancelled_at fields to bookings table."""
    engine = create_async_engine(DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        # Check if columns already exist
        result = await conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'bookings'
            AND column_name IN ('is_cancelled', 'cancelled_at')
        """))
        existing_columns = [row[0] for row in result.fetchall()]

        # Add is_cancelled column if it doesn't exist
        if 'is_cancelled' not in existing_columns:
            print("Adding is_cancelled column...")
            await conn.execute(text("""
                ALTER TABLE bookings
                ADD COLUMN is_cancelled BOOLEAN DEFAULT FALSE
            """))
            print("is_cancelled column added successfully!")
        else:
            print("is_cancelled column already exists, skipping...")

        # Add cancelled_at column if it doesn't exist
        if 'cancelled_at' not in existing_columns:
            print("Adding cancelled_at column...")
            await conn.execute(text("""
                ALTER TABLE bookings
                ADD COLUMN cancelled_at TIMESTAMP NULL
            """))
            print("cancelled_at column added successfully!")
        else:
            print("cancelled_at column already exists, skipping...")

    await engine.dispose()
    print("\nMigration completed successfully!")


if __name__ == "__main__":
    asyncio.run(migrate())
