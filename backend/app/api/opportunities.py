from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product
from uuid import UUID
from pydantic import BaseModel

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])

class OpportunityResponse(BaseModel):
    id: str
    name: str
    score: int
    priority: str
    price_range: str
    description: str
    tags: list[str]
    sales: str
    margin: str

    class Config:
        from_attributes = True

@router.get("", response_model=list[OpportunityResponse])
def list_opportunities(db: Session = Depends(get_db)):
    """Get list of product opportunities based on analytics"""
    products = db.query(Product).limit(8).all()

    opportunities = []
    for idx, product in enumerate(products):
        score = max(50, min(99, 85 - (idx * 3)))
        priority = "high" if idx % 2 == 0 else "medium" if idx % 3 == 0 else "low"

        opportunity = {
            "id": str(product.id),
            "name": product.name,
            "score": score,
            "priority": priority,
            "price_range": f"{79 + idx * 5}–{119 + idx * 5} CZK",
            "description": "Identifikuj nejlepší produkty pro růst e-shopu, kvůli vysoké prioritu",
            "tags": ["vysoká priorita", "klíčový"] if idx % 2 == 0 else ["klíčový"],
            "sales": f"{100 + idx * 20} ks",
            "margin": f"{25 + idx * 2}%",
        }
        opportunities.append(opportunity)

    return opportunities

@router.get("/{product_id}", response_model=OpportunityResponse)
def get_opportunity(product_id: UUID, db: Session = Depends(get_db)):
    """Get specific product opportunity"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    return {
        "id": str(product.id),
        "name": product.name,
        "score": 88,
        "priority": "high",
        "price_range": "100–150 CZK",
        "description": "Vysoký potenciál pro růst s optimalizací ceny",
        "tags": ["vysoká priorita", "klíčový"],
        "sales": "145 ks",
        "margin": "28%",
    }
