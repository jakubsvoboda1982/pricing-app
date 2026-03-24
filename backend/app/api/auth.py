from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.auth import UserLogin, UserRegister, TokenResponse, UserResponse
from app.models import User, Company, LoginAttempt
from app.utils.password import hash_password, verify_password
from app.middleware.auth import create_access_token, verify_token
from datetime import timedelta

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=TokenResponse)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    # Check if company exists, create if not
    company = db.query(Company).filter(Company.name == user_data.company_name).first()
    if not company:
        company = Company(name=user_data.company_name)
        db.add(company)
        db.commit()
        db.refresh(company)

    # Check if user exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    # Create user
    user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        company_id=company.id,
        role="admin",  # First user is admin
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create token
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}
    )
    return TokenResponse(access_token=access_token)

@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        # Record failed login attempt
        attempt = LoginAttempt(
            email=credentials.email,
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            error_message="Invalid credentials",
        )
        db.add(attempt)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # Record successful login attempt
    attempt = LoginAttempt(
        email=credentials.email,
        ip_address=ip_address,
        user_agent=user_agent,
        success=True,
    )
    db.add(attempt)
    db.commit()

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email}
    )
    return TokenResponse(access_token=access_token)

@router.get("/me", response_model=UserResponse)
def get_current_user(payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Get current authenticated user"""
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
    )
