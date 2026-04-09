from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, Price
from app.middleware.auth import verify_token
from uuid import UUID
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import desc

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


def _last_price(product_id, db: Session) -> Optional[float]:
    price = (
        db.query(Price)
        .filter(Price.product_id == product_id, Price.market == "CZ")
        .order_by(Price.changed_at.desc())
        .first()
    )
    return float(price.current_price) if price and price.current_price else None


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
    """Vrátí seznam produktů s reálnými cenami pro simulátor."""
    products = db.query(Product).limit(200).all()
    result = []
    for p in products:
        price_val = _last_price(p.id, db)
        # Výchozí prodeje a marže (reálná data zatím nejsou k dispozici)
        base_sales = 100
        # Marže ze vstupní ceny, pokud je k dispozici
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
            "base_sales": base_sales,
            "purchase_price_with_vat": (
                round(float(p.purchase_price_without_vat) * 1.21, 2)
                if p.purchase_price_without_vat else None
            ),
            "market": price.market if price else "CZ",
            "currency": price.currency if price else "CZK",
        })
    return result


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

    base_price = _last_price(pid, db) or 100.0
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
        # Konkurence sníží cenu o X % → zákazníci přesunout k nim
        # Naše reakce: snížit cenu o polovinu poklesu, aby jsme zůstali konkurenceschopní
        drop = request.competitor_drop_pct or 0
        new_price = base_price * (1 - drop / 100 * 0.5)

    elif request.scenario == "cost_increase":
        # Náklady vzrostou o Y % → musíme přenést část na zákazníka
        increase = request.cost_increase_pct or 0
        if purchase_cost_with_vat:
            new_cost = purchase_cost_with_vat * (1 + increase / 100)
            # Zachovej původní marži
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

    base_price = _last_price(pid, db) or 100.0
    base_sales = 100
    purchase_cost_with_vat = (
        float(product.purchase_price_without_vat) * 1.21
        if product.purchase_price_without_vat else None
    )
    base_margin = 28.0
    if purchase_cost_with_vat and base_price > 0:
        base_margin = round((base_price - purchase_cost_with_vat) / base_price * 100, 1)

    elasticity = request.elasticity or 1.0

    # Scénář 1: Vlastní změna
    s1_price = base_price + (request.price_change or 0)
    # Scénář 2: Reakce na pokles konkurence
    drop = request.competitor_drop_pct or 0
    s2_price = base_price * (1 - drop / 100 * 0.5)
    # Scénář 3: Přenos nárůstu nákladů
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
