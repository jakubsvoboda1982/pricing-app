from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.database import get_db
from app.models import PriceRecommendation, Product, User, Price
from app.models.competitor_product_price import CompetitorProductPrice
from app.middleware.auth import verify_token

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


class RecommendationUpdate(BaseModel):
    override_price_with_vat: Optional[float] = None


class RecommendationResponse(BaseModel):
    id: str
    product_id: str
    product_name: Optional[str] = None
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


def _get_current_price(product: Product, db: Session) -> Optional[float]:
    """Načti aktuální cenu z Price tabulky (CZ trh)."""
    last_price = (
        db.query(Price)
        .filter(Price.product_id == product.id, Price.market == "CZ")
        .order_by(Price.changed_at.desc())
        .first()
    )
    if last_price and last_price.current_price:
        return float(last_price.current_price)
    if product.min_price:
        return float(product.min_price)
    return None


def _get_competitor_avg(product: Product, db: Session) -> tuple[Optional[float], int]:
    """Vrátí průměr CZK cen konkurentů a jejich počet."""
    comp_prices = (
        db.query(CompetitorProductPrice)
        .filter(
            CompetitorProductPrice.product_id == product.id,
            CompetitorProductPrice.currency == "CZK",
            CompetitorProductPrice.price.isnot(None),
            CompetitorProductPrice.fetch_status == "success",
        )
        .all()
    )
    prices = [float(cp.price) for cp in comp_prices if cp.price]
    if not prices:
        return None, 0
    return round(sum(prices) / len(prices), 2), len(prices)


def _calculate_recommendation(product: Product, db: Session) -> dict:
    """Doporučení ceny na základě reálných dat: cena z Price tabulky + průměr konkurence."""
    current_price = _get_current_price(product, db)
    competitors_avg, comp_count = _get_competitor_avg(product, db)
    purchase_cost_with_vat = (
        float(product.purchase_price_without_vat) * 1.21
        if product.purchase_price_without_vat else None
    )
    min_floor = float(product.min_price) if product.min_price else None

    elasticity = -0.8
    confidence = 0.5
    rec_type = "minor_raise"
    reasoning_text = ""

    if current_price is None and purchase_cost_with_vat:
        # Cena není nastavena — doporuč 40% přirážku
        recommended_with_vat = purchase_cost_with_vat * 1.40
        rec_type = "set_price"
        reasoning_text = "Cena není nastavena, doporučuji 40% přirážku nad nákupní cenu s DPH"
        confidence = 0.5
    elif current_price is None:
        recommended_with_vat = 100.0
        rec_type = "no_data"
        reasoning_text = "Není dostatek dat pro výpočet doporučení"
        confidence = 0.2
    elif competitors_avg is not None:
        diff_pct = (current_price - competitors_avg) / competitors_avg * 100
        if diff_pct > 12:
            # Jsme výrazně nad trhem
            recommended_with_vat = competitors_avg * 1.04
            rec_type = "lower"
            reasoning_text = (
                f"Naše cena je o {diff_pct:.1f} % nad průměrem konkurence "
                f"({competitors_avg:.0f} Kč, {comp_count} obchody) — doporučuji snížit"
            )
            confidence = 0.82
        elif diff_pct < -8:
            # Jsme pod trhem — prostor pro zdražení
            recommended_with_vat = competitors_avg * 0.96
            rec_type = "raise"
            reasoning_text = (
                f"Naše cena je o {abs(diff_pct):.1f} % pod průměrem konkurence "
                f"({competitors_avg:.0f} Kč, {comp_count} obchody) — doporučuji zdražit"
            )
            confidence = 0.78
        else:
            # Blízko trhu — mírné zvýšení
            recommended_with_vat = current_price * 1.02
            rec_type = "minor_raise"
            reasoning_text = (
                f"Cena je blízko průměru trhu ({competitors_avg:.0f} Kč), "
                f"doporučuji mírné zvýšení +2 %"
            )
            confidence = 0.60
    elif purchase_cost_with_vat:
        # Žádná konkurenční data — cost-plus marže 35 %
        recommended_with_vat = purchase_cost_with_vat / 0.65
        rec_type = "cost_plus"
        reasoning_text = "Navrhovaná marže 35 % (bez konkurenčních dat)"
        confidence = 0.50
    else:
        # Bez dat — mírné zvýšení
        recommended_with_vat = current_price * 1.05
        rec_type = "minor_raise"
        reasoning_text = "Mírné zvýšení ceny (bez externích dat)"
        confidence = 0.35

    # Floor ochrana
    if min_floor and recommended_with_vat < min_floor:
        recommended_with_vat = min_floor
        rec_type = "floor_alert"
        reasoning_text += f" (upozornění: doporučená cena je pod minimální {min_floor:.0f} Kč)"

    recommended_without_vat = recommended_with_vat / 1.21
    margin_change = (
        (recommended_with_vat - current_price) / current_price * 100
        if current_price else 0.0
    )

    # Odhadovaný dopad na tržby
    price_change_pct = (
        (recommended_with_vat - current_price) / current_price * 100
        if current_price else 0.0
    )
    volume_change_pct = elasticity * price_change_pct
    revenue_impact = price_change_pct + volume_change_pct

    return {
        "recommended_without_vat": round(recommended_without_vat, 2),
        "recommended_with_vat": round(recommended_with_vat, 2),
        "current_price": current_price,
        "margin_change": round(margin_change, 2),
        "revenue_impact": round(revenue_impact, 2),
        "reasoning": {
            "type": rec_type,
            "text": reasoning_text,
            "elasticity": elasticity,
            "confidence": confidence,
            "current_price": current_price,
            "competitors_avg": competitors_avg,
            "competitors_count": comp_count,
        },
    }


