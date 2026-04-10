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

# Mapování TLD domény → měna / trh
_TLD_TO_CURRENCY = {
    '.cz': 'CZK',
    '.sk': 'EUR',
    '.hu': 'HUF',
}
_TLD_TO_MARKET = {
    '.cz': 'CZ',
    '.sk': 'SK',
    '.hu': 'HU',
}

def _currency_from_url(url: str) -> str:
    """Odvoď měnu z TLD domény URL. Fallback: CZK."""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ''
        for tld, currency in _TLD_TO_CURRENCY.items():
            if host.endswith(tld):
                return currency
    except Exception:
        pass
    return 'CZK'

def _market_from_url(url: str) -> str:
    """Odvoď trh (CZ/SK/HU) z TLD domény URL. Fallback: CZ."""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ''
        for tld, market in _TLD_TO_MARKET.items():
            if host.endswith(tld):
                return market
    except Exception:
        pass
    return 'CZ'

# User agent — emuluje Chrome na Windows
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── Regexové vzory pro extrakci ceny ─────────────────────────────────────────
# Pořadí: specifické → obecné
# Číslo s mezerou jako oddělovačem tisíců: "1 399" nebo "1&nbsp;399"
_NUM = r'([1-9][0-9]{0,2}(?:[\xa0\u00a0 \u202f][0-9]{3})*(?:[.,][0-9]{1,2})?)'

PRICE_PATTERNS = [
    # data-price="299" / data-price-dph="299" / data-original-price="299"
    re.compile(r'data-(?:price|price-dph|original-price|sale-price)=["\']' + _NUM + r'["\']', re.IGNORECASE),
    # <meta property="product:price:amount" content="299"/>
    re.compile(r'property=["\']product:price:amount["\'][^>]*content=["\']' + _NUM + r'["\']', re.IGNORECASE),
    re.compile(r'content=["\']' + _NUM + r'["\'][^>]*property=["\']product:price:amount["\']', re.IGNORECASE),
    # <meta itemprop="price" content="299">
    re.compile(r'itemprop=["\']price["\'][^>]*content=["\']' + _NUM + r'["\']', re.IGNORECASE),
    re.compile(r'content=["\']' + _NUM + r'["\'][^>]*itemprop=["\']price["\']', re.IGNORECASE),
    # Shoptet CZ – nejrozšířenější platforma v ČR
    # <strong class="price-final__price">399</strong>
    re.compile(r'class=["\'][^"\']*price-final[^"\']*["\'][^>]*>\s*(?:<[^>]+>)*\s*' + _NUM, re.IGNORECASE),
    # <p class="price-wrapper ..."><strong>399</strong>
    re.compile(r'class=["\'][^"\']*price-wrapper[^"\']*["\'][^>]*>.*?' + _NUM + r'\s*(?:Kč|CZK|€|EUR)?', re.IGNORECASE | re.DOTALL),
    # WooCommerce: <span class="woocommerce-Price-amount amount">
    re.compile(r'woocommerce-Price-amount[^>]*>\s*(?:<[^>]+>)*\s*' + _NUM, re.IGNORECASE),
    # PrestaShop: <span class="price" ...> / .current-price-value
    re.compile(r'class=["\'][^"\']*current-price[^"\']*["\'][^>]*>\s*(?:<[^>]+>)*\s*' + _NUM, re.IGNORECASE),
    # Magento/obecné: class obsahující "price"
    re.compile(r'<[^>]+class="[^"]*(?:product-?price|price-?final|price-?current|final-?price|selling-?price|sale-?price|our-?price|cena-?final)[^"]*"[^>]*>\s*(?:<[^>]+>)*\s*' + _NUM + r'\s*(?:Kč|CZK|€|EUR)?', re.IGNORECASE),
    # JSON v atributu nebo skriptu: "price":"399" / "price":399
    re.compile(r'"(?:price|cena|Price)":\s*["\']?' + _NUM + r'["\']?', re.IGNORECASE),
    # Poslední záchrana: číslo těsně před nebo za Kč/CZK
    re.compile(r'\b' + _NUM + r'\s*(?:Kč|CZK)\b', re.IGNORECASE),
    re.compile(r'(?:Kč|CZK)\s*' + _NUM + r'\b', re.IGNORECASE),
]


