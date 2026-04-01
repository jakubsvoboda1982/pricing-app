"""
Discovery – extrakce URL kandidátních produktů z listing / kategorie stránek.

Vstup:  URL listingu (kategorie / vyhledávání) u konkurenta
Výstup: seznam URL produktových stránek (deduplikovaný, filtrovaný)

Logika:
  1. Fetch listing stránky (přes DomainGuard)
  2. Extrahuj všechny <a href> linky
  3. Filtruj:
     - musí být stejná doména nebo subdoména
     - nepatří do kategorie navigace / CMS / admin
     - musí vypadat jako produktová stránka (heuristiky viz níže)
  4. Deduplikuj, normalizuj (strip query params nepatřičné pro produkty)
  5. Vrať max. MAX_CANDIDATES URL
"""

import asyncio
import logging
import re
from typing import Optional
from urllib.parse import urljoin, urlparse, urlunparse, parse_qs, urlencode

import aiohttp

from app.scraping.domain_guard import DomainGuard, BlockedDomainError, CooldownError

logger = logging.getLogger(__name__)

# ── Konstanty ─────────────────────────────────────────────────────────────────

MAX_CANDIDATES = 50         # Max. kandidátů z jednoho listingu
FETCH_TIMEOUT_S = 25        # Timeout pro stažení listing stránky

# User agent – konzistentní s competitor_scraper.py
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── Negativní filtry – URL obsahující tyto segmenty nejsou produkty ──────────

_SKIP_PATH_SEGMENTS = frozenset({
    # Navigace / CMS
    "login", "logout", "register", "signup", "cart", "checkout", "payment",
    "kontakt", "contact", "o-nas", "about", "pomoc", "help", "faq",
    "doprava", "doručení", "delivery", "shipping",
    "obchodní-podmínky", "gdpr", "privacy", "cookies",
    "blog", "clanek", "article", "novinky", "news", "aktuality",
    "sitemap", "rss", "feed", "xml",
    # Admin / tech
    "admin", "cms", "api", "static", "cdn", "media", "images", "img",
    "css", "js", "fonts", "assets",
    # Účet
    "muj-ucet", "account", "profile", "wishlist",
    # Kategorie URL konce (příliš obecné)
    "kategorie", "category", "tag", "brand", "znacka",
})

# Soubory – přeskočit
_SKIP_EXTENSIONS = frozenset({
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
    ".zip", ".rar", ".doc", ".docx", ".xls", ".xlsx",
    ".mp4", ".mp3", ".avi",
})

# ── Pozitivní heuristiky – URL pravděpodobně je produkt ──────────────────────

# Path segmenty typické pro produktové URL (Shoptet, WooCommerce, Magento, Prestashop)
_PRODUCT_PATH_SIGNALS = re.compile(
    r"/(?:produkt|product|zbozi|item|p|detail|eshop|obchod)/"
    r"|[/-]\d{4,}"          # URL obsahuje ID 4+ číslic
    r"|[/-][a-z0-9]{8,}$",  # hash / slug na konci
    re.IGNORECASE
)

# Typická Shoptet URL: /nazev-produktu/p12345 nebo /kategorie/nazev-produktu/
_SHOPTET_PRODUCT_RE = re.compile(r"/p\d{3,}\b", re.IGNORECASE)

# WooCommerce: /product/nazev-produktu/
_WOO_PRODUCT_RE = re.compile(r"/product/[^/?#]+/?$", re.IGNORECASE)

# PrestaShop: /123-nazev-produktu.html nebo nazev.html
_PRESTASHOP_RE = re.compile(r"/\d{2,}-[^/?#]+\.html$", re.IGNORECASE)

# Obecná heuristika: URL path má 2–4 segmenty a poslední vypadá jako slug
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{3,80}$", re.IGNORECASE)


# ── Pomocné funkce ─────────────────────────────────────────────────────────────

