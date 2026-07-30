"""Create events table

Revision ID: 002
Revises: 001
Create Date: 2026-07-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the events table."""
    op.create_table(
        "events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "install_id",
            sa.String(36),
            sa.ForeignKey("installs.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("event_type", sa.String(20), nullable=False, index=True),
        sa.Column("url", sa.Text, nullable=True),
        sa.Column("element_tag", sa.String(50), nullable=True),
        sa.Column("element_role", sa.String(50), nullable=True),
        sa.Column("element_aria_label", sa.String(200), nullable=True),
        sa.Column("element_id", sa.String(200), nullable=True),
        sa.Column("element_sensitive", sa.Boolean, nullable=True),
        sa.Column("coord_x", sa.Float, nullable=True),
        sa.Column("coord_y", sa.Float, nullable=True),
        sa.Column("scroll_depth", sa.Integer, nullable=True),
        sa.Column("nav_method", sa.String(20), nullable=True),
        sa.Column("event_timestamp", sa.Integer, nullable=True),
        sa.Column("metadata", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    """Drop the events table."""
    op.drop_table("events")
