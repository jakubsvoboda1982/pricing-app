from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Index
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database import Base


class CompetitorAlert(Base):
    """Upozornění a změny u konkurentů - notifikace pro uživatele"""
    __tablename__ = "competitor_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_id = Column(UUID(as_uuid=True), ForeignKey("competitors.id"), nullable=False, index=True)

    # Typ upozornění
    alert_type = Column(String, nullable=False)  # "price_change", "offline", "contact_updated", "new_product", atd.
    title = Column(String, nullable=False)  # Krátký popis upozornění
    description = Column(String, nullable=True)  # Detailní popis

    # Data z upozornění
    alert_data = Column(JSON, nullable=True)  # {old_value, new_value, change_percent, atd.}

    # Stav
    is_read = Column(Boolean, default=False)
    severity = Column(String, default="info")  # "info", "warning", "critical"

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    dismissed_at = Column(DateTime(timezone=True), nullable=True)

    # Index pro rychlejší dotazy
    __table_args__ = (
        Index("ix_competitor_alerts_competitor_read", "competitor_id", "is_read"),
    )
