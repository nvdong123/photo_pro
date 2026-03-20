"""bundle_pricing add is_popular

Revision ID: 0003_bundle_is_popular
Revises: 0002_staff_schema_v2
Create Date: 2026-03-20 00:00:00.000000

Changes:
- bundle_pricing: add is_popular (Boolean, default False)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_bundle_is_popular"
down_revision: Union[str, None] = "0002_staff_schema_v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bundle_pricing",
        sa.Column("is_popular", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("bundle_pricing", "is_popular")
