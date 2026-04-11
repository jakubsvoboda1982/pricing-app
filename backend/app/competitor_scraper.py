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


async def _try_fetch(url: str, headers: dict, timeout: int) -> Optional[str]:
    """Jeden pokus o stažení stránky, vrátí HTML nebo None."""
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
                else:
                    logger.warning(f"HTTP {response.status} při načítání {url}")
                    return None
    except asyncio.TimeoutError:
        logger.warning(f"Timeout ({timeout}s): {url}")
        return None
    except Exception as e:
        logger.warning(f"Chyba při načítání {url}: {e}")
        return None


async def fetch_page_content(url: str, timeout: int = 30) -> Optional[str]:
    """
    Stáhni stránku konkurenta. Zkouší více sad hlaviček pro obejití bot-detection.
    """
    from urllib.parse import urlparse
    try:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        origin = "https://www.google.com"

    # Sada 1: Chrome 124 s plnými Sec-CH-UA hlavičkami + Google Referer
    headers_chrome = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'cs-CZ,cs;q=0.9,sk;q=0.8,en-US;q=0.7,en;q=0.6',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'DNT': '1',
        'Referer': 'https://www.google.com/',
    }

    # Sada 2: Firefox UA jako fallback
    headers_firefox = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'cs,sk;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Referer': 'https://www.google.com/',
    }

    # Sada 3: minimální hlavičky (pro weby které blokují přehlcené hlavičky)
    headers_minimal = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Referer': origin,
    }

    for attempt, headers in enumerate([headers_chrome, headers_firefox, headers_minimal], 1):
        result = await _try_fetch(url, headers, timeout)
        if result is not None:
            if attempt > 1:
                logger.info(f"Úspěšné stažení na pokus #{attempt}: {url}")
            return result
        if attempt < 3:
            await asyncio.sleep(1)  # krátká pauza mezi pokusy

    logger.error(f"Všechny pokusy selhaly pro: {url}")
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


