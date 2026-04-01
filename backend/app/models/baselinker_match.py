import uuid
from sqlalchemy import Column, String, ForeignKey, UniqueConstraint, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class BaselinkerProductMatch(Base):
    """Ruční párování: produkt z Baselinker ↔ sledovaný produkt v systému."""
    __tablename__ = "baselinker_product_matches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    bl_product_id = Column(String, nullable=False)   # ID produktu v Baselinker (číslo jako string)
    bl_sku = Column(String, nullable=True)
    bl_ean = Column(String, nullable=True)
    bl_name = Column(String, nullable=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product", foreign_keys=[product_id])

    __table_args__ = (
        UniqueConstraint("company_id", "bl_product_id", name="uq_bl_match_company_product"),
    )
