"""Commission & Payroll: staff_commissions, payroll_cycles, payroll_items

Revision ID: 0007_commission_payroll
Revises: 0006_staff_payroll
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = "0007_commission_payroll"
down_revision = "0006_staff_payroll"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create payrollcyclestatus ENUM (new — PENDING/PROCESSING/PAID)
    payrollcyclestatus = sa.Enum("pending", "processing", "paid", name="payrollcyclestatus")
    payrollcyclestatus.create(op.get_bind(), checkfirst=True)

    # 2. staff_commissions: history of commission rate changes
    op.create_table(
        "staff_commissions",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("staff_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("commission_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["staff_id"], ["staff.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["staff.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_staff_commissions_staff_id",   "staff_commissions", ["staff_id"])
    op.create_index("idx_staff_commissions_effective",  "staff_commissions", ["effective_from"])

    # 3. payroll_cycles: one record per payroll period
    op.create_table(
        "payroll_cycles",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "cycle_type",
            sa.Enum("weekly", "monthly", "quarterly", name="paymentcycle", create_type=False),
            nullable=False,
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date",   sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "processing", "paid", name="payrollcyclestatus", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("total_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("paid_at",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("note",       sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["staff.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_payroll_cycles_status",     "payroll_cycles", ["status"])
    op.create_index("idx_payroll_cycles_start_date", "payroll_cycles", ["start_date"])

    # 4. payroll_items: per-staff record within a cycle
    op.create_table(
        "payroll_items",
        sa.Column("id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("payroll_cycle_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("staff_id",         pg.UUID(as_uuid=True), nullable=False),
        sa.Column("gross_revenue",    sa.Integer(), nullable=False),
        sa.Column("commission_rate",  sa.Numeric(5, 2), nullable=False),
        sa.Column("commission_amount", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "paid", name="paymentstatus", create_type=False),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("note",    sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["payroll_cycle_id"], ["payroll_cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_id"], ["staff.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_payroll_items_cycle_id", "payroll_items", ["payroll_cycle_id"])
    op.create_index("idx_payroll_items_staff_id", "payroll_items", ["staff_id"])
    op.create_index("idx_payroll_items_status",   "payroll_items", ["status"])


def downgrade() -> None:
    op.drop_index("idx_payroll_items_status",   "payroll_items")
    op.drop_index("idx_payroll_items_staff_id", "payroll_items")
    op.drop_index("idx_payroll_items_cycle_id", "payroll_items")
    op.drop_table("payroll_items")

    op.drop_index("idx_payroll_cycles_start_date", "payroll_cycles")
    op.drop_index("idx_payroll_cycles_status",     "payroll_cycles")
    op.drop_table("payroll_cycles")

    op.drop_index("idx_staff_commissions_effective", "staff_commissions")
    op.drop_index("idx_staff_commissions_staff_id",  "staff_commissions")
    op.drop_table("staff_commissions")

    sa.Enum(name="payrollcyclestatus").drop(op.get_bind(), checkfirst=True)
