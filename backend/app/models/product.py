from sqlalchemy import Column, String, Text, DateTime, ForeignKey, UniqueConstraint, Numeric
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid
from app.database import Base

class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("sku", "company_id", name="uq_sku_company"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    sku = Column(String, nullable=False, index=True)
    category = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    # Propojení s katalogem
    catalog_product_id = Column(UUID(as_uuid=True), ForeignKey("catalog_products.id"), nullable=True, index=True)
    ean = Column(String, nullable=True, index=True)
    thumbnail_url = Column(String(500), nullable=True)
    url_reference = Column(String(500), nullable=True)  # URL vlastního produktu

    # URL sledovaných produktů u konkurentů: [{"url": "...", "name": "Grizly.cz", "market": "CZ"}]
    competitor_urls = Column(JSON, nullable=True, default=list)

    # Cenotvorba
    purchase_price = Column(Numeric(12, 2), nullable=True)  # Nákupní cena
    min_price = Column(Numeric(12, 2), nullable=True)        # Minimální prodejní cena

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
