from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import datetime

from app.database import get_db
from app.models import SeasonalityRule, User
from app.middleware.auth import verify_token

router = APIRouter(prefix="/api/seasonality", tags=["seasonality"])

MONTH_NAMES = [
    "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec",
]


class SeasonalityRuleCreate(BaseModel):
    category: Optional[str] = None
    product_id: Optional[str] = None
    month: int
    price_multiplier: float
    season_type: str = "normal"   # peak | off-peak | normal
    name: Optional[str] = None
    description: Optional[str] = None


class SeasonalityRuleUpdate(BaseModel):
    price_multiplier: Optional[float] = None
    season_type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class SeasonalityRuleResponse(BaseModel):
    id: str
    category: Optional[str]
    product_id: Optional[str]
    month: int
    month_name: str
    price_multiplier: float
    season_type: str
    name: Optional[str]
    description: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


def _rule_to_resp(rule: SeasonalityRule) -> dict:
    return {
        "id": str(rule.id),
        "category": rule.category,
        "product_id": str(rule.product_id) if rule.product_id else None,
        "month": rule.month,
        "month_name": MONTH_NAMES[rule.month - 1],
        "price_multiplier": float(rule.price_multiplier),
        "season_type": rule.season_type,
        "name": rule.name,
        "description": rule.description,
        "is_active": bool(rule.is_active),
        "created_at": rule.created_at,
    }


def _get_company_id(payload: dict, db: Session) -> UUID:
    user_id = UUID(payload.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Uživatel nenalezen")
    return user.company_id


@router.post("/rules")
def create_seasonality_rule(
    data: SeasonalityRuleCreate,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vytvoř sezónní pravidlo."""
    if not (1 <= data.month <= 12):
        raise HTTPException(status_code=400, detail="Měsíc musí být 1–12")
    if not (0.3 <= data.price_multiplier <= 3.0):
        raise HTTPException(status_code=400, detail="Multiplikátor musí být 0.3–3.0")

    company_id = _get_company_id(payload, db)

    # Nahraď existující pravidlo pro stejný měsíc+kategorii
    existing = db.query(SeasonalityRule).filter(
        SeasonalityRule.company_id == company_id,
        SeasonalityRule.month == data.month,
        SeasonalityRule.category == data.category,
        SeasonalityRule.product_id == (UUID(data.product_id) if data.product_id else None),
    ).first()

    if existing:
        existing.price_multiplier = Decimal(str(data.price_multiplier))
        existing.season_type = data.season_type
        existing.name = data.name
        existing.description = data.description
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return _rule_to_resp(existing)

    rule = SeasonalityRule(
        company_id=company_id,
        category=data.category,
        product_id=UUID(data.product_id) if data.product_id else None,
        month=data.month,
        price_multiplier=Decimal(str(data.price_multiplier)),
        season_type=data.season_type,
        name=data.name,
        description=data.description,
        is_active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_to_resp(rule)


@router.get("/rules")
def list_seasonality_rules(
    category: Optional[str] = None,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vypiš sezónní pravidla."""
    company_id = _get_company_id(payload, db)
    query = db.query(SeasonalityRule).filter(SeasonalityRule.company_id == company_id)
    if category:
        query = query.filter(SeasonalityRule.category == category)
    rules = query.order_by(SeasonalityRule.month).all()
    return [_rule_to_resp(r) for r in rules]


@router.put("/rules/{rule_id}")
def update_seasonality_rule(
    rule_id: str,
    data: SeasonalityRuleUpdate,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Aktualizuj sezónní pravidlo."""
    try:
        rid = UUID(rule_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    company_id = _get_company_id(payload, db)
    rule = db.query(SeasonalityRule).filter(
        SeasonalityRule.id == rid,
        SeasonalityRule.company_id == company_id,
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Pravidlo nenalezeno")

    if data.price_multiplier is not None:
        if not (0.3 <= data.price_multiplier <= 3.0):
            raise HTTPException(status_code=400, detail="Multiplikátor musí být 0.3–3.0")
        rule.price_multiplier = Decimal(str(data.price_multiplier))
    if data.season_type is not None:
        rule.season_type = data.season_type
    if data.name is not None:
        rule.name = data.name
    if data.description is not None:
        rule.description = data.description
    if data.is_active is not None:
        rule.is_active = data.is_active

    db.commit()
    db.refresh(rule)
    return _rule_to_resp(rule)


@router.delete("/rules/{rule_id}")
def delete_seasonality_rule(
    rule_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Smaž sezónní pravidlo."""
    try:
        rid = UUID(rule_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    company_id = _get_company_id(payload, db)
    rule = db.query(SeasonalityRule).filter(
        SeasonalityRule.id == rid,
        SeasonalityRule.company_id == company_id,
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Pravidlo nenalezeno")

    db.delete(rule)
    db.commit()
    return {"message": "Pravidlo smazáno"}


@router.get("/calendar")
def get_seasonality_calendar(
    category: Optional[str] = None,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Načti roční kalendář sezónnosti pro danou firmu."""
    company_id = _get_company_id(payload, db)
    query = db.query(SeasonalityRule).filter(
        SeasonalityRule.company_id == company_id,
        SeasonalityRule.is_active == True,
    )
    if category:
        query = query.filter(SeasonalityRule.category == category)
    rules = query.all()

    calendar = {}
    for month in range(1, 13):
        rule = next((r for r in rules if r.month == month), None)
        calendar[str(month)] = {
            "month": month,
            "month_name": MONTH_NAMES[month - 1],
            "multiplier": float(rule.price_multiplier) if rule else 1.0,
            "season_type": rule.season_type if rule else "normal",
            "name": rule.name if rule else None,
            "rule_id": str(rule.id) if rule else None,
        }
    return calendar
