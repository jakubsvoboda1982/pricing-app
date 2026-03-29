from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Integer
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database import Base


class Competitor(Base):
    """Sledovaní konkurenti s metadatou a kontaktními informacemi"""
    __tablename__ = "competitors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)

    # Základní informace
    name = Column(String, nullable=False)
    url = Column(String, nullable=False, unique=True, index=True)
    logo_url = Column(String, nullable=True)
    category = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    # Kontaktní informace
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    country = Column(String, nullable=True)

    # Metadata scrapingu
    first_scrape_date = Column(DateTime(timezone=True), nullable=True)
    last_scrape_date = Column(DateTime(timezone=True), nullable=True)
    scrape_data = Column(JSON, nullable=True)  # Surová data z poslední scrapingu
    scrape_error = Column(String, nullable=True)  # Chyba z poslední scrapingu

    # Stav
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)  # Ověřeno uživatelem
    scrape_attempts = Column(Integer, default=0)
    scrape_failures = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
