"""Add user roles + is_active and the audit_logs activity table

Revision ID: f3a4b5c6d7e8
Revises: d2b3e4f5a6c7
Create Date: 2026-07-11 00:00:00.000000

Why: introduce multi-admin support with roles (MASTER vs STAFF) and an
append-only audit trail. Existing users are promoted to MASTER so nobody loses
access on deploy; new accounts created via the app default to STAFF.

Idempotent: enum creation is guarded by a DO block, columns use ADD COLUMN IF
NOT EXISTS, and the table uses CREATE TABLE IF NOT EXISTS — safe to re-run.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'd2b3e4f5a6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the userrole enum type if it doesn't already exist.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'userrole') THEN
                CREATE TYPE userrole AS ENUM ('MASTER', 'STAFF');
            END IF;
        END$$;
    """)

    # 2. Add the new user columns.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role userrole NOT NULL DEFAULT 'STAFF';")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT (now() AT TIME ZONE 'utc');")

    # 3. Promote every existing account to MASTER so current logins keep full
    #    access. New accounts created via the API explicitly set their role.
    op.execute("UPDATE users SET role = 'MASTER' WHERE role IS NULL OR role = 'STAFF';")

    # 4. Append-only activity trail.
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            actor_name VARCHAR,
            action VARCHAR NOT NULL,
            entity_type VARCHAR,
            entity_id INTEGER,
            summary VARCHAR,
            details VARCHAR,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_logs;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS created_at;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_active;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS role;")
    op.execute("DROP TYPE IF EXISTS userrole;")
