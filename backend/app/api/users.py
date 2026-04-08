from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.utils.password import hash_password
from app.utils.email import send_approval_notification_email
from app.middleware.auth import verify_token
from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "read_only"


class UserUpdate(BaseModel):
    role: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    is_approved: bool

    model_config = {"from_attributes": True}


class PendingUserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    created_at: datetime
    is_verified: bool
    is_approved: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=list[UserResponse])
def list_users(
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    users = db.query(User).filter(User.is_active == True).all()
    return users


@router.post("", response_model=UserResponse)
def create_user(user: UserCreate, token_payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Create a new user with temporary password"""
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    # Get company from first available company
    from app.models import Company
    company = db.query(Company).first()
    if not company:
        raise HTTPException(status_code=400, detail="Žádná společnost v systému")

    new_user = User(
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        hashed_password=hash_password("TempPassword123!"),
        company_id=company.id,
        is_verified=True,
        is_approved=True,
        is_active=True,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: UUID, user_update: UserUpdate, token_payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.role = user_update.role
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(user_id: UUID, token_payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


# NOTE: /pending must be defined BEFORE /{user_id} to avoid route conflicts
@router.get("/pending", response_model=list[PendingUserResponse])
def get_pending_users(
    status_filter: str = "all",
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Get list of pending users for admin approval"""
    query = db.query(User)

    if status_filter == "pending_verification":
        query = query.filter(User.is_verified == False)
    elif status_filter == "pending_approval":
        query = query.filter(User.is_verified == True, User.is_approved == False)
    else:  # all
        query = query.filter((User.is_verified == False) | (User.is_approved == False))

    users = query.all()
    return users


@router.post("/{user_id}/approve")
async def approve_user(user_id: UUID, token_payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Admin approval of user account"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_approved = True
    user.approved_at = datetime.utcnow()
    db.commit()

    try:
        await send_approval_notification_email(user.email, user.full_name)
    except Exception:
        pass  # Don't fail if email sending fails

    return {"message": "User approved successfully"}


@router.post("/{user_id}/reject")
def reject_user(user_id: UUID, token_payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Admin rejection of user account (soft delete)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    db.commit()

    return {"message": "User rejected"}
