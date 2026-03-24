"""add staff_activities table

Revision ID: 0005_staff_activity
Revises: 0004_staff_veno_password
Create Date: 2026-03-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_staff_activity"
down_revision = "0004_staff_veno_password"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_activities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("staff_id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(100), nullable=False, server_default="Đăng nhập"),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["staff_id"], ["staff.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_staff_activities_staff_id", "staff_activities", ["staff_id"])


def downgrade() -> None:
    op.drop_index("idx_staff_activities_staff_id", "staff_activities")
    op.drop_table("staff_activities")
