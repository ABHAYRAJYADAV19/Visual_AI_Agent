"""Create screenshots and annotations tables

Revision ID: 003
Revises: 002
Create Date: 2026-07-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create screenshots and ai_annotations tables."""
    # Screenshots table
    op.create_table(
        "screenshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "install_id",
            sa.String(36),
            sa.ForeignKey("installs.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("s3_key", sa.String(255), nullable=False, unique=True),
        sa.Column("url", sa.Text, nullable=True),
        sa.Column("annotated", sa.Boolean, server_default=sa.text('false'), nullable=False, index=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # AI Annotations table
    op.create_table(
        "ai_annotations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "screenshot_id",
            sa.String(36),
            sa.ForeignKey("screenshots.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("activity_type", sa.String(50), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    """Drop screenshots and ai_annotations tables."""
    op.drop_table("ai_annotations")
    op.drop_table("screenshots")
