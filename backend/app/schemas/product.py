from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
from decimal import Decimal


class CompetitorUrlItem(BaseModel):
    url: str
    name: str
    market: str = "CZ"


class ProductCreate(BaseModel):
    name: str
    sku: str
    category: Optional[str] = None
    description: Optional[str] = None
    catalog_product_id: Optional[str] = None
    ean: Optional[str] = None
    thumbnail_url: Optional[str] = None
    url_reference: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    ean: Optional[str] = None
    thumbnail_url: Optional[str] = None
    url_reference: Optional[str] = None


class PriceCreate(BaseModel):
    market: str = "CZ"
    currency: str = "CZK"
    current_price: Decimal
    old_price: Optional[Decimal] = None


class PriceUpdate(BaseModel):
    current_price: Optional[Decimal] = None
    old_price: Optional[Decimal] = None


class ProductResponse(BaseModel):
    id: str
    name: str
    sku: str
    category: Optional[str]
    description: Optional[str]
    ean: Optional[str] = None
    thumbnail_url: Optional[str] = None
    url_reference: Optional[str] = None
    catalog_product_id: Optional[str] = None
    competitor_urls: Optional[List[Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PriceResponse(BaseModel):
    id: str
    product_id: str
    market: str
    currency: str
    current_price: Decimal
    old_price: Optional[Decimal]
    changed_at: datetime

    class Config:
        from_attributes = True