def _extract_product_description(html: str) -> Optional[str]:
    """Extrahuj popis produktu z HTML (JSON-LD → og:description → meta description)."""
    # 1. JSON-LD description
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                             html, re.DOTALL | re.IGNORECASE):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and '@graph' in item:
                    items = items + item['@graph']
                if isinstance(item, dict) and item.get('@type', '').lower() in ('product', 'productgroup'):
                    desc = item.get('description')
                    if desc and isinstance(desc, str) and len(desc) > 10:
                        return desc.strip()
        except Exception:
            pass
    # 2. og:description
    for pattern in [
        r'<meta[^>]+property=["\']og:description["\'][^>]*content=["\']([^"\']{10,2000})["\']',
        r'<meta[^>]+content=["\']([^"\']{10,2000})["\'][^>]*property=["\']og:description["\']',
        r'<meta[^>]+name=["\']description["\'][^>]*content=["\']([^"\']{10,2000})["\']',
        r'<meta[^>]+content=["\']([^"\']{10,2000})["\'][^>]*name=["\']description["\']',
    ]:
        m = re.search(pattern, html, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None


def _extract_product_ingredients(html: str) -> Optional[str]:
    """
    Extrahuj složení/ingredience z produktové stránky.
    Hledá sekce s názvy: Složení, Ingredients, Zloženie, Összetevők, apod.
    """
    # Čisti HTML od tagů pro textové hledání
    def strip_tags(s: str) -> str:
        return re.sub(r'<[^>]+>', ' ', s)

    # Vzory pro nadpis sekce složení
    _HEADING_PATTERNS = [
        r'(?:Složení|Zloženie|Ingredients?|Összetev[őok]+|Inhaltsstoffe|Ingredienti)',
    ]
    heading_re = re.compile(
        r'(?:' + '|'.join(_HEADING_PATTERNS) + r')\s*[:\-–]?\s*',
        re.IGNORECASE
    )

    # 1. JSON-LD additionalProperty nebo description obsahující "složení"
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                             html, re.DOTALL | re.IGNORECASE):
        try:
            data = json.loads(block)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and '@graph' in item:
                    items = items + item['@graph']
                if isinstance(item, dict) and item.get('@type', '').lower() in ('product', 'productgroup'):
                    for prop in item.get('additionalProperty', []):
                        if isinstance(prop, dict):
                            pname = str(prop.get('name', '')).lower()
                            if any(k in pname for k in ['složen', 'ingredient', 'zložen', 'összetev']):
                                val = prop.get('value', '')
                                if val and len(str(val)) > 5:
                                    return str(val).strip()
        except Exception:
            pass

    # 2. Hledej v HTML sekci se složením
    # Najdi oblast okolo nadpisu "Složení" a vytáhni text
    for m in re.finditer(
        r'(?:Složení|Zloženie|Ingredients?|Összetev[őok]+)\s*[:\-–]?\s*(?:<[^>]+>)?\s*([^<]{20,1000})',
        html, re.IGNORECASE
    ):
        text = m.group(1).strip()
        if len(text) > 15:
            return text

    # 3. Hledej v datových atributech
    m = re.search(r'data-(?:ingredients?|slozeni|ingrediencie)["\']?\s*[:=]\s*["\']([^"\']{10,1000})', html, re.IGNORECASE)
    if m:
        return m.group(1).strip()

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

    # 2. Custom PHP/nuties.sk formát: radio input s hodnotou "id;qty;msg;sku;NázevProduktu GraMáž;cena;..."
    # Příklad: value="2489;1;Min. 1 ks;93010097;Mandle 100 g;1.9099;15;Max 15 ks"
    seen_radio_ids: set = set()
    for rv in re.findall(
        r'<input[^>]+class=["\'][^"\']*productId[^"\']*["\'][^>]+value=["\']([^"\']+)["\']',
        html, re.IGNORECASE
    ):
        parts = rv.split(';')
        if len(parts) < 6:
            continue
        variant_id = parts[0].strip()
        if variant_id in seen_radio_ids:
            continue
        seen_radio_ids.add(variant_id)
        product_name = parts[4].strip()
        price_str = parts[5].strip()
        if not product_name:
            continue
        # Extrahuj gramáž / velikost z konce názvu (např. "Mandle 500 g" → "500 g")
        size_m = re.search(
            r'(\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|ks|pcs|db|oz|lb))\s*$',
            product_name, re.IGNORECASE
        )
        label = size_m.group(1).strip() if size_m else product_name
        try:
            price = float(price_str.replace(',', '.'))
        except Exception:
            price = None
        variants.append({'label': label, 'url': None, 'price': price, '_full_name': product_name})
    if variants:
        return variants

    # 3. Shoptet variantListItem — HTML elementy s třídou variantListItem
    shoptet_li = re.findall(
        r'<li[^>]+class=["\'][^"\']*variantListItem[^"\']*["\'][^>]*>(.*?)</li>',
        html, re.DOTALL | re.IGNORECASE
    )
    if len(shoptet_li) >= 2:
        for item_html in shoptet_li[:20]:
            name_m = re.search(r'class=["\'][^"\']*variantName[^"\']*["\'][^>]*>([^<]{1,60})<', item_html, re.IGNORECASE)
            price_m = re.search(r'class=["\'][^"\']*(?:variantPrice|price)[^"\']*["\'][^>]*>\s*([0-9]+(?:[.,][0-9]{1,2})?)', item_html, re.IGNORECASE)
            label = name_m.group(1).strip() if name_m else None
            price = float(price_m.group(1).replace(',', '.')) if price_m else None
            if label:
                variants.append({'label': label, 'url': None, 'price': price})
        if variants:
            return variants

    # 4. WooCommerce variations JSON v data-product_variations atributu
    wc_m = re.search(r'data-product_variations=["\'](\[.*?\])["\']', html, re.DOTALL | re.IGNORECASE)
    if wc_m:
        try:
            wc_vars = json.loads(wc_m.group(1))
            for v in wc_vars[:20]:
                if not isinstance(v, dict):
                    continue
                attrs = v.get('attributes', {})
                label = ' / '.join(str(a) for a in attrs.values() if a) if attrs else None
                price = v.get('display_price') or v.get('price')
                if label:
                    try:
                        p = float(str(price)) if price is not None else None
                    except Exception:
                        p = None
                    variants.append({'label': label, 'url': None, 'price': p})
            if variants:
                return variants
        except Exception:
            pass

    # 5. JS pole v <script> s name/price klíči (WooCommerce, PrestaShop, vlastní)
    for script_block in re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE):
        for raw in re.findall(
            r'\[(\s*\{[^[\]]{20,3000}\}(?:\s*,\s*\{[^[\]]{20,3000}\})+\s*)\]',
            script_block, re.DOTALL
        ):
            try:
                arr = json.loads('[' + raw + ']')
                if not isinstance(arr, list) or len(arr) < 2:
                    continue
                name_keys = ('name', 'nazev', 'label', 'title', 'nazov', 'variant_name')
                price_keys = ('price', 'priceWithVat', 'price_with_vat', 'display_price', 'amount')
                found = []
                for item in arr:
                    if not isinstance(item, dict):
                        continue
                    label = next((str(item[k]).strip() for k in name_keys if item.get(k)), None)
                    price_raw = next((item[k] for k in price_keys if item.get(k) is not None), None)
                    if label and 2 <= len(label) <= 100:
                        try:
                            p = float(str(price_raw).replace(',', '.')) if price_raw is not None else None
                        except Exception:
                            p = None
                        found.append({'label': label, 'url': None, 'price': p})
                if len(found) >= 2:
                    return found
            except Exception:
                pass

    # 6. data-testid="productVariant" tabulka (nutsman.cz a podobné weby)
    # <tr data-testid="productVariant">
    #   <td data-testid="productVariantName">Množství: 250 g</td>
    #   <td data-testid="productVariantPrice"><strong>99 Kč /ks</strong></td>
    # </tr>
    _PREFIX_RE = re.compile(
        r'^(?:Množství|Velikost|Balení|Hmotnost|Objem|Velikost\s+balení)\s*:\s*',
        re.IGNORECASE
    )
    for row in re.findall(
        r'<tr[^>]*data-testid=["\']productVariant["\'][^>]*>(.*?)</tr>',
        html, re.DOTALL | re.IGNORECASE
    ):
        name_m = re.search(
            r'data-testid=["\']productVariantName["\'][^>]*>\s*([^<]{1,120})',
            row, re.IGNORECASE
        )
        if not name_m:
            continue
        raw_label = name_m.group(1).strip()
        label = _PREFIX_RE.sub('', raw_label).strip() or raw_label
        price_m = re.search(
            r'data-testid=["\']productVariantPrice["\'][^>]*>.*?<strong[^>]*>\s*'
            r'([\d][\d\s\xa0\u202f.,]+)',
            row, re.DOTALL | re.IGNORECASE
        )
        price = None
        if price_m:
            p_raw = price_m.group(1).replace('\xa0', '').replace('\u202f', '').replace(' ', '').replace(',', '.')
            try:
                price = float(re.sub(r'[^\d.]', '', p_raw))
            except Exception:
                pass
        if label:
            variants.append({'label': label, 'url': None, 'price': price})
    if variants:
        return variants

    # 7. <option> fallback
    for m in re.finditer(
        r'<option\b[^>]*value=["\']([^"\']+)["\'][^>]*>([^<]{2,80})</option>',
        html, re.IGNORECASE
    ):
        val, label = m.group(1).strip(), m.group(2).strip()
        if not val or label.lower() in ('vyberte', 'choose', 'select', '-- vyberte --', ''):
            continue
        if any(skip in label.lower() for skip in ('košík', 'cart', 'compare', 'wishlist')):
            continue
        variants.append({'label': label, 'url': None, 'price': None})
        if len(variants) >= 20:
            break

    return variants


