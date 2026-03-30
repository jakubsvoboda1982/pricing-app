from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from uuid import UUID


class CatalogProductCreate(BaseModel):
    name: str
    ean: Optional[str] = None
    isbn: Optional[str] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    description: Optional[str] = None
    price_without_vat: Optional[Decimal] = None
    purchase_price: Optional[Decimal] = None
    vat_rate: Optional[Decimal] = None
    quantity_in_stock: Optional[int] = None
    unit_of_measure: str = "ks"
    is_active: bool = True


class CompetitorUrlInfo(BaseModel):
    url: str
    name: str
    market: str = "CZ"


class CatalogProductResponse(BaseModel):
    id: UUID
    name: str
    ean: Optional[str] = None
    category: Optional[str] = None
    manufacturer: Optional[str] = None
    price_without_vat: Optional[Decimal] = None
    price_vat: Optional[Decimal] = None          # Cena s DPH (computed)
    purchase_price: Optional[Decimal] = None
    vat_rate: Optional[Decimal] = None
    quantity_in_stock: Optional[int] = None
    unit_of_measure: str = "ks"
    market: Optional[str] = None
    thumbnail_url: Optional[str] = None
    url_reference: Optional[str] = None
    imported_from: Optional[str] = None
    is_active: bool = True
    # Propojení se sledovaným produktem
    watched_product_id: Optional[UUID] = None
    competitor_urls: Optional[List[CompetitorUrlInfo]] = None
    created_at: datetime
    imported_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CatalogProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price_without_vat: Optional[Decimal] = None
    is_active: Optional[bool] = None