async def fetch_page_content(url: str, timeout: int = 20) -> Optional[str]:
    """
    Stáhni stránku konkurenta. Posílá hlavičky reálného prohlížeče.
    """
    try:
        # Sestav Referer z domény URL
        from urllib.parse import urlparse
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        origin = "https://www.google.com"

    headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs-CZ,cs;q=0.9,sk;q=0.8,en-US;q=0.7,en;q=0.6',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Referer': origin,
    }
    try:
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(
                url, headers=headers,
                timeout=aiohttp.ClientTimeout(total=timeout),
                allow_redirects=True,
                max_redirects=10,
            ) as response:
                if response.status == 200:
                    ct = response.headers.get('Content-Type', '')
                    enc = 'utf-8'
                    if 'charset=' in ct:
                        enc = ct.split('charset=')[-1].split(';')[0].strip() or 'utf-8'
                    return await response.text(encoding=enc, errors='replace')
                elif response.status in (301, 302, 303, 307, 308):
                    logger.warning(f"Redirect nesledován správně: {url} → {response.status}")
                    return None
                else:
                    logger.warning(f"HTTP {response.status} při načítání {url}")
                    return None
    except asyncio.TimeoutError:
        logger.warning(f"Timeout ({timeout}s): {url}")
        return None
    except Exception as e:
        logger.error(f"Chyba při načítání {url}: {e}")
        return None


def _clean_price(raw: str) -> Optional[Decimal]:
    """Očisti řetězec ceny a převeď na Decimal. Vrátí None při chybě."""
    try:
        # Odstraň mezery jako oddělovače tisíců (nbsp, narrow nbsp, normální mezera)
        cleaned = raw.replace('\xa0', '').replace('\u202f', '').replace(' ', '')
        # Odstraň non-numeric chars kromě čárky a tečky
        cleaned = re.sub(r'[^\d.,]', '', cleaned)
        if not cleaned:
            return None
        # Detekuj formát: pokud je čárka na poslední pozici před 2 čísly → desetinný oddělovač
        # "399,00" → 399.00, "1.399,00" → 1399.00, "1,399.00" → 1399.00
        if ',' in cleaned and '.' in cleaned:
            # Oba oddělovače — urči který je tisícový a který desetinný
            last_comma = cleaned.rfind(',')
            last_dot = cleaned.rfind('.')
            if last_comma > last_dot:
                # "1.399,00" — tečka tisícová, čárka desetinná
                cleaned = cleaned.replace('.', '').replace(',', '.')
            else:
                # "1,399.00" — čárka tisícová, tečka desetinná
                cleaned = cleaned.replace(',', '')
        elif ',' in cleaned:
            # Zkontroluj: je čárka desetinný oddělovač nebo tisícový?
            parts = cleaned.split(',')
            if len(parts) == 2 and len(parts[1]) <= 2:
                # "399,00" → desetinný oddělovač
                cleaned = cleaned.replace(',', '.')
            else:
                # "1,399" → tisícový oddělovač
                cleaned = cleaned.replace(',', '')
        val = Decimal(cleaned)
        # Sanity check: 1 – 99 999
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
            items = data if isinstance(data, list) else [data]
            # Flatten @graph
            expanded = []
            for item in items:
                expanded.append(item)
                if isinstance(item, dict) and '@graph' in item:
                    expanded.extend(item['@graph'])

            for item in expanded:
                if not isinstance(item, dict):
                    continue
                t = item.get('@type', '')
                if isinstance(t, list):
                    t = ' '.join(t)
                t = t.lower()

                # Přijmi Product, Offer, nebo cokoliv s offers
                if 'product' in t or 'offer' in t or 'offers' in item:
                    # Hledej v offers nebo přímo v item
                    offers_raw = item.get('offers', item)
                    offer_list = offers_raw if isinstance(offers_raw, list) else [offers_raw]
                    for offer in offer_list:
                        if not isinstance(offer, dict):
                            continue
                        for key in ('price', 'lowPrice', 'highPrice', 'Price'):
                            price_raw = offer.get(key)
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


