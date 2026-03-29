from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.utils.password import hash_password
from app.utils.email import send_approval_notification_email
from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime

router = APIRouter(prefix="/api/users", tags=["users"])

class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "read_only"

class UserUpdate(BaseModel):
    role: str

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    is_approved: bool

    class Config:
        from_attributes = True

class PendingUserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    created_at: datetime
    is_verified: bool
    is_approved: bool

    class Config:
        from_attributes = True

@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return users

@router.post("/", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    """Create a new user with temporary password"""

    # Check if user exists
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")

    # Create user with temporary password (should be sent via email in production)
    new_user = User(
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        hashed_password=hash_password("TempPassword123!"),  # Should be random and sent via email
        company_id="00000000-0000-0000-0000-000000000000",  # Should come from logged-in user's company
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: UUID, user_update: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.role = user_update.role
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}")
def delete_user(user_id: UUID, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

@router.get("/pending", response_model=list[PendingUserResponse])
def get_pending_users(
    status_filter: str = "all",  # all, pending_verification, pending_approval
    db: Session = Depends(get_db)
):
    """Get list of pending users for admin approval"""
    # Filter based on status
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
async def approve_user(user_id: UUID, db: Session = Depends(get_db)):
    """Admin approval of user account"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Mark as approved
    user.is_approved = True
    user.approved_at = datetime.utcnow()
    db.commit()

    # Send approval notification email
    await send_approval_notification_email(user.email, user.full_name)

    return {"message": "User approved successfully"}

@router.post("/{user_id}/reject")
def reject_user(user_id: UUID, db: Session = Depends(get_db)):
    """Admin rejection of user account (soft delete)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Soft delete by setting is_active=False
    user.is_active = False
    db.commit()

    return {"message": "User rejected"}
