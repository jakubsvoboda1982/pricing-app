from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
import uuid

from app.database import get_db
from app.models import User, LoginAttempt
from app.middleware.auth import verify_token

VALID_ROLES = ["admin", "pricing_manager", "category_manager", "read_only"]
from app.utils.password import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Dependency that verifies the user is authenticated and has admin role."""
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


# --- Pydantic schemas for admin endpoints ---

class LoginAttemptResponse(BaseModel):
    id: str
    email: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool
    timestamp: datetime
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "read_only"
    company_id: Optional[str] = None  # optional - falls back to admin's company


class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserAdminResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    company_id: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Login Attempts Endpoints ---

@router.get("/login-attempts", response_model=list[LoginAttemptResponse])
def list_login_attempts(
    search: Optional[str] = Query(None, description="Filter by email (partial match)"),
    days: Optional[int] = Query(None, description="Filter to last N days"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all login attempts with optional filters."""
    query = db.query(LoginAttempt)

    if search:
        query = query.filter(LoginAttempt.email.ilike(f"%{search}%"))

    if days is not None:
        cutoff = datetime.utcnow() - timedelta(days=days)
        query = query.filter(LoginAttempt.timestamp >= cutoff)

    attempts = (
        query
        .order_by(desc(LoginAttempt.timestamp))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        LoginAttemptResponse(
            id=str(a.id),
            email=a.email,
            ip_address=a.ip_address,
            user_agent=a.user_agent,
            success=a.success,
            timestamp=a.timestamp,
            error_message=a.error_message,
        )
        for a in attempts
    ]


@router.delete("/login-attempts/{attempt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_login_attempt(
    attempt_id: str,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a single login attempt record."""
    attempt = db.query(LoginAttempt).filter(LoginAttempt.id == uuid.UUID(attempt_id)).first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Login attempt not found")
    db.delete(attempt)
    db.commit()


# --- User Management Endpoints ---

@router.get("/users", response_model=list[UserAdminResponse])
def list_users(
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all users."""
    users = db.query(User).order_by(User.created_at).all()
    return [
        UserAdminResponse(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            role=u.role or "read_only",
            is_active=u.is_active,
            company_id=str(u.company_id),
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("/users", response_model=UserAdminResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreateRequest,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new user."""
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    # Validate role
    if user_data.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {VALID_ROLES}",
        )

    # Use provided company_id or fall back to admin's company
    company_id = uuid.UUID(user_data.company_id) if user_data.company_id else admin_user.company_id

    user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
        company_id=company_id,
        is_verified=True,
        is_approved=True,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserAdminResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        company_id=str(user.company_id),
        created_at=user.created_at,
    )


@router.put("/users/{user_id}", response_model=UserAdminResponse)
def update_user(
    user_id: str,
    update_data: UserUpdateRequest,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a user's role and/or active status."""
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if update_data.role is not None:
        if update_data.role not in VALID_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role. Must be one of: {VALID_ROLES}",
            )
        user.role = update_data.role

    if update_data.is_active is not None:
        user.is_active = update_data.is_active

    db.commit()
    db.refresh(user)

    return UserAdminResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        company_id=str(user.company_id),
        created_at=user.created_at,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: str,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Deactivate a user (set is_active=False)."""
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    db.commit()
