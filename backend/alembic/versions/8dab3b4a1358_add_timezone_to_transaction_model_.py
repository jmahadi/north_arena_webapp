"""Add timezone to transaction model created at

Revision ID: 8dab3b4a1358
Revises: b5c1c4ee063e
Create Date: 2024-08-10 16:40:42.193064

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '8dab3b4a1358'
down_revision: Union[str, None] = 'b5c1c4ee063e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Create a temporary column
    op.add_column('transactions', sa.Column('temp_created_at', sa.DateTime(timezone=True), nullable=True))
    
    # Copy data from the old column to the new one
    op.execute("UPDATE transactions SET temp_created_at = created_at AT TIME ZONE 'UTC'")
    
    # Drop the old column
    op.drop_column('transactions', 'created_at')
    
    # Rename the new column
    op.alter_column('transactions', 'temp_created_at', new_column_name='created_at')
    
    # Make the column non-nullable and set the server default
    op.alter_column('transactions', 'created_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=False,
               server_default=sa.text('NOW()'))
    
    # Update the updated_at column
    op.alter_column('transactions', 'updated_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=True,
               server_default=None)

def downgrade():
    # Revert the changes if needed
    op.alter_column('transactions', 'created_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=True,
               server_default=None)
    op.alter_column('transactions', 'updated_at',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               nullable=True,
               server_default=None)