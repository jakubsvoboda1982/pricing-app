from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.database import get_db
from app.models import PriceRecommendation, Product, User
from app.middleware.auth import verify_token

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


class RecommendationCreate(BaseModel):
    product_id: str
    recommended_price_without_vat: float
    recommended_price_with_vat: float
    reasoning: Optional[dict] = None


class RecommendationUpdate(BaseModel):
    status: str  # approved, rejected, applied
    override_price_with_vat: Optional[float] = None


class RecommendationResponse(BaseModel):
    id: str
    product_id: str
    recommended_price_without_vat: float
    recommended_price_with_vat: float
    current_price_with_vat: Optional[float]
    margin_change_percent: Optional[float]
    expected_revenue_impact_percent: Optional[float]
    status: str
    reasoning: Optional[dict]
    created_by: Optional[str]
    approved_by: Optional[str]
    created_at: datetime
    approved_at: Optional[datetime]
    applied_at: Optional[datetime]

    model_config = {"from_attributes": True}


def _calculate_recommendation(product: Product) -> dict:
    """Výpočet doporučené ceny na základě konkurence a marže"""
    # Základní logika - lze rozšířit o analýzu konkurence
    current_margin_percent = 25  # default
    elasticity = -0.8

    recommended_without_vat = product.purchase_price_without_vat * Decimal("1.35") if product.purchase_price_without_vat else Decimal("100")
    recommended_with_vat = recommended_without_vat * Decimal("1.12")

    current_with_vat = product.min_price or Decimal("0")
    margin_change = float(recommended_with_vat - current_with_vat) if current_with_vat else 0

    reasoning = {
        "elasticity": elasticity,
        "margin_target": current_margin_percent,
        "confidence": 0.7,
        "based_on": "purchase_price",
    }

    return {
        "recommended_without_vat": float(recommended_without_vat),
        "recommended_with_vat": float(recommended_with_vat),
        "reasoning": reasoning,
        "margin_change": margin_change,
    }


@router.post("/generate/{product_id}")
def generate_recommendation(
    product_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vygeneruj doporučení ceny pro produkt"""
    try:
        pid = UUID(product_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID produktu")

    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    user_id = UUID(payload.get("sub"))
    calc = _calculate_recommendation(product)

    recommendation = PriceRecommendation(
        company_id=product.company_id,
        product_id=pid,
        recommended_price_without_vat=Decimal(str(calc["recommended_without_vat"])),
        recommended_price_with_vat=Decimal(str(calc["recommended_with_vat"])),
        current_price_with_vat=product.min_price,
        margin_change_percent=Decimal(str(calc["margin_change"])),
        expected_revenue_impact_percent=Decimal("5.0"),
        reasoning=calc["reasoning"],
        created_by=user_id,
        status="pending",
    )
    db.add(recommendation)
    db.commit()
    db.refresh(recommendation)

    return RecommendationResponse.model_validate(recommendation)


@router.get("/{recommendation_id}")
def get_recommendation(
    recommendation_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Načti konkrétní doporučení"""
    try:
        rec_id = UUID(recommendation_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    rec = db.query(PriceRecommendation).filter(PriceRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Doporučení nenalezeno")

    return RecommendationResponse.model_validate(rec)


@router.get("")
def list_recommendations(
    status: Optional[str] = None,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vypiš doporučení (lze filtrovat dle statusu)"""
    query = db.query(PriceRecommendation)

    if status:
        query = query.filter(PriceRecommendation.status == status)

    recs = query.order_by(desc(PriceRecommendation.created_at)).all()
    return [RecommendationResponse.model_validate(r) for r in recs]


@router.post("/{recommendation_id}/approve")
def approve_recommendation(
    recommendation_id: str,
    update: RecommendationUpdate,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Schvál doporučení"""
    try:
        rec_id = UUID(recommendation_id)
        user_id = UUID(payload.get("sub"))
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    rec = db.query(PriceRecommendation).filter(PriceRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Doporučení nenalezeno")

    rec.status = "approved"
    rec.approved_by = user_id
    rec.approved_at = datetime.utcnow()

    if update.override_price_with_vat:
        rec.recommended_price_with_vat = Decimal(str(update.override_price_with_vat))

    db.commit()
    return {"message": "Doporučení schváleno"}


@router.post("/{recommendation_id}/reject")
def reject_recommendation(
    recommendation_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Zamítni doporučení"""
    try:
        rec_id = UUID(recommendation_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    rec = db.query(PriceRecommendation).filter(PriceRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Doporučení nenalezeno")

    rec.status = "rejected"
    db.commit()
    return {"message": "Doporučení zamítnuté"}


@router.post("/{recommendation_id}/apply")
def apply_recommendation(
    recommendation_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Aplikuj doporučenou cenu na produkt"""
    try:
        rec_id = UUID(recommendation_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    rec = db.query(PriceRecommendation).filter(PriceRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Doporučení nenalezeno")

    if rec.status != "approved":
        raise HTTPException(status_code=400, detail="Doporučení není schváleno")

    # Aplikuj cenu na produkt
    product = db.query(Product).filter(Product.id == rec.product_id).first()
    if product:
        product.min_price = rec.recommended_price_with_vat
        product.updated_at = datetime.utcnow()

    rec.status = "applied"
    rec.applied_at = datetime.utcnow()
    db.commit()

    return {"message": "Cena aplikována na produkt", "new_price": float(rec.recommended_price_with_vat)}
