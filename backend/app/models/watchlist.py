from sqlalchemy import Column, DateTime, ForeignKey, Index, UniqueConstraint, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base

class WatchedProduct(Base):
    """Watchlist - sledované produkty s vlastními sloupci a upozorněním"""
    __tablename__ = "watched_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # Může být přidáno uživatelem

    # Metadata
    is_price_alert_enabled = Column(Boolean, default=True)
    is_stock_alert_enabled = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    added_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("product_id", "company_id", name="uq_watched_product_company"),
        Index("ix_watched_company_user", "company_id", "user_id"),
    )
