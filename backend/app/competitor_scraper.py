"""
Competitor price scraper for Czech/Slovak e-commerce sites.
Handles extraction of price data from common competitor URLs.
"""

import asyncio
import aiohttp
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
import re
from sqlalchemy.orm import Session
from app.models import CompetitorProductPrice, CompetitorPriceHistory
from app.database import SessionLocal
import logging

logger = logging.getLogger(__name__)

# User agent to avoid being blocked
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Patterns for common Czech/Slovak e-commerce sites
PRICE_PATTERNS = {
    # Heureka format: data-price="299"
    'heureka': re.compile(r'data-price=["\']([0-9.]+)["\']', re.IGNORECASE),
    # Zbozi.cz format: class="price"
    'zbozi': re.compile(r'<span[^>]*class="[^"]*price[^"]*"[^>]*>([0-9.,\s]+)</span>', re.IGNORECASE),
    # Generic price patterns: <span>299 Kč</span>
    'generic': re.compile(r'([0-9]{1,5}[.,]?[0-9]{0,2})\s*(?:Kč|CZK|€|EUR)', re.IGNORECASE),
    # Price in JSON: "price":299
    'json_price': re.compile(r'["\']?price["\']?\s*:\s*([0-9.]+)', re.IGNORECASE),
}


async def fetch_page_content(url: str, timeout: int = 10) -> Optional[str]:
    """
    Fetch page content from a URL.
    Returns HTML content or None if fetch failed.
    """
    try:
        async with aiohttp.ClientSession() as session:
            headers = {'User-Agent': USER_AGENT}
            async with session.get(url, headers=headers, timeout=timeout, ssl=False) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    logger.warning(f"Failed to fetch {url}: status {response.status}")
                    return None
    except asyncio.TimeoutError:
        logger.warning(f"Timeout fetching {url}")
        return None
    except Exception as e:
        logger.error(f"Error fetching {url}: {str(e)}")
        return None


def extract_price(html: str, url: str) -> Optional[Decimal]:
    """
    Extract price from HTML content.
    Tries multiple patterns and returns the first match found.
    """
    if not html:
        return None

    # Try site-specific patterns
    for site, pattern in PRICE_PATTERNS.items():
        matches = pattern.findall(html)
        if matches:
            # Get the first (likely the product price, not shipping, etc.)
            price_str = matches[0]
            try:
                # Clean up the price string
                price_str = price_str.replace(',', '.').replace(' ', '').strip()
                # Try to convert to Decimal
                price = Decimal(price_str)
                if price > 0:
                    logger.info(f"Extracted price from {url} using {site} pattern: {price}")
                    return price
            except:
                pass

    logger.warning(f"No price found in {url}")
    return None


async def scrape_competitor_price(url: str) -> Optional[Decimal]:
    """
    Scrape a single competitor URL and return the price.
    Returns price as Decimal or None if unable to extract.
    """
    try:
        html = await fetch_page_content(url)
        if html:
            price = extract_price(html, url)
            return price
    except Exception as e:
        logger.error(f"Error scraping {url}: {str(e)}")
    return None


