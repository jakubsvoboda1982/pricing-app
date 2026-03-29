from pydantic import BaseModel, HttpUrl
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
    last_checked: datetime

    class Config:
        from_attributes = True


class CompetitorRankResponse(BaseModel):
    id: UUID
    rank: int
    positioning: str
    category_rank: Optional[int]
    score_reason: Optional[str]
    evaluated_at: datetime

    class Config:
        from_attributes = True


class CompetitorAlertResponse(BaseModel):
    id: UUID
    alert_type: str
    title: str
    description: Optional[str]
    alert_data: Optional[dict]
    is_read: bool
    severity: str
    created_at: datetime
    dismissed_at: Optional[datetime]

    class Config:
        from_attributes = True


class CompetitorCreate(BaseModel):
    """Vytvoření nového konkurenta - vyžaduje URL a trh"""
    url: str  # URL webových stránek konkurenta
    market: str = "CZ"  # CZ nebo SK


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
    logo_url: Optional[str]
    category: Optional[str]
    market: str = "CZ"
    description: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    country: Optional[str]
    is_active: bool
    is_verified: bool
    first_scrape_date: Optional[datetime]
    last_scrape_date: Optional[datetime]
    scrape_error: Optional[str]
    scrape_attempts: int
    scrape_failures: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CompetitorDetailResponse(BaseModel):
    """Detailní informace s cenou, rankingem a upozorněními"""
    competitor: CompetitorResponse
    latest_price: Optional[CompetitorPriceResponse]
    latest_rank: Optional[CompetitorRankResponse]
    unread_alerts: List[CompetitorAlertResponse]
    recent_prices: List[CompetitorPriceResponse]  # Posledních N cen

    class Config:
        from_attributes = True


class CompetitorListResponse(BaseModel):
    """Konkurent v seznamu - stručnější verze"""
    id: UUID
    name: str
    url: str
    logo_url: Optional[str]
    category: Optional[str]
    market: str = "CZ"
    is_active: bool
    last_scrape_date: Optional[datetime]
    scrape_error: Optional[str]
    latest_price: Optional[Decimal]
    latest_rank: Optional[int]
    unread_alerts_count: int

    class Config:
        from_attributes = True
