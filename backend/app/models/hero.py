from sqlalchemy import Column, String, DateTime, ForeignKey, Numeric, Index
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database import Base

class HeroScore(Base):
    """Hero produkty - multi-kriteriální skóre pro strategie"""
    __tablename__ = "hero_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)

    # Jednotlivé skóre (0-100)
    traffic_score = Column(Numeric(5, 2), default=0)                    # Návštěvnost
    conversion_score = Column(Numeric(5, 2), default=0)                 # Konverze
    repeat_purchase_score = Column(Numeric(5, 2), default=0)            # Opakované nákupy
    cross_sell_score = Column(Numeric(5, 2), default=0)                 # Cross-sell potenciál
    margin_score = Column(Numeric(5, 2), default=0)                     # Marže

    # Celkové skóre (0-100)
    total_score = Column(Numeric(5, 2), default=0)

    # Doporučení strategie
    recommendations = Column(JSON, nullable=True)  # {campaigns: [...], pricing: {...}, visibility: {...}}

    # Metadata
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("ix_hero_scores_company_total", "company_id", "total_score"),
    )
