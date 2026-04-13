from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, Price, User
from app.models.recommendation import PriceRecommendation
from app.middleware.auth import verify_token
from uuid import UUID
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import desc
from decimal import Decimal
from datetime import datetime

router = APIRouter(prefix="/api/simulator", tags=["simulator"])


class ScenarioRequest(BaseModel):
    product_id: str
    scenario: str = "custom"          # custom | competitor_drop | cost_increase
    price_change: Optional[float] = 0  # Kč (pro custom)
    elasticity: float = 1.0
    # Scénář 2: Konkurence sníží o X %
    competitor_drop_pct: Optional[float] = 0
    # Scénář 3: Náklady vzrostou o Y %
    cost_increase_pct: Optional[float] = 0
    margin_target: Optional[float] = None


class ApplyRecommendationRequest(BaseModel):
    product_id: str
    new_price_with_vat: float
    scenario: str = "custom"          # custom | competitor | cost
    revenue_change_pct: Optional[float] = None
    elasticity: Optional[float] = 1.0


def _last_price(product_id, db: Session) -> tuple[Optional[float], str, str]:
    """Vrátí (price_value, market, currency) z poslední záznamu ceny."""
    price = (
        db.query(Price)
        .filter(Price.product_id == product_id)
        .order_by(Price.changed_at.desc())
        .first()
    )
    if price and price.current_price:
        return float(price.current_price), price.market or "CZ", price.currency or "CZK"
    return None, "CZ", "CZK"


def _calc(base_price: float, base_sales: int, base_margin: float,
          new_price: float, elasticity: float):
    price_change_pct = (new_price - base_price) / base_price * 100
    sales_change_pct = price_change_pct * elasticity * -1
    new_sales = max(5, base_sales + base_sales * sales_change_pct / 100)
    revenue = new_price * new_sales
    base_revenue = base_price * base_sales
    revenue_change_pct = (revenue - base_revenue) / base_revenue * 100

    if revenue_change_pct > 10:
        rec = "Strategie zvyšuje příjem — zvažte implementaci."
    elif revenue_change_pct > 0:
        rec = "Malý nárůst příjmu. Zkuste jinou kombinaci."
    else:
        rec = "Tato strategie snižuje příjem. Nedoporučuji."

    return {
        "new_price": round(new_price, 2),
        "margin": round(base_margin, 1),
        "estimated_sales": int(round(new_sales)),
        "revenue": int(round(revenue)),
        "base_revenue": int(round(base_revenue)),
        "revenue_change_pct": round(revenue_change_pct, 1),
        "sales_change_pct": round(sales_change_pct, 1),
        "recommendation": rec,
    }


