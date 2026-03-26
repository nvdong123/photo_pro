"""add staff payroll: commission_rate on staff + staff_payments table

Revision ID: 0006_staff_payroll
Revises: 0005_staff_activity
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PgEnum

revision = "0006_staff_payroll"
down_revision = "0005_staff_activity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Create new ENUM types ─────────────────────────────────────────────
    paymentcycle_type = PgEnum("weekly", "monthly", "quarterly",
                               name="paymentcycle", create_type=False)
    paymentcycle_type.create(op.get_bind(), checkfirst=True)

    paymentstatus_type = PgEnum("pending", "paid",
                                name="paymentstatus", create_type=False)
    paymentstatus_type.create(op.get_bind(), checkfirst=True)

    # ── 2. Add commission_rate column to staff ───────────────────────────────
    op.add_column(
        "staff",
        sa.Column("commission_rate", sa.Numeric(5, 2), nullable=False, server_default="100.00"),
    )

    # ── 3. Create staff_payments table ───────────────────────────────────────
    op.create_table(
        "staff_payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("staff_id", sa.UUID(), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("cycle",
                  PgEnum("weekly", "monthly", "quarterly", name="paymentcycle", create_type=False),
                  nullable=False),
        sa.Column("gross_revenue", sa.Integer(), nullable=False),
        sa.Column("commission_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("net_amount", sa.Integer(), nullable=False),
        sa.Column("status",
                  PgEnum("pending", "paid", name="paymentstatus", create_type=False),
                  nullable=False, server_default="pending"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_by", sa.UUID(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["staff_id"], ["staff.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["paid_by"], ["staff.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_staff_payments_staff_id", "staff_payments", ["staff_id"])
    op.create_index("idx_staff_payments_period_start", "staff_payments", ["period_start"])
    op.create_index("idx_staff_payments_status", "staff_payments", ["status"])


def downgrade() -> None:
    op.drop_index("idx_staff_payments_status", "staff_payments")
    op.drop_index("idx_staff_payments_period_start", "staff_payments")
    op.drop_index("idx_staff_payments_staff_id", "staff_payments")
    op.drop_table("staff_payments")
    op.drop_column("staff", "commission_rate")
    PgEnum(name="paymentstatus").drop(op.get_bind(), checkfirst=True)
    PgEnum(name="paymentcycle").drop(op.get_bind(), checkfirst=True)