def _normalize_url(url: str) -> str:
    """
    Odstraní neužitečné query parametry (UTM, session tokeny),
    zachová ty, které jsou součástí identity produktu (id, pid, product_id).
    """
    try:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/") or "/"  # Normalizuj trailing slash

        keep_params = {"id", "pid", "product_id", "productId", "item_id"}
        qs = parse_qs(parsed.query, keep_blank_values=False)
        filtered = {k: v for k, v in qs.items() if k.lower() in keep_params}
        new_query = urlencode(filtered, doseq=True)

        return urlunparse((
            parsed.scheme, parsed.netloc.lower(),
            path, parsed.params, new_query, ""  # bez fragmentu
        ))
    except Exception:
        return url


def _same_domain(url: str, base_domain: str) -> bool:
    """Zkontroluje, zda URL patří stejné doméně (nebo subdoméně)."""
    try:
        parsed = urlparse(url)
        host = parsed.netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return host == base_domain or host.endswith("." + base_domain)
    except Exception:
        return False


def _is_product_url(url: str) -> bool:
    """
    Heuristicky určí, zda URL pravděpodobně odkazuje na produktovou stránku.
    Vrátí True pokud URL splňuje alespoň jeden pozitivní signál.
    """
    try:
        parsed = urlparse(url)
        path = parsed.path.lower()
        path_parts = [p for p in path.split("/") if p]

        # Negativní filtry
        for part in path_parts:
            if part in _SKIP_PATH_SEGMENTS:
                return False

        # Přípony souborů
        for ext in _SKIP_EXTENSIONS:
            if path.endswith(ext):
                return False

        # Platformně specifické signály – kontroluj PŘED length filtrem
        # (Shoptet /p12345 může být jednoprvkový path)
        if _SHOPTET_PRODUCT_RE.search(path):
            return True
        if _WOO_PRODUCT_RE.search(path):
            return True
        if _PRESTASHOP_RE.search(path):
            return True

        # Příliš krátká cesta (homepage, top-level kategorie) po platform check
        if len(path_parts) < 2:
            return False

        # Obecné produktové URL signály
        if _PRODUCT_PATH_SIGNALS.search(path):
            return True

        # Fallback: 2+ segmenty a poslední vypadá jako slug
        last_segment = path_parts[-1]
        # Odstraň .html / .htm
        last_segment = re.sub(r"\.(html?|php|aspx?)$", "", last_segment)
        if _SLUG_RE.match(last_segment) and len(path_parts) >= 2:
            # Bonus: slug je dost specifický (obsahuje číslice nebo je dost dlouhý)
            if re.search(r"\d", last_segment) or len(last_segment) > 15:
                return True

    except Exception:
        pass
    return False


def _extract_links_from_html(html: str, base_url: str) -> list[str]:
    """
    Extrahuje všechny href linky z HTML (bez DOM parseru – regex, rychle).
    Vrátí absolutní URL.
    """
    # Hledáme href="..." nebo href='...'
    pattern = re.compile(r'href=["\']([^"\'#\s]{5,2000})["\']', re.IGNORECASE)
    links = []
    for m in pattern.finditer(html):
        href = m.group(1).strip()
        # Absolutizuj relativní URL
        try:
            abs_url = urljoin(base_url, href)
            links.append(abs_url)
        except Exception:
            pass
    return links


