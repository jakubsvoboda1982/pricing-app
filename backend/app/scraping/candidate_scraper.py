"""
Candidate Scraper – scrape produktové stránky, normalizace, uložení do DB.

Každá produktová stránka u konkurenta → jeden CompetitorCandidate záznam.

Extrahuje:
  - Název produktu (h1 > JSON-LD > og:title > title)
  - Cena (přes existing PRICE_PATTERNS + JSON-LD)
  - Gramáž (z názvu + JSON-LD + meta tagů)
  - Brand / výrobce (JSON-LD + meta tag)
  - Dostupnost (JSON-LD InStock/OutOfStock + keywords v textu)
  - Structured data (JSON-LD blok celý)

Normalizace:
  - normalize_text() na název
  - extract_canonical() → canonical_attributes_json
  - compute_unit_price_per_kg() → unit_price_per_kg

Change detection:
  - SHA-256 obsahu → content_hash
  - Pokud hash stejný jako předchozí → přeskočíme update (rychlé)

Použití:
    result = await scrape_and_save_candidate(
        url="https://grizly.cz/kesu-prazene-1kg",
        competitor_id="uuid...",
        source_url="https://grizly.cz/kesu",
        guard=guard,
        db=db,
    )
"""

import hashlib
import json
import logging
import re
from decimal import Decimal
from typing import Optional
from urllib.parse import urlparse

import aiohttp
import asyncio

from sqlalchemy.orm import Session

from app.models.competitor_candidate import CompetitorCandidate
from app.normalization.normalizer import (
    normalize_text,
    extract_canonical,
    compute_unit_price_per_kg,
    extract_weight_g,
)
from app.scraping.domain_guard import DomainGuard, BlockedDomainError, CooldownError

# Importujeme existující price extraction logiku z competitor_scraper
from app.competitor_scraper import extract_price, _clean_price

logger = logging.getLogger(__name__)

FETCH_TIMEOUT_S = 25

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── Extrakce názvu ─────────────────────────────────────────────────────────────

def _extract_name(html: str) -> Optional[str]:
    """
    Pokus o extrakci názvu produktu v pořadí spolehlivosti:
      1. JSON-LD Product.name
      2. <meta property="og:title">
      3. <h1> první výskyt
      4. <title> (záchrana)
    """
    # 1. JSON-LD
    for block in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    ):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                t = item.get("@type", "")
                if isinstance(t, list):
                    t = " ".join(t)
                if "product" in t.lower():
                    name = item.get("name", "")
                    if name and isinstance(name, str) and len(name) > 3:
                        return name.strip()
        except Exception:
            pass

    # 2. og:title
    m = re.search(
        r'<meta[^>]+property=["\']og:title["\'][^>]*content=["\']([^"\']{5,300})["\']',
        html, re.IGNORECASE
    )
    if not m:
        m = re.search(
            r'<meta[^>]+content=["\']([^"\']{5,300})["\'][^>]*property=["\']og:title["\']',
            html, re.IGNORECASE
        )
    if m:
        return m.group(1).strip()

    # 3. <h1>
    m = re.search(r'<h1[^>]*>\s*(.*?)\s*</h1>', html, re.DOTALL | re.IGNORECASE)
    if m:
        raw = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        if len(raw) > 3:
            return raw

    # 4. <title>
    m = re.search(r'<title[^>]*>\s*(.*?)\s*</title>', html, re.DOTALL | re.IGNORECASE)
    if m:
        raw = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        # Odstraň " | Název shopu" suffix
        raw = re.split(r'\s*[\|–\-]\s*', raw)[0].strip()
        if len(raw) > 3:
            return raw

    return None


# ── Extrakce brandu ────────────────────────────────────────────────────────────

def _extract_brand(html: str) -> Optional[str]:
    """
    Extrahuje brand / výrobce z JSON-LD nebo meta tagů.
    """
    # JSON-LD Product.brand nebo Product.manufacturer
    for block in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    ):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                t = item.get("@type", "")
                if isinstance(t, list):
                    t = " ".join(t)
                if "product" in t.lower():
                    # brand může být string nebo {"@type": "Brand", "name": "..."}
                    brand = item.get("brand") or item.get("manufacturer")
                    if isinstance(brand, dict):
                        brand = brand.get("name", "")
                    if brand and isinstance(brand, str) and len(brand) > 1:
                        return brand.strip()
        except Exception:
            pass

    # <meta itemprop="brand">
    m = re.search(
        r'itemprop=["\']brand["\'][^>]*content=["\']([^"\']{2,100})["\']',
        html, re.IGNORECASE
    )
    if not m:
        m = re.search(
            r'content=["\']([^"\']{2,100})["\'][^>]*itemprop=["\']brand["\']',
            html, re.IGNORECASE
        )
    if m:
        return m.group(1).strip()

    return None


