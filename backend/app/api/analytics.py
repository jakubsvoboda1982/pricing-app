from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Analytics
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

class AnalyticsResponse(BaseModel):
    id: str
    product_id: str
    hero_score: int
    margin_risk: str
    positioning: str | None
    category_rank: int | None
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/{product_id}", response_model=AnalyticsResponse)
def get_analytics(product_id: UUID, db: Session = Depends(get_db)):
    analytics = db.query(Analytics).filter(Analytics.product_id == product_id).first()
    if not analytics:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analytics not found")
    return analytics
