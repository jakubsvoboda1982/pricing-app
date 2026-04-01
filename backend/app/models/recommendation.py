from sqlalchemy import Column, String, DateTime, ForeignKey, Numeric, Text, Index
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database import Base

class PriceRecommendation(Base):
    """Doporučení cen na základě analýzy konkurence a elasticity"""
    __tablename__ = "price_recommendations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)

    # Doporučené ceny
    recommended_price_without_vat = Column(Numeric(12, 2), nullable=False)  # Cena bez DPH
    recommended_price_with_vat = Column(Numeric(12, 2), nullable=False)      # Cena s DPH

    # Zdůvodnění
    reasoning = Column(JSON, nullable=True)  # {elasticity, competitors_avg, margin, confidence}

    # Aktuální vs doporučení
    current_price_with_vat = Column(Numeric(12, 2), nullable=True)
    margin_change_percent = Column(Numeric(5, 2), nullable=True)
    expected_revenue_impact_percent = Column(Numeric(7, 2), nullable=True)

    # Status workflow
    status = Column(String, default="pending", nullable=False)  # pending, approved, rejected, applied

    # Tvůrce a schvalovatel
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    applied_at = Column(DateTime(timezone=True), nullable=True)

    # Indexy
    __table_args__ = (
        Index("ix_recommendations_company_status", "company_id", "status"),
        Index("ix_recommendations_product_status", "product_id", "status"),
    )