# ── Extrakce dostupnosti ───────────────────────────────────────────────────────

_AVAILABLE_SIGNALS = re.compile(
    r"(?:in.?stock|skladem|dostupn[éeá]|k\s*dispozici|na\s*sk[la]ad[eě]|"
    r"ihned\s*k\s*dodání|available|instock)",
    re.IGNORECASE
)

_UNAVAILABLE_SIGNALS = re.compile(
    r"(?:out.?of.?stock|není\s*(?:skladem|dostupn)|nedostupn|"
    r"dočasně\s*nedostupn|temporarily\s*(?:out|unavail)|"
    r"doprodáno|sold.?out|unavailable|outofstock)",
    re.IGNORECASE
)


def _extract_availability(html: str) -> Optional[bool]:
    """
    True  = produkt je skladem / dostupný
    False = není skladem
    None  = nedokážeme určit
    """
    # 1. JSON-LD offers.availability
    for block in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    ):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                offers_raw = item.get("offers", None)
                if offers_raw is None:
                    continue
                offer_list = offers_raw if isinstance(offers_raw, list) else [offers_raw]
                for offer in offer_list:
                    if not isinstance(offer, dict):
                        continue
                    avail = offer.get("availability", "")
                    if isinstance(avail, str):
                        al = avail.lower()
                        if "instock" in al or "in_stock" in al:
                            return True
                        if "outofstock" in al or "out_of_stock" in al or "discontinued" in al:
                            return False
        except Exception:
            pass

    # 2. Schema.org itemprop="availability"
    m = re.search(
        r'itemprop=["\']availability["\'][^>]*(?:content|href)=["\']([^"\']+)["\']',
        html, re.IGNORECASE
    )
    if m:
        val = m.group(1).lower()
        if "instock" in val or "in_stock" in val:
            return True
        if "outofstock" in val or "out_of_stock" in val:
            return False

    # 3. Text heuristika (přístup k relevantní části stránky)
    # Hledáme v prvních 5000 znacích (hlavní obsah)
    snippet = html[:10000]

    if _UNAVAILABLE_SIGNALS.search(snippet):
        return False
    if _AVAILABLE_SIGNALS.search(snippet):
        return True

    return None


# ── Extrakce structured data (celý JSON-LD blok) ──────────────────────────────

def _extract_structured_data(html: str) -> dict:
    """
    Vrátí první JSON-LD blok s @type=Product jako dict.
    Používáme pro scoring bonus a budoucí enrichment.
    """
    for block in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    ):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                t = item.get("@type", "")
                if isinstance(t, list):
                    t = " ".join(t)
                if "product" in t.lower():
                    return item
        except Exception:
            pass
    return {}


# ── Extrakce weight z JSON-LD / meta ──────────────────────────────────────────

def _extract_weight_from_structured(html: str) -> Optional[int]:
    """
    Pokusí se extrahovat gramáž z JSON-LD (weight property) nebo meta tagů.
    Vrátí gramáže jako int nebo None.
    """
    for block in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    ):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if not isinstance(item, dict):
                    continue
                # weight může být {"value": 1000, "unitCode": "GRM"} nebo "1 kg"
                weight_raw = item.get("weight") or item.get("netWeight")
                if weight_raw is None:
                    continue
                if isinstance(weight_raw, dict):
                    val = weight_raw.get("value", "")
                    unit = weight_raw.get("unitCode", "GRM").upper()
                    try:
                        v = float(str(val).replace(",", "."))
                        if unit in ("KGM", "KG"):
                            return round(v * 1000)
                        else:  # GRM, G
                            return round(v)
                    except Exception:
                        pass
                elif isinstance(weight_raw, (str, int, float)):
                    g = extract_weight_g(str(weight_raw))
                    if g:
                        return g
        except Exception:
            pass
    return None


# ── HTTP fetch ─────────────────────────────────────────────────────────────────

