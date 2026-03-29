from pydantic import BaseModel, EmailStr
from typing import Optional

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    company_name: str  # If new company

class RegisterResponse(BaseModel):
    id: str
    email: str
    message: str

class VerifyEmailRequest(BaseModel):
    token: str
    email: EmailStr

class VerifyEmailResponse(BaseModel):
    message: str

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
