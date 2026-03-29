#!/usr/bin/env python3
"""Seed the database with sample products for testing."""

import os
import sys
import uuid
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base
from app.models import Product, Company

# Ensure all tables exist
Base.metadata.create_all(bind=engine)

SAMPLE_PRODUCTS = [
    {
        "name": "Protein Nut Clusters",
        "sku": "PNC-001",
        "category": "Protein Snacks",
        "description": "Vysoká poptávka s potenciálem pro zvýšení marže",
    },
    {
        "name": "Protein Nut Cluster Bites",
        "sku": "PNCB-001",
        "category": "Protein Snacks",
        "description": "Post-workout / daily protein snacking",
    },
    {
        "name": "Premium Freeze-Dried Fruit Chocolate Bites",
        "sku": "PFDCB-001",
        "category": "Fruit Snacks",
        "description": "Zdravé a lákavé balení pro trh",
    },
    {
        "name": "Freeze-Dried Fruit Chocolate Snack Pack 5-pack",
        "sku": "FDCSP-001",
        "category": "Fruit Snacks",
        "description": "Zdravější alternativa k tradičním sladkostem",
    },
    {
        "name": "Sweet & Salty Pretzel Nut Mix",
        "sku": "SSNM-001",
        "category": "Mixed Snacks",
        "description": "Office snacking, entertainment",
    },
    {
        "name": "Premium On-The-Go Snack Pack 5-pack",
        "sku": "POTGSP-001",
        "category": "Mixed Snacks",
        "description": "Cestování a aktivní životní styl",
    },
]


def seed_database():
    """Add sample products to the database."""
    db = SessionLocal()
    try:
        # Check if products already exist
        existing = db.query(Product).count()
        if existing > 0:
            print(f"Database already contains {existing} products. Skipping seed.")
            return

        # Check if test company exists, otherwise create it
        company = db.query(Company).filter_by(name="Nutles").first()
        if not company:
            company = Company(id=uuid.uuid4(), name="Nutles")
            db.add(company)
            db.commit()
            print(f"Created company: {company.name}")

        # Add all sample products
        for product_data in SAMPLE_PRODUCTS:
            product = Product(
                id=uuid.uuid4(),
                company_id=company.id,
                **product_data
            )
            db.add(product)

        db.commit()
        print(f"Successfully seeded database with {len(SAMPLE_PRODUCTS)} products for company {company.name}.")
    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
