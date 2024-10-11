"""Add timezone to created_at in transactions

Revision ID: b61f69b4657c
Revises: 8dab3b4a1358
Create Date: 2024-08-10 16:42:28.469078

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b61f69b4657c'
down_revision: Union[str, None] = '8dab3b4a1358'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Create a new column with timezone
    op.add_column('transactions', sa.Column('created_at_tz', sa.DateTime(timezone=True), nullable=True))
    
    # Copy data from the old column to the new one, converting to UTC
    op.execute("UPDATE transactions SET created_at_tz = created_at AT TIME ZONE 'UTC'")
    
    # Drop the old column
    op.drop_column('transactions', 'created_at')
    
    # Rename the new column
    op.alter_column('transactions', 'created_at_tz', new_column_name='created_at')
    
    # Make the column non-nullable and set the server default
    op.alter_column('transactions', 'created_at',
               existing_type=sa.DateTime(timezone=True),
               nullable=False,
               server_default=sa.text('NOW()'))

def downgrade():
    # Convert back to non-timezone aware
    op.alter_column('transactions', 'created_at',
               existing_type=sa.DateTime(timezone=True),
               type_=sa.DateTime(),
               postgresql_using='created_at::timestamp',
               nullable=False)
