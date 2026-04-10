from pydantic import BaseModel
from typing import Optional, List, Any, Dict
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
    stock_divisor: Optional[int] = None


class PriceCreate(BaseModel):
    market: str = "CZ"
    currency: str = "CZK"
    current_price: Decimal
    old_price: Optional[Decimal] = None


class PriceUpdate(BaseModel):
    current_price: Optional[Decimal] = None
    old_price: Optional[Decimal] = None


class CompetitorProductPriceResponse(BaseModel):
    """Competitor price tracking for a single URL"""
    id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    competitor_url: str
    variant_label: Optional[str] = None
    price: Optional[Decimal] = None  # Price with VAT
    currency: str = "CZK"
    market: str = "CZ"
    last_fetched_at: Optional[datetime] = None
    next_update_at: Optional[datetime] = None
    fetch_status: Optional[str] = None  # 'success' | 'error' | 'pending'
    fetch_error: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProductResponse(BaseModel):
    id: UUID
    name: str
    sku: str
    product_code: Optional[str] = None  # PRODUCTNO z XML feedu
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
    currency: Optional[str] = None  # CZK / EUR / HUF
    # Cenotvorba - purchase price without VAT + VAT rate
    purchase_price_without_vat: Optional[Decimal] = None
    purchase_vat_rate: Optional[Decimal] = None  # Default 12 for CZ
    manufacturing_cost: Optional[Decimal] = None
    min_price: Optional[Decimal] = None
    # Vypočítané hodnoty
    purchase_price_with_vat: Optional[Decimal] = None  # Computed: purchase_price_without_vat * (1 + purchase_vat_rate/100)
    margin: Optional[Decimal] = None       # Marže v % = (current - purchase_with_vat) / current * 100
    margin_by_market: Optional[Dict[str, float]] = None  # {CZ: 12.0, SK: 35.9} — marže per trh
    hero_score: Optional[int] = None       # 0–100
    lowest_competitor_price: Optional[Decimal] = None  # Minimální cena od konkurence (s DPH)
    competitor_products: Optional[List[CompetitorProductPriceResponse]] = None  # Ceny od jednotlivých konkurentů
    stock_quantity: Optional[int] = None  # Skladovost z Baselinker
    # Katalogová data (z XML feedu / CatalogProduct)
    manufacturer: Optional[str] = None
    catalog_price_vat: Optional[Decimal] = None   # Katalogová cena s DPH (price_without_vat * (1 + vat_rate/100))
    catalog_quantity_in_stock: Optional[int] = None  # Sklad z katalogu (XML feedu)
    # Názvy produktu z XML feedů v jiných trzích: {"SK": "Kešu ořechy 1kg SK", "HU": "..."}
    market_names: Optional[Dict[str, Any]] = None
    # Per-market atributy stažené z URL: {"SK": {"description": "...", "ingredients": "..."}, ...}
    market_attributes: Optional[Dict[str, Any]] = None
    own_market_urls: Optional[Dict[str, Any]] = None
    stock_divisor: Optional[int] = 1
    prices_by_market: Optional[Dict[str, Any]] = None  # {CZ: {price, currency}, SK: {price, currency}}
    manufacturing_cost_with_vat: Optional[Decimal] = None
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
