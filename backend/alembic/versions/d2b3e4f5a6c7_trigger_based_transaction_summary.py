"""Trigger-based transaction_summaries maintenance

Revision ID: d2b3e4f5a6c7
Revises: c1a0e2c3b4d5
Create Date: 2026-05-24 00:00:01.000000

Why: Previously the FastAPI add/update/delete_transaction endpoints fetched
every transaction for a booking and recomputed 10+ aggregate sums in Python on
every write. Moving this to a Postgres AFTER trigger means:
  - Summaries can never drift from the underlying transactions (single source
    of truth, transactional with the write that caused it).
  - Aggregation runs in the DB with SUM(...) FILTER(...) clauses — much faster
    than the Python loops.
  - Python code path for transaction CUD becomes trivial.

Structure:
  - public.recalc_transaction_summary(p_booking_id integer)
      Recomputes every field of transaction_summaries for one booking.
      If no transactions remain, deletes the summary row (matches prior Py logic).
      If the summary does not yet exist, derives total_price from slot_prices
      using the same logic as the old Python code.
  - public.trg_transactions_sync_summary()
      Trigger function dispatching INSERT/UPDATE/DELETE to recalc, handling the
      edge case where an UPDATE moves a transaction between bookings.
  - Trigger transactions_sync_summary on transactions (AFTER, FOR EACH ROW).
  - One-time backfill: run recalc once per existing booking_id that has any
    transaction, so existing summaries become trigger-consistent.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd2b3e4f5a6c7'
down_revision: Union[str, None] = 'c1a0e2c3b4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RECALC_FUNCTION_SQL = r"""
CREATE OR REPLACE FUNCTION public.recalc_transaction_summary(p_booking_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_count integer;
    v_booking bookings%ROWTYPE;
    v_total_price double precision;
    v_existing_total_price double precision;
BEGIN
    -- If no transactions remain for this booking, drop any summary row.
    SELECT COUNT(*) INTO v_count FROM transactions WHERE booking_id = p_booking_id;
    IF v_count = 0 THEN
        DELETE FROM transaction_summaries WHERE booking_id = p_booking_id;
        RETURN;
    END IF;

    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        -- Orphan transactions (shouldn't happen with FK, but be defensive).
        RETURN;
    END IF;

    -- Reuse existing total_price if the summary already exists; otherwise derive
    -- from the slot_prices table using the same lookup the Python code used.
    SELECT total_price INTO v_existing_total_price
        FROM transaction_summaries WHERE booking_id = p_booking_id;

    IF v_existing_total_price IS NULL THEN
        SELECT price INTO v_total_price
        FROM slot_prices
        WHERE time_slot = v_booking.time_slot
          AND day_of_week = upper(to_char(v_booking.booking_date, 'FMDay'))::dayofweek
          AND (
              (start_date <= v_booking.booking_date AND end_date >= v_booking.booking_date)
              OR (start_date IS NULL AND end_date IS NULL)
          )
        ORDER BY is_default DESC
        LIMIT 1;

        IF v_total_price IS NULL THEN
            v_total_price := 0;
        END IF;
    ELSE
        v_total_price := v_existing_total_price;
    END IF;

    INSERT INTO transaction_summaries (
        booking_id, total_price,
        total_paid, discount, other_adjustments, leftover,
        booking_payment, booking_payment_date, slot_payment,
        cash_payment, bkash_payment, nagad_payment, card_payment, bank_transfer_payment,
        booking_cash_payment, booking_bkash_payment, booking_nagad_payment,
        booking_card_payment, booking_bank_transfer_payment,
        slot_cash_payment, slot_bkash_payment, slot_nagad_payment,
        slot_card_payment, slot_bank_transfer_payment,
        status, updated_at
    )
    SELECT
        p_booking_id,
        v_total_price,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('BOOKING_PAYMENT','SLOT_PAYMENT')), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'DISCOUNT'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'OTHER_ADJUSTMENT'), 0),
        v_total_price
            - COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('BOOKING_PAYMENT','SLOT_PAYMENT')), 0)
            - COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'DISCOUNT'), 0)
            - COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'OTHER_ADJUSTMENT'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'BOOKING_PAYMENT'), 0),
        (SELECT MIN(created_at::date) FROM transactions
            WHERE booking_id = p_booking_id AND transaction_type = 'BOOKING_PAYMENT'),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'SLOT_PAYMENT'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'CASH'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'BKASH'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'NAGAD'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'CARD'), 0),
        COALESCE(SUM(amount) FILTER (WHERE payment_method = 'BANK_TRANSFER'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'BOOKING_PAYMENT' AND payment_method = 'CASH'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'BOOKING_PAYMENT' AND payment_method = 'BKASH'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'BOOKING_PAYMENT' AND payment_method = 'NAGAD'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'BOOKING_PAYMENT' AND payment_method = 'CARD'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'BOOKING_PAYMENT' AND payment_method = 'BANK_TRANSFER'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'SLOT_PAYMENT' AND payment_method = 'CASH'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'SLOT_PAYMENT' AND payment_method = 'BKASH'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'SLOT_PAYMENT' AND payment_method = 'NAGAD'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'SLOT_PAYMENT' AND payment_method = 'CARD'), 0),
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'SLOT_PAYMENT' AND payment_method = 'BANK_TRANSFER'), 0),
        CASE
            WHEN v_total_price
                - COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('BOOKING_PAYMENT','SLOT_PAYMENT')), 0)
                - COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'DISCOUNT'), 0)
                - COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'OTHER_ADJUSTMENT'), 0) <= 0
                THEN 'SUCCESSFUL'::transactionstatus
            WHEN COALESCE(SUM(amount) FILTER (WHERE transaction_type IN ('BOOKING_PAYMENT','SLOT_PAYMENT')), 0) > 0
                THEN 'PARTIAL'::transactionstatus
            ELSE 'PENDING'::transactionstatus
        END,
        NOW()
    FROM transactions
    WHERE booking_id = p_booking_id
    ON CONFLICT (booking_id) DO UPDATE SET
        total_paid = EXCLUDED.total_paid,
        discount = EXCLUDED.discount,
        other_adjustments = EXCLUDED.other_adjustments,
        leftover = EXCLUDED.leftover,
        booking_payment = EXCLUDED.booking_payment,
        booking_payment_date = EXCLUDED.booking_payment_date,
        slot_payment = EXCLUDED.slot_payment,
        cash_payment = EXCLUDED.cash_payment,
        bkash_payment = EXCLUDED.bkash_payment,
        nagad_payment = EXCLUDED.nagad_payment,
        card_payment = EXCLUDED.card_payment,
        bank_transfer_payment = EXCLUDED.bank_transfer_payment,
        booking_cash_payment = EXCLUDED.booking_cash_payment,
        booking_bkash_payment = EXCLUDED.booking_bkash_payment,
        booking_nagad_payment = EXCLUDED.booking_nagad_payment,
        booking_card_payment = EXCLUDED.booking_card_payment,
        booking_bank_transfer_payment = EXCLUDED.booking_bank_transfer_payment,
        slot_cash_payment = EXCLUDED.slot_cash_payment,
        slot_bkash_payment = EXCLUDED.slot_bkash_payment,
        slot_nagad_payment = EXCLUDED.slot_nagad_payment,
        slot_card_payment = EXCLUDED.slot_card_payment,
        slot_bank_transfer_payment = EXCLUDED.slot_bank_transfer_payment,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at;