async def _fetch_html(url: str, guard: DomainGuard, crawl_delay_s: float) -> Optional[str]:
    """
    Stáhne HTML listing stránky (přes DomainGuard s rate limitingem).
    """
    try:
        await guard.wait_and_acquire(url, crawl_delay_override=crawl_delay_s)
    except BlockedDomainError as e:
        logger.warning(f"[discovery] Skipping blocked domain: {e}")
        return None
    except CooldownError as e:
        logger.warning(f"[discovery] Skipping cooldown domain: {e}")
        return None

    headers = {
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "cs-CZ,cs;q=0.9,sk;q=0.8,en;q=0.6",
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
                if resp.status == 200:
                    guard.record_success(url)
                    ct = resp.headers.get("Content-Type", "")
                    enc = "utf-8"
                    if "charset=" in ct:
                        enc = ct.split("charset=")[-1].split(";")[0].strip() or "utf-8"
                    return await resp.text(encoding=enc, errors="replace")
                else:
                    guard.record_error(url, status_code=resp.status)
                    logger.warning(f"[discovery] HTTP {resp.status} for {url}")
                    return None
    except asyncio.TimeoutError:
        guard.record_error(url, reason="timeout")
        logger.warning(f"[discovery] Timeout: {url}")
        return None
    except Exception as e:
        guard.record_error(url, reason=str(e)[:100])
        logger.error(f"[discovery] Error fetching {url}: {e}")
        return None


# ── Hlavní funkce ─────────────────────────────────────────────────────────────

async def discover_product_urls(
    listing_url: str,
    guard: DomainGuard,
    crawl_delay_s: float = 3.0,
    max_candidates: int = MAX_CANDIDATES,
    custom_link_selector: Optional[str] = None,  # CSS selektor (pro budoucí BS4 integraci)
) -> list[str]:
    """
    Z listing URL extrahuje URL produktových stránek.

    Parametry:
        listing_url       – URL kategorie / vyhledávání / listingu
        guard             – DomainGuard instance (shared DB session)
        crawl_delay_s     – minimální zpoždění mezi requesty na doménu
        max_candidates    – max. počet vrácených URL
        custom_link_selector – ignorováno, rezervováno pro budoucí CSS selector support

    Vrátí:
        list[str] – deduplikovaný seznam produktových URL (absolutní, normalizované)
    """
    domain = DomainGuard.extract_domain(listing_url)
    logger.info(f"[discovery] Discovering products from: {listing_url}")

    html = await _fetch_html(listing_url, guard, crawl_delay_s)
    if not html:
        return []

    # Extrahuj všechny linky
    all_links = _extract_links_from_html(html, listing_url)
    logger.debug(f"[discovery] Found {len(all_links)} raw links on {listing_url}")

    # Filtruj
    seen: set[str] = set()
    product_urls: list[str] = []

    for raw_url in all_links:
        # Jen stejná doména
        if not _same_domain(raw_url, domain):
            continue

        # Heuristika – je to produkt?
        if not _is_product_url(raw_url):
            continue

        # Normalizuj a deduplikuj
        norm = _normalize_url(raw_url)
        if norm in seen:
            continue
        seen.add(norm)
        product_urls.append(norm)

        if len(product_urls) >= max_candidates:
            break

    logger.info(f"[discovery] Found {len(product_urls)} candidate product URLs from {listing_url}")
    return product_urls


async def discover_from_multiple_listings(
    listing_urls: list[str],
    guard: DomainGuard,
    crawl_delay_s: float = 3.0,
    max_total: int = 200,
) -> dict[str, list[str]]:
    """
    Spustí discovery pro více listing URL paralelně (ale s respektováním domainového delaye).
    Vrátí dict: {listing_url → [product_url, ...]}

    Pozn.: Pro jednu doménu spouštíme sekvenčně (kvůli rate limiting),
    pro různé domény paralelně.
    """
    # Seskup listingy dle domény
    by_domain: dict[str, list[str]] = {}
    for url in listing_urls:
        d = DomainGuard.extract_domain(url)
        by_domain.setdefault(d, []).append(url)

    results: dict[str, list[str]] = {}
    collected = 0

    async def process_domain(domain: str, urls: list[str]) -> None:
        nonlocal collected
        for listing_url in urls:
            if collected >= max_total:
                break
            found = await discover_product_urls(
                listing_url, guard, crawl_delay_s,
                max_candidates=min(MAX_CANDIDATES, max_total - collected),
            )
            results[listing_url] = found
            collected += len(found)

    # Spusť paralelně dle domény
    tasks = [process_domain(d, urls) for d, urls in by_domain.items()]
    await asyncio.gather(*tasks, return_exceptions=True)

    return results
