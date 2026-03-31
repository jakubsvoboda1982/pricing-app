"""
API endpoints for managing competitor prices.
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.models import Product, CompetitorProductPrice, CompetitorPriceHistory
from app.schemas.product import CompetitorProductPriceResponse, ProductResponse
from app.competitor_scraper import scrape_competitor_price, update_all_competitor_prices
from uuid import UUID
from decimal import Decimal
from datetime import datetime, timedelta
from typing import List, Optional
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/competitor-prices", tags=["competitor-prices"])


@router.get("/{product_id}", response_model=List[CompetitorProductPriceResponse])
def get_competitor_prices(product_id: UUID, db: Session = Depends(get_db)):
    """Get all tracked competitor prices for a product."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    prices = db.query(CompetitorProductPrice).filter(
        CompetitorProductPrice.product_id == product_id
    ).all()

    return prices


@router.post("/{product_id}/track")
def add_competitor_url_tracking(product_id: UUID, url: str, db: Session = Depends(get_db)):
    """
    Add a competitor URL to track for this product.
    Creates a new CompetitorProductPrice record.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    # Check if already tracking this URL
    existing = db.query(CompetitorProductPrice).filter(
        CompetitorProductPrice.product_id == product_id,
        CompetitorProductPrice.competitor_url == url
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Tato URL je již sledována")

    # Create new tracking record
    comp_price = CompetitorProductPrice(
        product_id=product_id,
        competitor_url=url,
        currency="CZK",
        market="CZ",
        fetch_status="pending",
        next_update_at=datetime.utcnow()  # Schedule for immediate update
    )
    db.add(comp_price)
    db.commit()
    db.refresh(comp_price)

    return CompetitorProductPriceResponse.from_orm(comp_price)


@router.delete("/{product_id}/track")
def remove_competitor_url_tracking(product_id: UUID, url: str, db: Session = Depends(get_db)):
    """Remove a competitor URL from tracking."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    comp_price = db.query(CompetitorProductPrice).filter(
        CompetitorProductPrice.product_id == product_id,
        CompetitorProductPrice.competitor_url == url
    ).first()

    if not comp_price:
        raise HTTPException(status_code=404, detail="Tato URL není sledována")

    # Delete historical data
    db.query(CompetitorPriceHistory).filter(
        CompetitorPriceHistory.competitor_price_id == comp_price.id
    ).delete()

    # Delete the tracking record
    db.delete(comp_price)
    db.commit()

    return {"message": "URL odstraněna ze sledování"}


@router.post("/{product_id}/refresh")
async def refresh_competitor_prices(product_id: UUID, db: Session = Depends(get_db)):
    """
    Manually trigger a refresh of all competitor prices for this product.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    comp_prices = db.query(CompetitorProductPrice).filter(
        CompetitorProductPrice.product_id == product_id
    ).all()

    if not comp_prices:
        return {"status": "success", "updated": 0, "message": "Žádné URL k aktualizaci"}

    updated_count = 0
    errors = []

    for comp_price in comp_prices:
        try:
            price = await scrape_competitor_price(comp_price.competitor_url)

            if price is not None:
                # Store historical record
                history = CompetitorPriceHistory(
                    competitor_price_id=comp_price.id,
                    price=comp_price.price if comp_price.price else price
                )
                db.add(history)

                # Update current price
                comp_price.price = price
                comp_price.last_fetched_at = datetime.utcnow()
                comp_price.fetch_status = 'success'
                comp_price.fetch_error = None
                comp_price.next_update_at = datetime.utcnow() + timedelta(days=7)
                updated_count += 1
            else:
                comp_price.fetch_status = 'error'
                comp_price.fetch_error = 'Cena nebyla nalezena na stránce'
                comp_price.last_fetched_at = datetime.utcnow()
                comp_price.next_update_at = datetime.utcnow() + timedelta(days=1)
                errors.append(comp_price.competitor_url)

        except Exception as e:
            comp_price.fetch_status = 'error'
            comp_price.fetch_error = str(e)
            comp_price.last_fetched_at = datetime.utcnow()
            comp_price.next_update_at = datetime.utcnow() + timedelta(days=1)
            errors.append(comp_price.competitor_url)
            logger.error(f"Error refreshing {comp_price.competitor_url}: {str(e)}")

        await asyncio.sleep(0.5)

    db.commit()

    return {
        "status": "success" if not errors else "partial",
        "updated": updated_count,
        "errors": len(errors),
        "failed_urls": errors if errors else None,
        "message": f"Aktualizováno {updated_count} cen" + (f", {len(errors)} chyb" if errors else "")
    }


@router.get("/{product_id}/history/{url_index}", response_model=List[dict])
def get_price_history(product_id: UUID, url_index: int, db: Session = Depends(get_db)):
    """
    Get historical price data for a specific competitor URL.
    Shows how the price has changed over time.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    # Get the specific competitor price record
    comp_prices = db.query(CompetitorProductPrice).filter(
        CompetitorProductPrice.product_id == product_id
    ).all()

    if url_index < 0 or url_index >= len(comp_prices):
        raise HTTPException(status_code=404, detail="URL index mimo rozsah")

    comp_price = comp_prices[url_index]

    # Get historical records
    history = db.query(CompetitorPriceHistory).filter(
        CompetitorPriceHistory.competitor_price_id == comp_price.id
    ).order_by(desc(CompetitorPriceHistory.recorded_at)).limit(100).all()

    return [
        {
            "price": h.price,
            "recorded_at": h.recorded_at
        }
        for h in history
    ]


@router.post("/update-all")
async def trigger_update_all_competitor_prices(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Manually trigger update of all competitor prices across all products.
    Runs asynchronously in background.
    """
    # Schedule the update to run in background
    background_tasks.add_task(update_all_competitor_prices)

    return {
        "status": "scheduled",
        "message": "Aktualizace všech cen konkurence byla naplánována"
    }