def _extract_product_name(html: str) -> Optional[str]:
    """Extrahuj název produktu z HTML (JSON-LD → og:title → <title>)."""
    # 1. JSON-LD name
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                             html, re.DOTALL | re.IGNORECASE):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and '@graph' in item:
                    items = items + item['@graph']
                if isinstance(item, dict) and item.get('@type', '').lower() in ('product', 'productgroup'):
                    name = item.get('name')
                    if name and isinstance(name, str):
                        return name.strip()
        except Exception:
            pass
    # 2. og:title
    m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]*content=["\']([^"\']{3,200})["\']', html, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    m = re.search(r'<meta[^>]+content=["\']([^"\']{3,200})["\'][^>]*property=["\']og:title["\']', html, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    # 3. <title>
    m = re.search(r'<title[^>]*>([^<]{3,200})</title>', html, re.IGNORECASE)
    if m:
        # Strip shop name suffix (after " | " or " - ")
        title = m.group(1).strip()
        for sep in [' | ', ' – ', ' - ', ' :: ']:
            if sep in title:
                title = title.split(sep)[0].strip()
        if len(title) >= 3:
            return title
    return None


def _detect_variants(html: str) -> list[dict]:
    """
    Detekuj varianty produktu z HTML.
    Vrátí seznam: [{label: str, url: str|None, price: float|None}]
    """
    variants: list[dict] = []

    # 1. JSON-LD hasVariant (ProductGroup nebo Product)
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                             html, re.DOTALL | re.IGNORECASE):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and '@graph' in item:
                    items = items + item['@graph']
                if not isinstance(item, dict):
                    continue
                # hasVariant on Product or ProductGroup
                has_variant = item.get('hasVariant') or (
                    item.get('@type', '').lower() == 'productgroup' and item.get('hasVariant')
                )
                if has_variant and isinstance(has_variant, list):
                    for v in has_variant:
                        if not isinstance(v, dict):
                            continue
                        label = v.get('name', '')
                        if not label:
                            # Build label from variesBy attributes
                            attrs = v.get('additionalProperty', [])
                            if isinstance(attrs, list):
                                label = ' / '.join(
                                    a.get('value', '') for a in attrs
                                    if isinstance(a, dict) and a.get('value')
                                )
                        offer = v.get('offers') or {}
                        if isinstance(offer, list):
                            offer = offer[0] if offer else {}
                        price_raw = offer.get('price') if isinstance(offer, dict) else None
                        price_val = None
                        if price_raw is not None:
                            p = _clean_price(str(price_raw))
                            price_val = float(p) if p else None
                        url_val = v.get('url') or (offer.get('url') if isinstance(offer, dict) else None)
                        if label:
                            variants.append({'label': str(label).strip(), 'url': url_val, 'price': price_val})
                    if variants:
                        return variants
        except Exception:
            pass

    # 2. Shoptet / WooCommerce / PrestaShop variant buttons in HTML
    # Look for <option> or data-variant / data-option elements
    # Pattern: <option value="..." data-price="...">Label</option>
    option_pattern = re.compile(
        r'<option\b[^>]*value=["\']([^"\']*)["\'][^>]*>([^<]{2,80})</option>',
        re.IGNORECASE
    )
    for m in option_pattern.finditer(html):
        val, label = m.group(1).strip(), m.group(2).strip()
        # Filter out obviously non-variant options
        if not val or label.lower() in ('vyberte', 'choose', 'select', '-- vyberte --', ''):
            continue
        if any(skip in label.lower() for skip in ('košík', 'cart', 'compare', 'wishlist')):
            continue
        variants.append({'label': label, 'url': None, 'price': None})
        if len(variants) >= 20:
            break

    return variants


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


async def preview_competitor_url(url: str) -> dict:
    """
    Fetch a competitor URL and return a structured preview:
    detected_name, detected_price, detected_currency, variants list.
    Used before saving a tracked URL so the user can confirm/select the right variant.
    """
    html = await fetch_page_content(url)
    if not html:
        return {
            "ok": False,
            "error": "Stránku se nepodařilo načíst (timeout nebo blokování)",
            "detected_name": None,
            "detected_price": None,
            "detected_currency": _currency_from_url(url),
            "variants": [],
        }

    name = _extract_product_name(html)
    price = extract_price(html, url)
    variants = _detect_variants(html)
    currency = _currency_from_url(url)

    return {
        "ok": True,
        "error": None,
        "detected_name": name,
        "detected_price": float(price) if price else None,
        "detected_currency": currency,
        "variants": variants,
    }


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

                    # Update the current price + oprav měnu/trh z domény (pro staré záznamy)
                    correct_currency = _currency_from_url(comp_price.competitor_url)
                    correct_market = _market_from_url(comp_price.competitor_url)
                    comp_price.price = price
                    comp_price.currency = correct_currency
                    comp_price.market = correct_market
                    comp_price.last_fetched_at = datetime.utcnow()
                    comp_price.fetch_status = 'success'
                    comp_price.fetch_error = None
                    # Schedule next update in 7 days
                    comp_price.next_update_at = datetime.utcnow() + timedelta(days=7)
                    updated_count += 1

                    logger.info(f"Updated price for {comp_price.competitor_url}: {price} {correct_currency}")
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

                    # Update the current price + oprav měnu/trh z domény
                    correct_currency = _currency_from_url(comp_price.competitor_url)
                    correct_market = _market_from_url(comp_price.competitor_url)
                    comp_price.price = price
                    comp_price.currency = correct_currency
                    comp_price.market = correct_market
                    comp_price.last_fetched_at = datetime.utcnow()
                    comp_price.fetch_status = 'success'
                    comp_price.fetch_error = None
                    comp_price.next_update_at = datetime.utcnow() + timedelta(days=7)
                    total_updated += 1

                    logger.info(f"✓ Updated {comp_price.competitor_url}: {price} {correct_currency}")
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
