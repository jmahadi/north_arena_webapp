"""Allow NULL payment_method in transactions

Revision ID: 4b2d6b1d6c51
Revises: b61f69b4657c
Create Date: 2026-02-15 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b2d6b1d6c51'
down_revision: Union[str, None] = 'b61f69b4657c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'transactions',
        'payment_method',
        existing_type=sa.Enum('CASH', 'BKASH', 'NAGAD', 'CARD', 'BANK_TRANSFER', name='paymentmethod'),
        nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        'transactions',
        'payment_method',
        existing_type=sa.Enum('CASH', 'BKASH', 'NAGAD', 'CARD', 'BANK_TRANSFER', name='paymentmethod'),
        nullable=False
    )
