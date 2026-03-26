"""Remove veno_password column from staff (Veno File Manager removed)

Revision ID: 0008_remove_veno_password
Revises: 0007_commission_payroll
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa

revision = "0008_remove_veno_password"
down_revision = "0007_commission_payroll"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("staff", "veno_password")


def downgrade() -> None:
    op.add_column("staff", sa.Column("veno_password", sa.String(100), nullable=True))
