from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
from decimal import Decimal
from uuid import UUID


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
    id: UUID
    name: str
    sku: str
    category: Optional[str] = None
    description: Optional[str] = None
    ean: Optional[str] = None
    thumbnail_url: Optional[str] = None
    url_reference: Optional[str] = None
    catalog_product_id: Optional[UUID] = None
    competitor_urls: Optional[List[Any]] = None
    # Latest price (enriched from prices table)
    current_price: Optional[Decimal] = None
    old_price: Optional[Decimal] = None
    market: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PriceResponse(BaseModel):
    id: UUID
    product_id: UUID
    market: str
    currency: str
    current_price: Decimal
    old_price: Optional[Decimal] = None
    changed_at: datetime

    model_config = {"from_attributes": True}
