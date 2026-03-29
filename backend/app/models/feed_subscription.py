from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base


class FeedSubscription(Base):
    """Pravidelně načítané XML feedy (1x denně)"""
    __tablename__ = "feed_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)

    # Identifikace feedy
    name = Column(String, nullable=False)  # Uživatelský název
    feed_url = Column(String(1000), nullable=False)  # URL XML feedy
    market = Column(String(10), default="CZ", nullable=False)  # CZ nebo SK
    merge_existing = Column(Boolean, default=True)  # Aktualizovat existující

    # Stav
    is_active = Column(Boolean, default=True)

    # Výsledek posledního načtení
    last_fetched_at = Column(DateTime(timezone=True), nullable=True)
    last_fetch_status = Column(String(20), nullable=True)  # "success", "error"
    last_fetch_message = Column(String(500), nullable=True)
    last_imported_count = Column(Integer, default=0)
    last_updated_count = Column(Integer, default=0)

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