@router.get("/products")
def get_simulator_products(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vrátí všechny sledované produkty s reálnými cenami pro simulátor."""
    # Zjisti company_id z tokenu
    try:
        user_id = UUID(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Neplatný token")

    user = db.query(User).filter(User.id == user_id).first()
    company_id = user.company_id if user else None

    # Vrať všechny sledované produkty pro danou company
    query = db.query(Product)
    if company_id:
        query = query.filter(Product.company_id == company_id)
    products = query.order_by(Product.name).all()

    result = []
    for p in products:
        price_val, market, currency = _last_price(p.id, db)
        base_margin = 28.0
        if p.purchase_price_without_vat and price_val:
            cost_with_vat = float(p.purchase_price_without_vat) * 1.21
            if price_val > 0:
                base_margin = round((price_val - cost_with_vat) / price_val * 100, 1)

        result.append({
            "id": str(p.id),
            "name": p.name or "Bez názvu",
            "base_price": price_val or 100.0,
            "base_margin": max(0.0, base_margin),
            "base_sales": 100,
            "purchase_price_with_vat": (
                round(float(p.purchase_price_without_vat) * 1.21, 2)
                if p.purchase_price_without_vat else None
            ),
            "market": market,
            "currency": currency,
        })
    return result


@router.post("/apply-recommendation")
def apply_simulator_recommendation(
    request: ApplyRecommendationRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Uloží výsledek simulace jako doporučení ceny s čekajícím stavem."""
    try:
        pid = UUID(request.product_id)
        user_id = UUID(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID produktu")

    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    # Aktuální cena
    price_val, _, _ = _last_price(pid, db)
    current_price = price_val

    new_price_with_vat = request.new_price_with_vat
    new_price_without_vat = new_price_with_vat / 1.21

    margin_change = (
        (new_price_with_vat - current_price) / current_price * 100
        if current_price else 0.0
    )

    scenario_labels = {
        "custom": "Vlastní změna",
        "competitor": "Reakce na konkurenci",
        "cost": "Přenos nárůstu nákladů",
    }

    rec = PriceRecommendation(
        company_id=product.company_id,
        product_id=pid,
        recommended_price_without_vat=Decimal(str(round(new_price_without_vat, 2))),
        recommended_price_with_vat=Decimal(str(round(new_price_with_vat, 2))),
        current_price_with_vat=Decimal(str(current_price)) if current_price else None,
        margin_change_percent=Decimal(str(round(margin_change, 2))),
        expected_revenue_impact_percent=Decimal(str(round(request.revenue_change_pct or 0.0, 2))),
        reasoning={
            "type": "simulator",
            "source": "simulator",
            "scenario": request.scenario,
            "scenario_label": scenario_labels.get(request.scenario, request.scenario),
            "text": f"Doporučení ze Simulátoru co-když ({scenario_labels.get(request.scenario, request.scenario)})",
            "elasticity": request.elasticity,
            "confidence": 0.75,
            "current_price": current_price,
            "revenue_change_pct": request.revenue_change_pct,
        },
        created_by=user_id,
        status="pending",
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    return {
        "id": str(rec.id),
        "product_id": str(rec.product_id),
        "recommended_price_with_vat": float(rec.recommended_price_with_vat),
        "status": rec.status,
        "message": "Doporučení ze simulátoru uloženo a čeká na schválení.",
    }


@router.post("/calculate")
def calculate_simulation(
    request: ScenarioRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Spočítej simulaci pro zvolený scénář."""
    try:
        pid = UUID(request.product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID produktu")

    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    base_price, _, _ = _last_price(pid, db)
    base_price = base_price or 100.0
    base_sales = 100
    purchase_cost_with_vat = (
        float(product.purchase_price_without_vat) * 1.21
        if product.purchase_price_without_vat else None
    )
    base_margin = 28.0
    if purchase_cost_with_vat and base_price > 0:
        base_margin = round((base_price - purchase_cost_with_vat) / base_price * 100, 1)

    if request.scenario == "custom":
        new_price = base_price + (request.price_change or 0)
    elif request.scenario == "competitor_drop":
        drop = request.competitor_drop_pct or 0
        new_price = base_price * (1 - drop / 100 * 0.5)
    elif request.scenario == "cost_increase":
        increase = request.cost_increase_pct or 0
        if purchase_cost_with_vat:
            new_cost = purchase_cost_with_vat * (1 + increase / 100)
            margin_ratio = base_price / purchase_cost_with_vat if purchase_cost_with_vat > 0 else 1.35
            new_price = new_cost * margin_ratio
        else:
            new_price = base_price * (1 + increase / 100 * 0.6)
    else:
        new_price = base_price

    new_price = max(0.01, new_price)
    return _calc(base_price, base_sales, base_margin, new_price, request.elasticity)


@router.post("/compare-scenarios")
def compare_scenarios(
    request: ScenarioRequest,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Porovnej tři scénáře najednou pro daný produkt."""
    try:
        pid = UUID(request.product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Neplatné ID produktu")

    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    base_price, _, _ = _last_price(pid, db)
    base_price = base_price or 100.0
    base_sales = 100
    purchase_cost_with_vat = (
        float(product.purchase_price_without_vat) * 1.21
        if product.purchase_price_without_vat else None
    )
    base_margin = 28.0
    if purchase_cost_with_vat and base_price > 0:
        base_margin = round((base_price - purchase_cost_with_vat) / base_price * 100, 1)

    elasticity = request.elasticity or 1.0

    s1_price = base_price + (request.price_change or 0)
    drop = request.competitor_drop_pct or 0
    s2_price = base_price * (1 - drop / 100 * 0.5)
    cost_inc = request.cost_increase_pct or 0
    if purchase_cost_with_vat:
        new_cost = purchase_cost_with_vat * (1 + cost_inc / 100)
        ratio = base_price / purchase_cost_with_vat if purchase_cost_with_vat > 0 else 1.35
        s3_price = new_cost * ratio
    else:
        s3_price = base_price * (1 + cost_inc / 100 * 0.6)

    return {
        "base_price": base_price,
        "base_sales": base_sales,
        "base_margin": base_margin,
        "base_revenue": int(base_price * base_sales),
        "scenarios": {
            "custom": _calc(base_price, base_sales, base_margin, max(0.01, s1_price), elasticity),
            "competitor_drop": _calc(base_price, base_sales, base_margin, max(0.01, s2_price), elasticity),
            "cost_increase": _calc(base_price, base_sales, base_margin, max(0.01, s3_price), elasticity),
        },
    }