def _extract_price_for_variant(html: str, variant_label: str) -> Optional[Decimal]:
    """
    Extrahuj cenu pro konkrétní variantu produktu (dle labelu, např. '500 g').
    Používá JSON-LD hasVariant. Pokud varianta nebyla nalezena, vrátí None
    a caller by měl zkusit generickou extrakci.
    """
    if not variant_label:
        return None

    label_lower = variant_label.lower().strip()
    _PRICE_RE = r'([1-9][0-9]{0,2}(?:[\s\xa0][0-9]{3})*(?:[.,][0-9]{1,2})?)'

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
                variants = item.get('hasVariant') or []
                if not isinstance(variants, list):
                    continue
                best_match = None
                best_score = 0
                for v in variants:
                    if not isinstance(v, dict):
                        continue
                    v_name = str(v.get('name', '')).lower().strip()
                    # Score: exact match > contains > word overlap
                    if v_name == label_lower:
                        score = 3
                    elif label_lower in v_name or v_name in label_lower:
                        score = 2
                    else:
                        # word overlap
                        words_a = set(re.split(r'[\s,./]+', label_lower))
                        words_b = set(re.split(r'[\s,./]+', v_name))
                        overlap = words_a & words_b - {''}
                        score = len(overlap)
                    if score > best_score:
                        best_score = score
                        best_match = v
                if best_match and best_score > 0:
                    offer = best_match.get('offers') or {}
                    if isinstance(offer, list):
                        offer = offer[0] if offer else {}
                    price_str = str(offer.get('price', '') or '').strip()
                    if price_str:
                        try:
                            return Decimal(price_str.replace(',', '.'))
                        except Exception:
                            pass
        except Exception:
            pass

    # nuties.sk radio input: value="id;qty;msg;sku;ProductName Gramage;price;..."
    for rv in re.findall(
        r'<input[^>]+class=["\'][^"\']*productId[^"\']*["\'][^>]+value=["\']([^"\']+)["\']',
        html, re.IGNORECASE
    ):
        parts = rv.split(';')
        if len(parts) < 6:
            continue
        product_name = parts[4].strip()
        price_str = parts[5].strip()
        if not product_name or not price_str:
            continue
        name_lower = product_name.lower()
        # Extract size label from end of name for comparison
        size_m = re.search(
            r'(\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l|ks|pcs|db|oz|lb))\s*$',
            product_name, re.IGNORECASE
        )
        extracted_label = size_m.group(1).strip().lower() if size_m else name_lower
        if label_lower == extracted_label or label_lower in name_lower or extracted_label in label_lower:
            try:
                price = Decimal(price_str.replace(',', '.'))
                if 0 < price < 100000:
                    return price
            except Exception:
                pass

    # data-testid="productVariant" tabulka (nutsman.cz)
    _PREFIX_STRIP = re.compile(
        r'^(?:Množství|Velikost|Balení|Hmotnost|Objem|Velikost\s+balení)\s*:\s*',
        re.IGNORECASE
    )
    for row in re.findall(
        r'<tr[^>]*data-testid=["\']productVariant["\'][^>]*>(.*?)</tr>',
        html, re.DOTALL | re.IGNORECASE
    ):
        name_m = re.search(
            r'data-testid=["\']productVariantName["\'][^>]*>\s*([^<]{1,120})',
            row, re.IGNORECASE
        )
        if not name_m:
            continue
        raw_label = name_m.group(1).strip()
        clean = _PREFIX_STRIP.sub('', raw_label).strip().lower()
        # Match against both raw and stripped label
        if label_lower in clean or clean in label_lower or label_lower in raw_label.lower():
            price_m = re.search(
                r'data-testid=["\']productVariantPrice["\'][^>]*>.*?<strong[^>]*>\s*'
                r'([\d][\d\s\xa0\u202f.,]+)',
                row, re.DOTALL | re.IGNORECASE
            )
            if price_m:
                p_raw = re.sub(r'[^\d.,]', '', price_m.group(1)).replace(',', '.')
                try:
                    val = Decimal(p_raw)
                    if 0 < val < 100000:
                        return val
                except Exception:
                    pass

    # Fallback: search HTML for variant label + nearby price
    escaped = re.escape(variant_label)
    for pattern in [
        rf'{escaped}[^<]{{0,100}}?{_PRICE_RE}\s*(?:€|EUR|Kč|CZK|Ft|HUF)',
        rf'>{escaped}<[^>]*>[^<]{{0,200}}{_PRICE_RE}',
    ]:
        try:
            m = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
            if m:
                raw = m.group(1).replace('\xa0', '').replace(' ', '').replace(',', '.')
                val = Decimal(raw)
                if 0 < val < 100000:
                    return val
        except Exception:
            pass

    return None