async def update_competitor_prices_for_product(product_id: str, db: Session) -> int:
    """
    Update all competitor prices for a given product.
    Returns number of prices updated.
    """
    try:
        # Get all competitor price records that need updating
        comp_prices = db.query(CompetitorProductPrice).filter(
            CompetitorProductPrice.product_id == product_id,
            (CompetitorProductPrice.next_update_at <= datetime.utcnow()) |
            (CompetitorProductPrice.next_update_at.is_(None))
        ).all()

        updated_count = 0

        for comp_price in comp_prices:
            try:
                # Scrape the competitor URL
                price = await scrape_competitor_price(comp_price.competitor_url)

                if price is not None:
                    # Store historical record before updating
                    history = CompetitorPriceHistory(
                        competitor_price_id=comp_price.id,
                        price=comp_price.price if comp_price.price else price
                    )
                    db.add(history)

                    # Update the current price
                    comp_price.price = price
                    comp_price.last_fetched_at = datetime.utcnow()
                    comp_price.fetch_status = 'success'
                    comp_price.fetch_error = None
                    # Schedule next update in 7 days
                    comp_price.next_update_at = datetime.utcnow() + timedelta(days=7)
                    updated_count += 1

                    logger.info(f"Updated price for {comp_price.competitor_url}: {price}")
                else:
                    comp_price.last_fetched_at = datetime.utcnow()
                    comp_price.fetch_status = 'error'
                    comp_price.fetch_error = 'Could not extract price from page'
                    # Retry in 1 day if fetch failed
                    comp_price.next_update_at = datetime.utcnow() + timedelta(days=1)

            except Exception as e:
                logger.error(f"Error updating {comp_price.competitor_url}: {str(e)}")
                comp_price.last_fetched_at = datetime.utcnow()
                comp_price.fetch_status = 'error'
                comp_price.fetch_error = str(e)
                comp_price.next_update_at = datetime.utcnow() + timedelta(days=1)

        db.commit()
        return updated_count

    except Exception as e:
        logger.error(f"Error updating competitor prices for product {product_id}: {str(e)}")
        return 0


async def update_all_competitor_prices() -> dict:
    """
    Update all competitor prices that are due for update.
    Called by scheduler weekly (or more frequently if needed).
    """
    db = SessionLocal()
    try:
        # Get all competitor price records due for update
        due_for_update = db.query(CompetitorProductPrice).filter(
            (CompetitorProductPrice.next_update_at <= datetime.utcnow()) |
            (CompetitorProductPrice.next_update_at.is_(None))
        ).all()

        if not due_for_update:
            logger.info("No competitor prices due for update")
            return {"status": "success", "updated": 0, "message": "No prices due for update"}

        logger.info(f"Starting update of {len(due_for_update)} competitor prices")

        total_updated = 0
        total_errors = 0

        # Process in batches to avoid overwhelming the system
        for comp_price in due_for_update:
            try:
                price = await scrape_competitor_price(comp_price.competitor_url)

                if price is not None:
                    # Store historical record
                    history = CompetitorPriceHistory(
                        competitor_price_id=comp_price.id,
                        price=comp_price.price if comp_price.price else price
                    )
                    db.add(history)

                    # Update the current price
                    comp_price.price = price
                    comp_price.last_fetched_at = datetime.utcnow()
                    comp_price.fetch_status = 'success'
                    comp_price.fetch_error = None
                    comp_price.next_update_at = datetime.utcnow() + timedelta(days=7)
                    total_updated += 1

                    logger.info(f"✓ Updated {comp_price.competitor_url}: {price}")
                else:
                    comp_price.last_fetched_at = datetime.utcnow()
                    comp_price.fetch_status = 'error'
                    comp_price.fetch_error = 'Price extraction failed'
                    comp_price.next_update_at = datetime.utcnow() + timedelta(days=1)
                    total_errors += 1

            except Exception as e:
                logger.error(f"✗ Error updating {comp_price.competitor_url}: {str(e)}")
                comp_price.last_fetched_at = datetime.utcnow()
                comp_price.fetch_status = 'error'
                comp_price.fetch_error = str(e)
                comp_price.next_update_at = datetime.utcnow() + timedelta(days=1)
                total_errors += 1

            # Small delay to avoid hammering servers
            await asyncio.sleep(0.5)

        db.commit()

        message = f"Updated {total_updated} prices, {total_errors} errors"
        logger.info(f"Competitor price update complete: {message}")

        return {
            "status": "success",
            "updated": total_updated,
            "errors": total_errors,
            "message": message
        }

    except Exception as e:
        logger.error(f"Fatal error in update_all_competitor_prices: {str(e)}")
        return {
            "status": "error",
            "updated": 0,
            "errors": 1,
            "message": str(e)
        }
    finally:
        db.close()
