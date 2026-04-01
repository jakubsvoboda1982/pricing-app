from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.models import CompetitorAlert
from app.middleware.auth import verify_token

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class CompetitorAlertResponse(BaseModel):
    id: str
    competitor_id: str
    alert_type: str
    title: str
    description: Optional[str]
    alert_data: Optional[dict]
    is_read: bool
    severity: str
    created_at: datetime
    dismissed_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.get("")
def list_alerts(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Načti upozornění"""
    query = db.query(CompetitorAlert)

    if status == "unread":
        query = query.filter(CompetitorAlert.is_read == False)
    elif status == "dismissed":
        query = query.filter(CompetitorAlert.dismissed_at.isnot(None))
    elif status == "active":
        query = query.filter(
            and_(
                CompetitorAlert.is_read == False,
                CompetitorAlert.dismissed_at.is_(None)
            )
        )

    if severity:
        query = query.filter(CompetitorAlert.severity == severity)

    alerts = query.order_by(desc(CompetitorAlert.created_at)).limit(100).all()
    return [CompetitorAlertResponse.model_validate(a) for a in alerts]


@router.post("/{alert_id}/read")
def mark_alert_read(
    alert_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Označ upozornění jako přečtené"""
    try:
        aid = UUID(alert_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    alert = db.query(CompetitorAlert).filter(CompetitorAlert.id == aid).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Upozornění nenalezeno")

    alert.is_read = True
    db.commit()

    return {"message": "Upozornění označeno jako přečtené"}


@router.post("/{alert_id}/dismiss")
def dismiss_alert(
    alert_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Zavři upozornění"""
    try:
        aid = UUID(alert_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    alert = db.query(CompetitorAlert).filter(CompetitorAlert.id == aid).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Upozornění nenalezeno")

    alert.dismissed_at = datetime.utcnow()
    db.commit()

    return {"message": "Upozornění zavřeno"}


@router.get("/stats")
def get_alerts_stats(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Statistika upozornění"""
    total = db.query(CompetitorAlert).count()
    unread = db.query(CompetitorAlert).filter(CompetitorAlert.is_read == False).count()
    critical = db.query(CompetitorAlert).filter(CompetitorAlert.severity == "critical").count()

    return {
        "total": total,
        "unread": unread,
        "critical": critical,
        "by_severity": {
            "critical": db.query(CompetitorAlert).filter(CompetitorAlert.severity == "critical").count(),
            "warning": db.query(CompetitorAlert).filter(CompetitorAlert.severity == "warning").count(),
            "info": db.query(CompetitorAlert).filter(CompetitorAlert.severity == "info").count(),
        }
    }
