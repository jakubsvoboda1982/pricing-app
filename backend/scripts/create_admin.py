#!/usr/bin/env python3
"""
Script to create admin user in Supabase
Run after migrations: python scripts/create_admin.py
"""

import os
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.utils.password import hash_password

# Get DATABASE_URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable not set")

# Create engine and session
engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

try:
    # Import models
    from app.models.user import User
    from app.models.company import Company

    # Create admin company
    admin_company = Company(
        id=uuid.uuid4(),
        name="Admin Company"
    )
    db.add(admin_company)
    db.commit()
    db.refresh(admin_company)

    # Create admin user
    admin_email = "jak.svo1982@gmail.com"
    admin_password = "Temp123!@#"  # CHANGE THIS IMMEDIATELY AFTER LOGIN!

    # Check if admin already exists
    existing_admin = db.query(User).filter(User.email == admin_email).first()
    if existing_admin:
        print(f"✓ Admin user {admin_email} already exists")
    else:
        admin_user = User(
            id=uuid.uuid4(),
            email=admin_email,
            hashed_password=hash_password(admin_password),
            full_name="Administrator",
            role="admin",
            company_id=admin_company.id,
            is_active=True
        )
        db.add(admin_user)
        db.commit()
        print(f"✓ Admin user created: {admin_email}")
        print(f"  Temporary password: {admin_password}")
        print(f"  ⚠️  CHANGE PASSWORD IMMEDIATELY!")

    db.close()
    print("\n✓ Database seeding complete!")

except Exception as e:
    print(f"✗ Error: {e}")
    db.close()
    raise
