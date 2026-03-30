from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from uuid import UUID


class CompetitorPriceResponse(BaseModel):
    id: UUID
    product_name: str
    price: Decimal
    currency: str
    market: str
    recorded_at: datetime
    last_checked: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CompetitorRankResponse(BaseModel):
    id: UUID
    rank: int
    positioning: str
    category_rank: Optional[int] = None
    score_reason: Optional[str] = None
    evaluated_at: datetime

    model_config = {"from_attributes": True}


class CompetitorAlertResponse(BaseModel):
    id: UUID
    alert_type: str
    title: str
    description: Optional[str] = None
    alert_data: Optional[dict] = None
    is_read: bool
    severity: str
    created_at: datetime
    dismissed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CompetitorCreate(BaseModel):
    """Vytvoření nového konkurenta - vyžaduje URL a trh"""
    url: str
    market: str = "CZ"


class CompetitorUpdate(BaseModel):
    """Aktualizace konkurenta - manuální editace"""
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


class CompetitorResponse(BaseModel):
    """Úplné informace o konkurentovi"""
    id: UUID
    name: str
    url: str
    logo_url: Optional[str] = None
    category: Optional[str] = None
    market: str = "CZ"
    description: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    country: Optional[str] = None
    is_active: bool
    is_verified: bool = False
    first_scrape_date: Optional[datetime] = None
    last_scrape_date: Optional[datetime] = None
    scrape_error: Optional[str] = None
    scrape_attempts: int = 0
    scrape_failures: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CompetitorDetailResponse(BaseModel):
    """Detailní informace s cenou, rankingem a upozorněními"""
    competitor: CompetitorResponse
    latest_price: Optional[CompetitorPriceResponse] = None
    latest_rank: Optional[CompetitorRankResponse] = None
    unread_alerts: List[CompetitorAlertResponse] = []
    recent_prices: List[CompetitorPriceResponse] = []

    model_config = {"from_attributes": True}


class CompetitorListResponse(BaseModel):
    """Konkurent v seznamu - stručnější verze"""
    id: UUID
    name: str
    url: str
    logo_url: Optional[str] = None
    category: Optional[str] = None
    market: str = "CZ"
    is_active: bool
    last_scrape_date: Optional[datetime] = None
    scrape_error: Optional[str] = None
    latest_price: Optional[Decimal] = None
    latest_rank: Optional[int] = None
    unread_alerts_count: int = 0

    model_config = {"from_attributes": True}