async def scrape_competitor_price(url: str, variant_label: Optional[str] = None) -> Optional[Decimal]:
    """
    Scrape a single competitor URL and return the price.
    Returns price as Decimal or None if unable to extract.
    """
    try:
        html = await fetch_page_content(url)
        if html:
            # If a specific variant label is requested, try variant-aware extraction first
            if variant_label:
                variant_price = _extract_price_for_variant(html, variant_label)
                if variant_price is not None:
                    logger.info(f"Variant price [{variant_label}] from {url}: {variant_price}")
                    return variant_price
                logger.warning(f"Variant [{variant_label}] not found on {url}, falling back to generic")
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
    description = _extract_product_description(html)
    ingredients = _extract_product_ingredients(html)

    return {
        "ok": True,
        "error": None,
        "detected_name": name,
        "detected_price": float(price) if price else None,
        "detected_currency": currency,
        "detected_description": description,
        "detected_ingredients": ingredients,
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
                price = await scrape_competitor_price(comp_price.competitor_url, variant_label=comp_price.variant_label)

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
                price = await scrape_competitor_price(comp_price.competitor_url, variant_label=comp_price.variant_label)

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

        # ── Scrape vlastních cen všech produktů (nuties.cz / nuties.sk) ──
        own_updated = await _update_own_prices_all(db)
        logger.info(f"Own product prices updated: {own_updated}")

        message = f"Updated {total_updated} competitor prices, {own_updated} own prices, {total_errors} errors"
        logger.info(f"Competitor price update complete: {message}")

        return {
            "status": "success",
            "updated": total_updated,
            "own_prices_updated": own_updated,
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


async def _update_own_prices_all(db: Session) -> int:
    """
    Scrape vlastních URL produktů (url_reference) a ulož nové záznamy do Price tabulky
    pokud se cena změnila. Volá se z nočního scheduleru i z manuálního refresh endpointu.
    """
    from urllib.parse import urlparse, urlunparse
    from app.models.price import Price
    from sqlalchemy import desc as _desc

    try:
        from app.models.product import Product as ProductModel
        products = db.query(ProductModel).filter(
            ProductModel.url_reference != None,
            ProductModel.url_reference != '',
        ).all()
    except Exception as e:
        logger.error(f"Own price scraping: could not load products: {e}")
        return 0

    total_own = 0

    for product in products:
        own_url = (product.url_reference or '').strip()
        own_market_urls = dict(getattr(product, 'own_market_urls_json', None) or {})

        if not own_market_urls and not own_url:
            continue

        try:
            market_urls: list[tuple[str, str, str]] = []
            _MARKET_CURRENCY_MAP = {'CZ': 'CZK', 'SK': 'EUR', 'HU': 'HUF'}

            if own_market_urls:
                # Use explicit per-market URLs
                for mkt, mkt_url in own_market_urls.items():
                    if mkt_url and mkt_url.strip():
                        mkt_currency = _MARKET_CURRENCY_MAP.get(mkt.upper(), 'CZK')
                        market_urls.append((mkt_url.strip(), mkt.upper(), mkt_currency))
            elif own_url:
                # Fallback: auto-derive from url_reference
                parsed = urlparse(own_url)
                netloc = parsed.netloc.lower()
                if '.cz' in netloc:
                    market_urls.append((own_url, 'CZ', 'CZK'))
                    sk_url = urlunparse(parsed._replace(netloc=netloc.replace('.cz', '.sk')))
                    market_urls.append((sk_url, 'SK', 'EUR'))
                elif '.sk' in netloc:
                    market_urls.append((own_url, 'SK', 'EUR'))
                    cz_url = urlunparse(parsed._replace(netloc=netloc.replace('.sk', '.cz')))
                    market_urls.append((cz_url, 'CZ', 'CZK'))
                else:
                    market_urls.append((own_url, 'CZ', 'CZK'))

            variant_labels = dict(getattr(product, 'own_market_variant_labels_json', None) or {})
            for mkt_url, mkt, mkt_currency in market_urls:
                try:
                    variant_label = variant_labels.get(mkt)
                    scraped_price = await scrape_competitor_price(mkt_url, variant_label=variant_label)
                    if scraped_price is None:
                        continue

                    last_price = (
                        db.query(Price)
                        .filter(Price.product_id == product.id, Price.market == mkt)
                        .order_by(_desc(Price.changed_at))
                        .first()
                    )

                    if last_price is None or abs(float(last_price.current_price) - float(scraped_price)) > 0.005:
                        db.add(Price(
                            product_id=product.id,
                            market=mkt,
                            currency=mkt_currency,
                            current_price=scraped_price,
                            old_price=last_price.current_price if last_price else None,
                        ))
                        db.commit()
                        total_own += 1
                        logger.info(f"✓ Own price [{mkt}] {product.name}: {scraped_price} {mkt_currency}")

                    await asyncio.sleep(0.3)

                except Exception as e:
                    logger.warning(f"Own price scrape failed [{mkt}] {mkt_url}: {e}")

        except Exception as e:
            logger.error(f"Own price error for product {product.id}: {e}")

    return total_own