END;
$$;
"""

TRIGGER_FUNCTION_SQL = r"""
CREATE OR REPLACE FUNCTION public.trg_transactions_sync_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalc_transaction_summary(OLD.booking_id);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
            PERFORM public.recalc_transaction_summary(OLD.booking_id);
        END IF;
        PERFORM public.recalc_transaction_summary(NEW.booking_id);
        RETURN NEW;
    ELSE
        PERFORM public.recalc_transaction_summary(NEW.booking_id);
        RETURN NEW;
    END IF;
END;
$$;
"""


def upgrade() -> None:
    op.execute(RECALC_FUNCTION_SQL)
    op.execute(TRIGGER_FUNCTION_SQL)

    op.execute("DROP TRIGGER IF EXISTS transactions_sync_summary ON transactions;")
    op.execute("""
        CREATE TRIGGER transactions_sync_summary
        AFTER INSERT OR UPDATE OR DELETE ON transactions
        FOR EACH ROW EXECUTE FUNCTION public.trg_transactions_sync_summary();
    """)

    # Backfill: bring every existing summary into agreement with the trigger logic.
    # Done one booking at a time inside the function so total_price is preserved
    # for existing rows (and looked up for any orphan transactions).
    op.execute("""
        DO $$
        DECLARE
            r record;
        BEGIN
            FOR r IN SELECT DISTINCT booking_id FROM transactions LOOP
                PERFORM public.recalc_transaction_summary(r.booking_id);
            END LOOP;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS transactions_sync_summary ON transactions;")
    op.execute("DROP FUNCTION IF EXISTS public.trg_transactions_sync_summary();")
    op.execute("DROP FUNCTION IF EXISTS public.recalc_transaction_summary(integer);")
