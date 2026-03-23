from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuditLog
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])

class AuditLogResponse(BaseModel):
    id: str
    company_id: str
    product_id: str | None
    field_changed: str | None
    old_value: str | None
    new_value: str | None
    action: str
    user_id: str
    timestamp: datetime

    class Config:
        from_attributes = True

@router.get("/", response_model=list[AuditLogResponse])
def get_audit_logs(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()
    return logs
