from sqlalchemy import Column, String, DateTime, ForeignKey, Numeric, Index, Integer
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base

class SeasonalityRule(Base):
    """Sezónní pravidla pro úpravu cen podle měsíců"""
    __tablename__ = "seasonality_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)

    # Aplikace na kategorii nebo konkrétní produkt
    category = Column(String, nullable=True)  # Kategorie produktů
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)

    # Měsíc (1-12)
    month = Column(Integer, nullable=False)  # Měsíc v roce (1-12)

    # Multiplikátor ceny (např. 1.2 = +20%)
    price_multiplier = Column(Numeric(5, 3), nullable=False)  # 0.8 až 1.5

    # Typ sezóny
    season_type = Column(String, default="normal")  # "peak", "off-peak", "normal"

    # Popisy
    name = Column(String, nullable=True)  # Např. "Vánoce", "Letní výprodej"
    description = Column(String, nullable=True)

    # Metadata
    is_active = Column(String, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("ix_seasonality_company_month", "company_id", "month"),
        Index("ix_seasonality_category_month", "category", "month"),
    )
