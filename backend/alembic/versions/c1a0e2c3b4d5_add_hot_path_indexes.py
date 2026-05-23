"""Add hot-path indexes for bookings/transactions queries

Revision ID: c1a0e2c3b4d5
Revises: 4b2d6b1d6c51
Create Date: 2026-05-24 00:00:00.000000

Why: The bookings matrix, dashboard, and financial journal all do range filters
on booking_date / created_at and join on booking_id, but no indexes exist beyond
PKs. Adds composite indexes covering the hottest read paths.

All indexes use IF NOT EXISTS via op.create_index(..., if_not_exists=True) so the
migration is safe to re-run.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c1a0e2c3b4d5'
down_revision: Union[str, None] = '4b2d6b1d6c51'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS so the migration is idempotent and safe
    # to re-run if a partial deploy leaves some indexes already created.
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_booking_date_cancelled
            ON bookings (booking_date, is_cancelled);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_booking_type_date
            ON bookings (booking_type, booking_date);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_booking_academy_range
            ON bookings (academy_start_date, academy_end_date)
            WHERE booking_type = 'ACADEMY';
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transaction_booking
            ON transactions (booking_id);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transaction_created
            ON transactions (created_at);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_transaction_booking_type
            ON transactions (booking_id, transaction_type);
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_transaction_booking_type;")
    op.execute("DROP INDEX IF EXISTS idx_transaction_created;")
    op.execute("DROP INDEX IF EXISTS idx_transaction_booking;")
    op.execute("DROP INDEX IF EXISTS idx_booking_academy_range;")
    op.execute("DROP INDEX IF EXISTS idx_booking_type_date;")
    op.execute("DROP INDEX IF EXISTS idx_booking_date_cancelled;")
