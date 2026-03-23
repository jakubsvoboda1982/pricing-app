from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base

class Price(Base):
    __tablename__ = "prices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)
    market = Column(String, default="CZ", nullable=False)  # CZ, SK, etc.
    currency = Column(String, default="CZK", nullable=False)
    current_price = Column(Numeric(12, 2), nullable=False)
    old_price = Column(Numeric(12, 2), nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
