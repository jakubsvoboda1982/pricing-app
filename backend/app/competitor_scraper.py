"""
Competitor price scraper for Czech/Slovak e-commerce sites.
Handles extraction of price data from common competitor URLs.
"""

import asyncio
import aiohttp
import json
import re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from sqlalchemy.orm import Session
from app.models import CompetitorProductPrice, CompetitorPriceHistory
from app.database import SessionLocal
import logging

logger = logging.getLogger(__name__)

# User agent — emuluje Chrome na Windows
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── Regexové zálohy ───────────────────────────────────────────────────────────
# Pořadí: specifické → obecné
PRICE_PATTERNS = [
    # data-price="299"  /  data-price='299'
    re.compile(r'data-price=["\']([0-9 ]+(?:[.,][0-9]{1,2})?)["\']', re.IGNORECASE),
    # <meta property="product:price:amount" content="299"/>
    re.compile(r'property=["\']product:price:amount["\'][^>]*content=["\']([0-9 ]+(?:[.,][0-9]{1,2})?)["\']', re.IGNORECASE),
    re.compile(r'content=["\']([0-9 ]+(?:[.,][0-9]{1,2})?)["\'][^>]*property=["\']product:price:amount["\']', re.IGNORECASE),
    # <meta itemprop="price" content="299">
    re.compile(r'itemprop=["\']price["\'][^>]*content=["\']([0-9 ]+(?:[.,][0-9]{1,2})?)["\']', re.IGNORECASE),
    re.compile(r'content=["\']([0-9 ]+(?:[.,][0-9]{1,2})?)["\'][^>]*itemprop=["\']price["\']', re.IGNORECASE),
    # <span class="price">299</span>  – různé varianty class
    re.compile(r'<[^>]+class="[^"]*(?:product-?price|price-?final|price-?current|cena)[^"]*"[^>]*>\s*(?:<[^>]+>)*([0-9 ]+(?:[.,][0-9]{1,2})?)\s*(?:Kč|CZK|€|EUR)?', re.IGNORECASE),
    # Obecný vzor: číslo + CZK/Kč v těsné blízkosti
    re.compile(r'\b([1-9][0-9]{0,5}(?:[.,][0-9]{1,2})?)\s*(?:Kč|CZK)\b', re.IGNORECASE),
]


async def fetch_page_content(url: str, timeout: int = 15) -> Optional[str]:
    """
    Stáhni stránku konkurenta. Posílá hlavičky reálného prohlížeče.
    """
    headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
    }
    try:
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(
                url, headers=headers,
                timeout=aiohttp.ClientTimeout(total=timeout),
                allow_redirects=True,
                max_redirects=5,
            ) as response:
                if response.status == 200:
                    # Zkus detekovat encoding ze Content-Type
                    ct = response.headers.get('Content-Type', '')
                    enc = 'utf-8'
                    if 'charset=' in ct:
                        enc = ct.split('charset=')[-1].split(';')[0].strip() or 'utf-8'
                    return await response.text(encoding=enc, errors='replace')
                else:
                    logger.warning(f"HTTP {response.status} při načítání {url}")
                    return None
    except asyncio.TimeoutError:
        logger.warning(f"Timeout: {url}")
        return None
    except Exception as e:
        logger.error(f"Chyba při načítání {url}: {e}")
        return None


def _clean_price(raw: str) -> Optional[Decimal]:
    """Očisti řetězec ceny a převeď na Decimal. Vrátí None při chybě."""
    try:
        cleaned = raw.replace('\xa0', '').replace(' ', '').replace(',', '.')
        # Odstraň přebytečné desetinné tečky (jen první nech)
        parts = cleaned.split('.')
        if len(parts) > 2:
            cleaned = parts[0] + '.' + ''.join(parts[1:])
        val = Decimal(cleaned)
        # Sanity check: 1 Kč – 99 999 Kč
        if Decimal('1') <= val <= Decimal('99999'):
            return val
    except Exception:
        pass
    return None


def _extract_from_json_ld(html: str) -> Optional[Decimal]:
    """Hledej JSON-LD blok <script type="application/ld+json"> s Product/offers."""
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                             html, re.DOTALL | re.IGNORECASE):
        try:
            data = json.loads(block)
            # Může být list nebo dict
            items = data if isinstance(data, list) else [data]
            for item in items:
                # Flatten @graph
                if '@graph' in item:
                    items.extend(item['@graph'])
                t = item.get('@type', '')
                if isinstance(t, list):
                    t = ' '.join(t)
                if 'product' not in t.lower() and 'offer' not in t.lower():
                    continue
                # Najdi offers
                offers = item.get('offers', item)
                if isinstance(offers, list):
                    offers = offers[0]
                price_raw = offers.get('price') or offers.get('lowPrice')
                if price_raw is not None:
                    val = _clean_price(str(price_raw))
                    if val:
                        return val
        except Exception:
            pass
    return None


def extract_price(html: str, url: str) -> Optional[Decimal]:
    """
    Extrahuj cenu z HTML.
    1) JSON-LD structured data (nejspolehlivější)
    2) Meta tagy a data-atributy
    3) Obecné regex vzory
    """
    if not html:
        return None

    # 1. JSON-LD
    price = _extract_from_json_ld(html)
    if price:
        logger.info(f"[JSON-LD] {url} → {price}")
        return price

    # 2+3. Regex vzory
    for pattern in PRICE_PATTERNS:
        matches = pattern.findall(html)
        for raw in matches:
            val = _clean_price(raw)
            if val:
                logger.info(f"[regex] {url} → {val}")
                return val

    logger.warning(f"Cena nenalezena: {url}")
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
