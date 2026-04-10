from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base


class CompetitorProductPrice(Base):
    """Tracks competitor prices for specific product URLs with weekly updates"""
    __tablename__ = "competitor_product_prices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    # Competitor URL from product.competitor_urls
    competitor_url = Column(String, nullable=False)

    # Variant info — which specific variant is tracked (e.g. "100g / Čokoláda")
    variant_label = Column(String(200), nullable=True)

    # Price information
    price = Column(Numeric(12, 2), nullable=True)  # Price with VAT
    currency = Column(String, default="CZK", nullable=False)
    market = Column(String, default="CZ", nullable=False)

    # Fetching metadata
    last_fetched_at = Column(DateTime(timezone=True), nullable=True)
    next_update_at = Column(DateTime(timezone=True), nullable=True)  # When to fetch next (weekly)
    fetch_status = Column(String, default="pending", nullable=True)  # 'success' | 'error' | 'pending'
    fetch_error = Column(String(500), nullable=True)  # Error message if fetch failed

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Constraints and indexes
    __table_args__ = (
        UniqueConstraint("product_id", "competitor_url", name="uq_product_url"),
        Index("ix_competitor_prices_next_update", "next_update_at"),
        Index("ix_competitor_prices_product_id", "product_id"),
    )


class CompetitorPriceHistory(Base):
    """Historical record of competitor price changes for trending/analytics"""
    __tablename__ = "competitor_price_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_price_id = Column(UUID(as_uuid=True), ForeignKey("competitor_product_prices.id", ondelete="CASCADE"), nullable=False, index=True)

    # Price at this point in time
    price = Column(Numeric(12, 2), nullable=False)

    # When this price was recorded
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())

    # Indexes for fast queries
    __table_args__ = (
        Index("ix_competitor_price_history_price_id", "competitor_price_id"),
        Index("ix_competitor_price_history_recorded", "recorded_at"),
    )