async def _fetch_product_html(
    url: str,
    guard: DomainGuard,
    crawl_delay_s: float,
) -> Optional[str]:
    """Stáhne HTML produktové stránky přes DomainGuard."""
    try:
        await guard.wait_and_acquire(url, crawl_delay_override=crawl_delay_s)
    except (BlockedDomainError, CooldownError) as e:
        logger.warning(f"[candidate_scraper] Skipping {url}: {e}")
        return None

    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "cs-CZ,cs;q=0.9,sk;q=0.8,en;q=0.6",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    }

    try:
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=FETCH_TIMEOUT_S),
                allow_redirects=True,
                max_redirects=5,
            ) as resp:
                status = resp.status
                if status == 200:
                    guard.record_success(url)
                    ct = resp.headers.get("Content-Type", "")
                    enc = "utf-8"
                    if "charset=" in ct:
                        enc = ct.split("charset=")[-1].split(";")[0].strip() or "utf-8"
                    return await resp.text(encoding=enc, errors="replace")
                else:
                    guard.record_error(url, status_code=status)
                    logger.warning(f"[candidate_scraper] HTTP {status}: {url}")
                    return None
    except asyncio.TimeoutError:
        guard.record_error(url, reason="timeout")
        return None
    except Exception as e:
        guard.record_error(url, reason=str(e)[:100])
        logger.error(f"[candidate_scraper] Fetch error {url}: {e}")
        return None


# ── Hlavní scraping funkce ─────────────────────────────────────────────────────

class ScrapedProduct:
    """Mezivýsledek scrapingu – surová extrahovaná data."""
    __slots__ = (
        "url", "name_raw", "brand_raw",
        "price_value", "price_raw", "currency",
        "weight_g", "weight_raw",
        "unit_price_per_kg",
        "is_available",
        "canonical_attrs",
        "structured_data",
        "content_hash",
        "has_structured_data",
    )

    def __init__(self):
        self.url: str = ""
        self.name_raw: Optional[str] = None
        self.brand_raw: Optional[str] = None
        self.price_value: Optional[Decimal] = None
        self.price_raw: Optional[str] = None
        self.currency: str = "CZK"
        self.weight_g: Optional[int] = None
        self.weight_raw: Optional[str] = None
        self.unit_price_per_kg: Optional[float] = None
        self.is_available: Optional[bool] = None
        self.canonical_attrs: dict = {}
        self.structured_data: dict = {}
        self.content_hash: Optional[str] = None
        self.has_structured_data: bool = False


def _scrape_html(html: str, url: str) -> ScrapedProduct:
    """
    Synchronní extrakce všech dat z HTML.
    Vrátí ScrapedProduct s vyplněnými poli.
    """
    p = ScrapedProduct()
    p.url = url

    # Content hash (SHA-256 prvních 50kB – rychle detekuje změny)
    snippet = html[:50000].encode("utf-8", errors="replace")
    p.content_hash = hashlib.sha256(snippet).hexdigest()

    # Structured data
    p.structured_data = _extract_structured_data(html)
    p.has_structured_data = bool(p.structured_data)

    # Název
    p.name_raw = _extract_name(html)

    # Brand
    p.brand_raw = _extract_brand(html)

    # Cena (přes existující logiku z competitor_scraper.py)
    p.price_value = extract_price(html, url)
    if p.price_value:
        # Zjisti raw string pro audit
        p.price_raw = str(p.price_value)

    # Gramáž – nejprve zkus JSON-LD, pak název
    p.weight_g = _extract_weight_from_structured(html)
    if not p.weight_g and p.name_raw:
        p.weight_g = extract_weight_g(p.name_raw)
        if p.weight_g:
            p.weight_raw = p.name_raw

    # Dostupnost
    p.is_available = _extract_availability(html)

    # Unit price
    if p.price_value and p.weight_g:
        up = compute_unit_price_per_kg(float(p.price_value), p.weight_g)
        p.unit_price_per_kg = up

    # Canonical atributy (normalizace přes normalizer.py)
    if p.name_raw:
        try:
            # Zjisti kategorii z URL (poslední neterminální segment jako hint)
            parsed_url = urlparse(url)
            path_parts = [s for s in parsed_url.path.split("/") if s]
            category_hint = path_parts[-2] if len(path_parts) >= 2 else None

            attrs = extract_canonical(
                name=p.name_raw,
                category=category_hint,
                manufacturer=p.brand_raw,
            )
            p.canonical_attrs = attrs.to_dict()
            # Pokud gramáž z JSON-LD ale ne z názvu, doplníme do canonical
            if p.weight_g and not attrs.target_weight_g:
                p.canonical_attrs["target_weight_g"] = p.weight_g
        except Exception as e:
            logger.warning(f"[candidate_scraper] Canonical extraction failed for {url}: {e}")

    return p


