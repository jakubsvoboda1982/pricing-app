from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product
from uuid import UUID
from pydantic import BaseModel

router = APIRouter(prefix="/api/simulator", tags=["simulator"])

class SimulatorRequest(BaseModel):
    product_id: str
    price_change: float
    margin_target: float
    elasticity: float

class SimulatorResponse(BaseModel):
    price: float
    margin: float
    estimated_sales: int
    revenue: int
    change_percent: float
    recommendation: str

@router.get("/products", response_model=list[dict])
def get_simulator_products(db: Session = Depends(get_db)):
    """Get products available for simulation"""
    products = db.query(Product).all()

    return [
        {
            "id": str(p.id),
            "name": p.name,
            "base_price": 100,
            "base_margin": 28,
            "base_sales": 145,
        }
        for p in products
    ]

@router.post("/calculate", response_model=SimulatorResponse)
def calculate_simulation(request: SimulatorRequest, db: Session = Depends(get_db)):
    """Calculate simulation results"""
    product = db.query(Product).filter(Product.id == UUID(request.product_id)).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    # Base values
    base_price = 100
    base_margin = 28
    base_sales = 145

    # Calculate new values
    new_price = base_price + request.price_change
    price_change_percent = (request.price_change / base_price) * 100

    # Price elasticity calculation
    sales_change = price_change_percent * request.elasticity * -1
    new_sales = max(10, base_sales + (base_sales * (sales_change / 100)))

    new_margin = min(50, max(10, request.margin_target))
    revenue = new_price * new_sales
    base_revenue = base_price * base_sales
    revenue_change = ((revenue - base_revenue) / base_revenue) * 100

    # Generate recommendation
    if revenue_change > 10:
        recommendation = "Tato strategie ceníku zvyšuje příjem. Zvažte implementaci."
    elif revenue_change > 0:
        recommendation = "Malý nárůst příjmu. Zkuste jinou kombinaci."
    else:
        recommendation = "Tato strategie snižuje příjem. Nedoporučuji ji."

    return {
        "price": round(new_price, 2),
        "margin": round(new_margin, 2),
        "estimated_sales": int(round(new_sales)),
        "revenue": int(round(revenue)),
        "change_percent": round(revenue_change, 1),
        "recommendation": recommendation,
    }