def _rec_to_response(rec: PriceRecommendation, db: Session) -> dict:
    product = db.query(Product).filter(Product.id == rec.product_id).first()
    # Compute current margin for display (CZ market)
    current_margin = None
    if product and rec.current_price_with_vat:
        from app.api.products import _lower_cost_with_vat
        vat_rate = getattr(product, 'purchase_vat_rate', None) or Decimal('12.00')
        cost = _lower_cost_with_vat(
            getattr(product, 'purchase_price_without_vat', None),
            getattr(product, 'manufacturing_cost', None),
            vat_rate
        )
        if cost and rec.current_price_with_vat > 0:
            current_margin = round(float(
                (rec.current_price_with_vat - cost) / rec.current_price_with_vat * 100
            ), 1)
    return {
        "id": str(rec.id),
        "product_id": str(rec.product_id),
        "product_name": product.name if product else None,
        "current_margin": current_margin,
        "recommended_price_without_vat": float(rec.recommended_price_without_vat),
        "recommended_price_with_vat": float(rec.recommended_price_with_vat),
        "current_price_with_vat": float(rec.current_price_with_vat) if rec.current_price_with_vat else None,
        "margin_change_percent": float(rec.margin_change_percent) if rec.margin_change_percent else None,
        "expected_revenue_impact_percent": float(rec.expected_revenue_impact_percent) if rec.expected_revenue_impact_percent else None,
        "status": rec.status,
        "reasoning": rec.reasoning,
        "created_by": str(rec.created_by) if rec.created_by else None,
        "approved_by": str(rec.approved_by) if rec.approved_by else None,
        "created_at": rec.created_at,
        "approved_at": rec.approved_at,
        "applied_at": rec.applied_at,
    }


