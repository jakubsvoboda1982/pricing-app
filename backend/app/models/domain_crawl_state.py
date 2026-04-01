from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, Numeric
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base


class DomainCrawlState(Base):
    """
    Per-domain anti-ban stav.
    Sleduje cooldown, chyby, blokace a robots.txt per doména.
    """
    __tablename__ = "domain_crawl_states"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain = Column(String(255), nullable=False, unique=True, index=True)

    # Robots a timing
    robots_txt_snapshot = Column(Text, nullable=True)
    last_request_at = Column(DateTime(timezone=True), nullable=True)
    current_cooldown_until = Column(DateTime(timezone=True), nullable=True)

    # Čítače chyb (reset při úspěchu)
    consecutive_errors = Column(Integer, default=0, nullable=False)
    consecutive_403 = Column(Integer, default=0, nullable=False)
    consecutive_429 = Column(Integer, default=0, nullable=False)
    suspicious_response_count = Column(Integer, default=0, nullable=False)

    # Celkové statistiky
    total_requests = Column(Integer, default=0, nullable=False)
    total_errors = Column(Integer, default=0, nullable=False)

    # Stav blokace
    last_block_reason = Column(String(200), nullable=True)
    is_blocked = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
