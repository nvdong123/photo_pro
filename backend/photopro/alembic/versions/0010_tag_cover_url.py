"""Add cover_url column to tags table

Revision ID: 0010_tag_cover_url
Revises: 0009_bundle_unique_photo_count
Create Date: 2026-03-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_tag_cover_url"
down_revision = "0009_bundle_unique_photo_count"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tags", sa.Column("cover_url", sa.String(2048), nullable=True))


def downgrade() -> None:
    op.drop_column("tags", "cover_url")