@router.post("/generate/{product_id}")
def generate_recommendation(
    product_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vygeneruj doporučení ceny pro jeden produkt."""
    try:
        pid = UUID(product_id)
        user_id = UUID(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    calc = _calculate_recommendation(product, db)

    rec = PriceRecommendation(
        company_id=product.company_id,
        product_id=pid,
        recommended_price_without_vat=Decimal(str(calc["recommended_without_vat"])),
        recommended_price_with_vat=Decimal(str(calc["recommended_with_vat"])),
        current_price_with_vat=Decimal(str(calc["current_price"])) if calc["current_price"] else None,
        margin_change_percent=Decimal(str(calc["margin_change"])),
        expected_revenue_impact_percent=Decimal(str(calc["revenue_impact"])),
        reasoning=calc["reasoning"],
        created_by=user_id,
        status="pending",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    return _rec_to_response(rec, db)


@router.post("/generate-all")
def generate_all_recommendations(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Generuj doporučení pro všechny produkty (přeskočí ty s čekajícím doporučením)."""
    try:
        user_id = UUID(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatný token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Uživatel nenalezen")

    products = db.query(Product).filter(Product.company_id == user.company_id).all()

    # ID produktů s již čekajícím doporučením
    pending_ids = {
        str(r.product_id)
        for r in db.query(PriceRecommendation.product_id)
        .filter(PriceRecommendation.status == "pending", PriceRecommendation.company_id == user.company_id)
        .all()
    }

    generated = 0
    skipped = 0
    for product in products:
        if str(product.id) in pending_ids:
            skipped += 1
            continue

        calc = _calculate_recommendation(product, db)
        rec = PriceRecommendation(
            company_id=product.company_id,
            product_id=product.id,
            recommended_price_without_vat=Decimal(str(calc["recommended_without_vat"])),
            recommended_price_with_vat=Decimal(str(calc["recommended_with_vat"])),
            current_price_with_vat=Decimal(str(calc["current_price"])) if calc["current_price"] else None,
            margin_change_percent=Decimal(str(calc["margin_change"])),
            expected_revenue_impact_percent=Decimal(str(calc["revenue_impact"])),
            reasoning=calc["reasoning"],
            created_by=user_id,
            status="pending",
        )
        db.add(rec)
        generated += 1

    db.commit()
    return {"generated": generated, "skipped": skipped, "total": len(products)}


@router.get("")
def list_recommendations(
    status: Optional[str] = None,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vypiš doporučení (lze filtrovat dle statusu)."""
    query = db.query(PriceRecommendation)
    if status:
        query = query.filter(PriceRecommendation.status == status)
    recs = query.order_by(desc(PriceRecommendation.created_at)).all()
    return [_rec_to_response(r, db) for r in recs]


@router.get("/{recommendation_id}")
def get_recommendation(
    recommendation_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Načti konkrétní doporučení."""
    try:
        rec_id = UUID(recommendation_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    rec = db.query(PriceRecommendation).filter(PriceRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Doporučení nenalezeno")
    return _rec_to_response(rec, db)


@router.post("/{recommendation_id}/approve")
def approve_recommendation(
    recommendation_id: str,
    update: Optional[RecommendationUpdate] = None,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Schvál doporučení."""
    try:
        rec_id = UUID(recommendation_id)
        user_id = UUID(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    rec = db.query(PriceRecommendation).filter(PriceRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Doporučení nenalezeno")

    rec.status = "approved"
    rec.approved_by = user_id
    rec.approved_at = datetime.utcnow()

    if update and update.override_price_with_vat:
        rec.recommended_price_with_vat = Decimal(str(update.override_price_with_vat))
        rec.recommended_price_without_vat = Decimal(str(update.override_price_with_vat / 1.21))

    db.commit()
    return {"message": "Doporučení schváleno"}


@router.post("/{recommendation_id}/reject")
def reject_recommendation(
    recommendation_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Zamítni doporučení."""
    try:
        rec_id = UUID(recommendation_id)
    except Exception:
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
    """Aplikuj doporučenou cenu na produkt (zapíše do Price tabulky)."""
    try:
        rec_id = UUID(recommendation_id)
        user_id = UUID(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    rec = db.query(PriceRecommendation).filter(PriceRecommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Doporučení nenalezeno")
    if rec.status != "approved":
        raise HTTPException(status_code=400, detail="Doporučení není schváleno")

    # Získej aktuální cenu pro old_price
    product = db.query(Product).filter(Product.id == rec.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    last_price = (
        db.query(Price)
        .filter(Price.product_id == rec.product_id, Price.market == "CZ")
        .order_by(Price.changed_at.desc())
        .first()
    )
    old_price = last_price.current_price if last_price else None

    # Zapiš nový záznam do Price tabulky
    new_price_entry = Price(
        product_id=rec.product_id,
        market="CZ",
        currency="CZK",
        current_price=rec.recommended_price_with_vat,
        old_price=old_price,
        changed_by=user_id,
    )
    db.add(new_price_entry)

    rec.status = "applied"
    rec.applied_at = datetime.utcnow()
    db.commit()

    return {
        "message": "Cena aplikována na produkt",
        "new_price": float(rec.recommended_price_with_vat),
    }