async def scrape_and_save_candidate(
    url: str,
    competitor_id: str,
    source_url: str,
    guard: DomainGuard,
    db: Session,
    crawl_delay_s: float = 3.0,
    force_update: bool = False,
) -> Optional[CompetitorCandidate]:
    """
    Scrape URL produktové stránky a uloží/aktualizuje CompetitorCandidate záznam.

    Parametry:
        url             – URL produktové stránky
        competitor_id   – UUID konkurenta
        source_url      – URL listingu odkud byl produkt nalezen
        guard           – DomainGuard (rate limiting)
        db              – SQLAlchemy session
        crawl_delay_s   – min. delay mezi requesty
        force_update    – ignoruj content_hash, vždy aktualizuj

    Vrátí:
        CompetitorCandidate nebo None při chybě.
    """
    # Zkontroluj existující záznam dle URL
    existing: Optional[CompetitorCandidate] = (
        db.query(CompetitorCandidate)
        .filter_by(competitor_id=competitor_id, discovered_url=url)
        .first()
    )

    # Fetch HTML
    html = await _fetch_product_html(url, guard, crawl_delay_s)
    if not html:
        return existing  # Vrátíme starý záznam pokud existuje

    # Extrakce dat
    scraped = _scrape_html(html, url)

    # Change detection – přeskočíme update pokud obsah stejný
    if (
        not force_update
        and existing
        and existing.content_hash
        and existing.content_hash == scraped.content_hash
    ):
        logger.debug(f"[candidate_scraper] No change detected for {url}, skipping")
        return existing

    # Uložení / aktualizace
    if existing:
        candidate = existing
    else:
        candidate = CompetitorCandidate(
            competitor_id=competitor_id,
            source_url=source_url,
            discovered_url=url,
            currency="CZK",
        )
        db.add(candidate)

    # Vyplníme pole
    candidate.product_name_raw = scraped.name_raw
    candidate.brand_raw = scraped.brand_raw
    candidate.price_value = scraped.price_value
    candidate.price_raw = scraped.price_raw
    candidate.weight_g = scraped.weight_g
    candidate.weight_raw = scraped.weight_raw
    candidate.unit_price_per_kg = scraped.unit_price_per_kg
    candidate.is_available = scraped.is_available
    candidate.canonical_attributes_json = scraped.canonical_attrs
    candidate.scraped_structured_data_json = scraped.structured_data
    candidate.content_hash = scraped.content_hash

    # Normalized name
    if scraped.name_raw:
        candidate.product_name_normalized = normalize_text(scraped.name_raw)

    try:
        db.flush()
        logger.info(
            f"[candidate_scraper] Saved candidate: {scraped.name_raw!r} "
            f"price={scraped.price_value} weight={scraped.weight_g}g "
            f"available={scraped.is_available} url={url}"
        )
        return candidate
    except Exception as e:
        logger.error(f"[candidate_scraper] DB save failed for {url}: {e}")
        db.rollback()
        return None


async def scrape_batch(
    urls: list[str],
    competitor_id: str,
    source_url: str,
    guard: DomainGuard,
    db: Session,
    crawl_delay_s: float = 3.0,
    max_concurrent: int = 1,  # Konzervativní default – jedna stránka najednou
) -> list[CompetitorCandidate]:
    """
    Scrapuje seznam produktových URL pro jednoho konkurenta.
    Zpracovává sekvenčně (max_concurrent=1 jako default) kvůli anti-ban ochraně.

    Vrátí seznam úspěšně uložených CompetitorCandidate záznamů.
    """
    results = []

    if max_concurrent <= 1:
        # Čistě sekvenční zpracování
        for url in urls:
            candidate = await scrape_and_save_candidate(
                url=url,
                competitor_id=competitor_id,
                source_url=source_url,
                guard=guard,
                db=db,
                crawl_delay_s=crawl_delay_s,
            )
            if candidate:
                results.append(candidate)
    else:
        # Paralelní zpracování s limitem konkurence (pro různé domény)
        semaphore = asyncio.Semaphore(max_concurrent)

        async def scrape_one(url: str) -> None:
            async with semaphore:
                candidate = await scrape_and_save_candidate(
                    url=url,
                    competitor_id=competitor_id,
                    source_url=source_url,
                    guard=guard,
                    db=db,
                    crawl_delay_s=crawl_delay_s,
                )
                if candidate:
                    results.append(candidate)

        await asyncio.gather(*[scrape_one(u) for u in urls], return_exceptions=True)

    return results
