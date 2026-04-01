from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime

from app.database import get_db
from app.models import SeasonalityRule, User
from app.middleware.auth import verify_token

router = APIRouter(prefix="/api/seasonality", tags=["seasonality"])


class SeasonalityRuleCreate(BaseModel):
    category: Optional[str] = None
    product_id: Optional[str] = None
    month: int
    price_multiplier: float
    season_type: str = "normal"
    name: Optional[str] = None
    description: Optional[str] = None


class SeasonalityRuleResponse(BaseModel):
    id: str
    category: Optional[str]
    product_id: Optional[str]
    month: int
    price_multiplier: float
    season_type: str
    name: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/rules")
def create_seasonality_rule(
    data: SeasonalityRuleCreate,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vytvoř sezónní pravidlo"""
    if not (1 <= data.month <= 12):
        raise HTTPException(status_code=400, detail="Měsíc musí být 1-12")

    if not (0.5 <= data.price_multiplier <= 2.0):
        raise HTTPException(status_code=400, detail="Multiplikátor musí být 0.5-2.0")

    rule = SeasonalityRule(
        category=data.category,
        product_id=UUID(data.product_id) if data.product_id else None,
        month=data.month,
        price_multiplier=Decimal(str(data.price_multiplier)),
        season_type=data.season_type,
        name=data.name,
        description=data.description,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    return SeasonalityRuleResponse.model_validate(rule)


@router.get("/rules")
def list_seasonality_rules(
    category: Optional[str] = None,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vypiš sezónní pravidla"""
    query = db.query(SeasonalityRule)

    if category:
        query = query.filter(SeasonalityRule.category == category)

    rules = query.order_by(SeasonalityRule.month).all()
    return [SeasonalityRuleResponse.model_validate(r) for r in rules]


@router.get("/calendar")
def get_seasonality_calendar(
    category: Optional[str] = None,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Načti roční kalendář sezónnosti"""
    query = db.query(SeasonalityRule)

    if category:
        query = query.filter(SeasonalityRule.category == category)

    rules = query.all()

    calendar = {}
    months = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
              "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"]

    for month in range(1, 13):
        month_rule = next((r for r in rules if r.month == month), None)
        calendar[month] = {
            "month_name": months[month - 1],
            "month": month,
            "multiplier": float(month_rule.price_multiplier) if month_rule else 1.0,
            "season_type": month_rule.season_type if month_rule else "normal",
            "name": month_rule.name if month_rule else None,
        }

    return calendar


@router.delete("/rules/{rule_id}")
def delete_seasonality_rule(
    rule_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Smaž sezónní pravidlo"""
    try:
        rid = UUID(rule_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    rule = db.query(SeasonalityRule).filter(SeasonalityRule.id == rid).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Pravidlo nenalezeno")

    db.delete(rule)
    db.commit()

    return {"message": "Pravidlo smazáno"}
