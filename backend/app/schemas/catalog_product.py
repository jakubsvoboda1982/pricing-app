from pydantic import BaseModel
from typing import Optional
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


class CatalogProductResponse(BaseModel):
    id: UUID
    name: str
    ean: Optional[str]
    category: Optional[str]
    manufacturer: Optional[str]
    price_without_vat: Optional[Decimal]
    purchase_price: Optional[Decimal]
    vat_rate: Optional[Decimal]
    quantity_in_stock: Optional[int]
    unit_of_measure: str
    is_active: bool
    created_at: datetime
    imported_at: datetime

    class Config:
        from_attributes = True


class CatalogProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price_without_vat: Optional[Decimal] = None
    is_active: Optional[bool] = None
