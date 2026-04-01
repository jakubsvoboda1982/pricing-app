from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.database import get_db
from app.models import HeroScore, Product
from app.middleware.auth import verify_token

router = APIRouter(prefix="/api/hero", tags=["hero"])


class HeroScoreRequest(BaseModel):
    product_id: str
    traffic_score: float
    conversion_score: float
    repeat_purchase_score: float
    cross_sell_score: float
    margin_score: float


class HeroScoreResponse(BaseModel):
    id: str
    product_id: str
    traffic_score: float
    conversion_score: float
    repeat_purchase_score: float
    cross_sell_score: float
    margin_score: float
    total_score: float
    recommendations: Optional[dict]
    calculated_at: datetime

    model_config = {"from_attributes": True}


@router.post("/calculate")
def calculate_hero_score(
    data: HeroScoreRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vypočítej hero skóre produktu"""
    try:
        pid = UUID(data.product_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID produktu")

    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    # Výpočet celkového skóre (průměr 5 kritérií)
    total = (
        data.traffic_score + data.conversion_score + data.repeat_purchase_score +
        data.cross_sell_score + data.margin_score
    ) / 5

    recommendations = {
        "visibility": "Zvýšit viditelnost v kampaních" if data.traffic_score > 70 else "Zlepšit SEO",
        "pricing": "Zvýšit cenu" if data.margin_score > 75 else "Zvážit slevu",
        "campaigns": ["Email marketing", "Bannery", "Sociální sítě"] if data.repeat_purchase_score > 60 else [],
    }

    hero = HeroScore(
        company_id=product.company_id,
        product_id=pid,
        traffic_score=Decimal(str(data.traffic_score)),
        conversion_score=Decimal(str(data.conversion_score)),
        repeat_purchase_score=Decimal(str(data.repeat_purchase_score)),
        cross_sell_score=Decimal(str(data.cross_sell_score)),
        margin_score=Decimal(str(data.margin_score)),
        total_score=Decimal(str(total)),
        recommendations=recommendations,
    )
    db.add(hero)
    db.commit()
    db.refresh(hero)

    return HeroScoreResponse.model_validate(hero)


@router.get("/products")
def list_hero_products(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vypiš hero produkty seřazené podle skóre"""
    heroes = db.query(HeroScore).order_by(desc(HeroScore.total_score)).limit(100).all()
    return [HeroScoreResponse.model_validate(h) for h in heroes]


@router.get("/{product_id}")
def get_hero_score(
    product_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Načti hero skóre produktu"""
    try:
        pid = UUID(product_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    hero = db.query(HeroScore).filter(HeroScore.product_id == pid).first()
    if not hero:
        raise HTTPException(status_code=404, detail="Hero skóre nenalezeno")

    return HeroScoreResponse.model_validate(hero)
