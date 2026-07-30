"""Database models package.

Import all models here so Alembic can discover them for auto-generating
migrations.
"""

from app.models.install import Install  # noqa: F401
from app.models.event import Event  # noqa: F401
from app.models.screenshot import Screenshot, AIAnnotation  # noqa: F401
