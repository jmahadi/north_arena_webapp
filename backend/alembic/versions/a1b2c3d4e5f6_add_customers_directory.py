"""Add customers directory (autocomplete) + backfill from bookings

Revision ID: a1b2c3d4e5f6
Revises: f3a4b5c6d7e8
Create Date: 2026-07-11 01:00:00.000000

Why: powers name/phone type-ahead on the booking form. One row per phone; name
is the most recent booking's name. Backfilled from existing bookings.

Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, and the backfill uses
ON CONFLICT DO NOTHING — safe to re-run.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            name VARCHAR NOT NULL,
            phone VARCHAR NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc'),
            updated_at TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc')
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);")
    # Case-insensitive prefix search on name.
    op.execute("CREATE INDEX IF NOT EXISTS idx_customers_name_lower ON customers (lower(name));")

    # Backfill: one row per phone, taking the name from the most recent booking.
    op.execute("""
        INSERT INTO customers (name, phone, created_at, updated_at)
        SELECT DISTINCT ON (phone) name, phone,
               (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')
        FROM bookings
        WHERE phone IS NOT NULL AND btrim(phone) <> ''
        ORDER BY phone, id DESC
        ON CONFLICT (phone) DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS customers;")
