from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.auth import UserLogin, UserRegister, TokenResponse, UserResponse, RegisterResponse, VerifyEmailRequest, VerifyEmailResponse
from app.models import User, Company, LoginAttempt
from app.utils.password import hash_password, verify_password
from app.utils.email import send_verification_email, send_password_reset_email
from app.middleware.auth import create_access_token, verify_token
from datetime import datetime, timedelta
import secrets
import bcrypt

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=RegisterResponse)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user with email verification required"""
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

    # Generate verification token (32 chars, URL-safe)
    verification_token = secrets.token_urlsafe(32)

    # Hash the token for secure storage
    token_hash = bcrypt.hashpw(verification_token.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    token_expires_at = datetime.utcnow() + timedelta(hours=24)

    # Create user with is_verified=False and is_approved=False
    user = User(
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        full_name=user_data.full_name,
        company_id=company.id,
        role="admin",  # First user is admin
        is_verified=False,
        is_approved=False,
        verification_token_hash=token_hash,
        verification_token_expires_at=token_expires_at,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Send verification email
    await send_verification_email(user.email, verification_token)

    return RegisterResponse(
        id=str(user.id),
        email=user.email,
        message="Registration successful. Check your email to verify your account."
    )

@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(request: VerifyEmailRequest, db: Session = Depends(get_db)):
    """Verify user's email with verification token"""
    # Find user by email with pending verification
    user = db.query(User).filter(
        User.email == request.email,
        User.is_verified == False,
        User.verification_token_hash.isnot(None)
    ).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending verification found for this email")

    # Check if token has expired
    if user.verification_token_expires_at and datetime.utcnow() > user.verification_token_expires_at:
        # Clear expired token
        user.verification_token_hash = None
        user.verification_token_expires_at = None
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token has expired")

    # Verify the token
    try:
        is_valid = bcrypt.checkpw(request.token.encode('utf-8'), user.verification_token_hash.encode('utf-8'))
    except:
        is_valid = False

    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token")

    # Mark user as verified
    user.is_verified = True
    user.email_verified_at = datetime.utcnow()
    user.verification_token_hash = None
    user.verification_token_expires_at = None
    db.commit()

    return VerifyEmailResponse(message="Email verified successfully. Awaiting admin approval.")

@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Login user - requires email verification and admin approval"""
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

    # Check if user is verified
    if not user.is_verified:
        attempt = LoginAttempt(
            email=credentials.email,
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            error_message="Email not verified",
        )
        db.add(attempt)
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")

    # Check if user is approved
    if not user.is_approved:
        attempt = LoginAttempt(
            email=credentials.email,
            ip_address=ip_address,
            user_agent=user_agent,
            success=False,
            error_message="Awaiting admin approval",
        )
        db.add(attempt)
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Awaiting admin approval")

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

@router.post("/forgot-password")
async def forgot_password(data: dict, db: Session = Depends(get_db)):
    """
    Zahájí obnovu hesla — pošle email s reset tokenem.
    Vždy vrátí 200 (i když email neexistuje) aby nedošlo k user enumeration.
    """
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email je povinný")

    user = db.query(User).filter(User.email == email).first()
    if user and user.is_active:
        reset_token = secrets.token_urlsafe(32)
        token_hash = bcrypt.hashpw(reset_token.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        user.password_reset_token_hash = token_hash
        user.password_reset_token_expires_at = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        await send_password_reset_email(email, reset_token)

    return {"message": "Pokud je email registrován, obdržíš odkaz pro obnovu hesla."}


@router.post("/reset-password")
def reset_password(data: dict, db: Session = Depends(get_db)):
    """Nastaví nové heslo pomocí reset tokenu."""
    email = (data.get("email") or "").strip().lower()
    token = (data.get("token") or "").strip()
    new_password = data.get("password") or ""

    if not email or not token or not new_password:
        raise HTTPException(status_code=400, detail="Email, token a heslo jsou povinné")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Heslo musí mít alespoň 8 znaků")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.password_reset_token_hash:
        raise HTTPException(status_code=400, detail="Neplatný nebo vypršený odkaz pro obnovu hesla")

    if user.password_reset_token_expires_at and datetime.utcnow() > user.password_reset_token_expires_at:
        user.password_reset_token_hash = None
        user.password_reset_token_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Odkaz pro obnovu hesla vypršel. Požádej o nový.")

    try:
        is_valid = bcrypt.checkpw(token.encode('utf-8'), user.password_reset_token_hash.encode('utf-8'))
    except Exception:
        is_valid = False

    if not is_valid:
        raise HTTPException(status_code=400, detail="Neplatný nebo vypršený odkaz pro obnovu hesla")

    from app.utils.password import hash_password
    user.hashed_password = hash_password(new_password)
    user.password_reset_token_hash = None
    user.password_reset_token_expires_at = None
    db.commit()

    return {"message": "Heslo bylo úspěšně změněno. Nyní se můžeš přihlásit."}


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
        is_verified=user.is_verified,
        is_approved=user.is_approved,
    )
