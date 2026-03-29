from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Numeric, Integer, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base


class CatalogProduct(Base):
    """Katalog všech dostupných produktů k importu"""
    __tablename__ = "catalog_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)

    # Identifikátory
    ean = Column(String, nullable=True, index=True)
    isbn = Column(String, nullable=True)
    product_code = Column(String, nullable=True, index=True)  # PRODUCTNO z Heureka XML

    # Základní info
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    # Ceny
    price_without_vat = Column(Numeric(10, 2), nullable=True)  # Cena bez DPH
    purchase_price = Column(Numeric(10, 2), nullable=True)  # Nákupní cena
    vat_rate = Column(Numeric(5, 2), nullable=True)  # Sazba DPH [%]

    # Sklad
    quantity_in_stock = Column(Integer, nullable=True)  # Počet v skladě
    unit_of_measure = Column(String, default="ks", nullable=False)  # M. j.

    # Trh/Region
    market = Column(String(10), default="CZ", nullable=False, index=True)  # CZ, SK

    # Odkazy a média
    thumbnail_url = Column(String(500), nullable=True)  # Obrázek z feedu
    url_reference = Column(String(500), nullable=True)  # Odkaz na produkt u dodavatele

    # Stav
    is_active = Column(Boolean, default=True)
    imported_from = Column(String(50), nullable=True)  # Zdroj: heureka_cz, heureka_sk, atd.

    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    imported_at = Column(DateTime(timezone=True), server_default=func.now())

    # Unikátní identifikátor v katalogu
    catalog_identifier = Column(String, nullable=True, unique=True)
