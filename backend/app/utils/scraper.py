import re
import asyncio
from typing import Dict, List, Optional
from urllib.parse import urlparse, urljoin
import aiohttp
from datetime import datetime


async def scrape_competitor_metadata(url: str, timeout: int = 10) -> Dict:
    """
    Stáhne URL a extrahuje metadata konkurenta.

    Extrahuje:
    - og:title, og:image (logo)
    - og:description
    - meta description
    - Ceny (regex hledání)
    - Email a telefon (regex hledání)
    - Adresa (pokud je dostupná)

    Args:
        url: URL webu konkurenta
        timeout: Timeout v sekundách

    Returns:
        Dict s extrahovanými daty:
        {
            'name': str,
            'logo_url': str,
            'description': str,
            'prices_found': [float],
            'emails': [str],
            'phones': [str],
            'country': str (extrahováno z URL),
            'raw_data': str (původní HTML),
            'scraped_at': datetime
        }

    Raises:
        Exception: Pokud scraping selže
    """

    # Normalizuj URL
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    metadata = {
        'name': None,
        'logo_url': None,
        'description': None,
        'prices_found': [],
        'emails': [],
        'phones': [],
        'address': None,
        'country': None,
        'raw_data': None,
        'scraped_at': datetime.utcnow(),
        'success': False,
    }

    try:
        # Parsuj hostname pro detekci země
        parsed_url = urlparse(url)
        domain = parsed_url.netloc.lower()

        # Detekuj zemi z domény
        if '.sk' in domain:
            metadata['country'] = 'SK'
        elif '.cz' in domain:
            metadata['country'] = 'CZ'
        elif '.eu' in domain:
            metadata['country'] = 'EU'
        else:
            metadata['country'] = 'UNKNOWN'

        # Fetch HTML s timeoutem
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=timeout),
                headers={'User-Agent': 'Mozilla/5.0 (compatible; CompetitorBot/1.0)'},
                ssl=False  # Ignoruj SSL errory pro dev
            ) as response:
                if response.status != 200:
                    raise Exception(f"HTTP {response.status}: {response.reason}")

                html = await response.text()

        metadata['raw_data'] = html

        # Extrahuj metadata pomocí regex
        _extract_meta_tags(html, metadata, url)
        _extract_prices(html, metadata)
        _extract_contact_info(html, metadata)

        metadata['success'] = True

    except asyncio.TimeoutError:
        raise Exception(f"Timeout při stahování {url} (>{timeout}s)")
    except aiohttp.ClientError as e:
        raise Exception(f"Chyba při stahování {url}: {str(e)}")
    except Exception as e:
        raise Exception(f"Chyba při scrapingu {url}: {str(e)}")

    return metadata


def _extract_meta_tags(html: str, metadata: Dict, base_url: str) -> None:
    """Extrahuj Open Graph a meta tagy. Resolvuje relativní URL proti `base_url`."""

    # og:title nebo <title>
    og_title = re.search(r'<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
    if og_title:
        metadata['name'] = og_title.group(1)
    else:
        title = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
        if title:
            # Očisti název od suffixů typu " | Prodej" nebo " - Eshop"
            name = title.group(1).strip()
            name = re.sub(r'\s*[|\-–—]\s*.*$', '', name)  # Odstraň vše za | nebo -
            metadata['name'] = name[:100]  # Max 100 znaků

    # og:image pro logo
    og_image = re.search(r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
    if og_image:
        logo_url = og_image.group(1).strip()
        # Resolve protocol-relative URLs (//cdn.example.com/img.png)
        if logo_url.startswith('//'):
            parsed = urlparse(base_url)
            logo_url = f"{parsed.scheme}:{logo_url}"
        # Resolve relative paths against the page URL
        elif not logo_url.startswith('http'):
            logo_url = urljoin(base_url, logo_url)
        metadata['logo_url'] = logo_url

    # og:description nebo meta description
    og_desc = re.search(r'<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
    if og_desc:
        metadata['description'] = og_desc.group(1)
    else:
        meta_desc = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
        if meta_desc:
            metadata['description'] = meta_desc.group(1)


def _extract_prices(html: str, metadata: Dict) -> None:
    """Extrahuj ceny z HTML"""

    # Hledej ceny: symbol měny + čísla
    # Vzor: 99 Kč, 99,99 Kč, 99.99 Kč, $99.99, €99.99
    price_patterns = [
        r'(\d+(?:[.,]\d{2})?)\s*Kč',      # 99 Kč nebo 99,99 Kč
        r'(\d+(?:[.,]\d{2})?)\s*CZK',     # 99 CZK
        r'(\d+(?:[.,]\d{2})?)\s*SK',      # 99 SK
        r'\$(\d+(?:[.,]\d{2})?)',         # $99.99
        r'€(\d+(?:[.,]\d{2})?)',          # €99.99
        r'€\s*(\d+(?:[.,]\d{2})?)',       # € 99.99
    ]

    prices = set()
    for pattern in price_patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        for match in matches:
            # Konvertuj čárku na tečku
            price_str = match.replace(',', '.')
            try:
                price = float(price_str)
                # Filtruj nerealistické ceny (< 1 nebo > 1 000 000)
                if 1 <= price <= 1000000:
                    prices.add(price)
            except ValueError:
                pass

    # Vrať unikátní ceny seřazené
    metadata['prices_found'] = sorted(list(prices))[:20]  # Max 20 cen


def _extract_contact_info(html: str, metadata: Dict) -> None:
    """Extrahuj kontaktní informace"""

    # Email
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = set(re.findall(email_pattern, html))
    # Filtruj common placeholder emaily
    emails = {e for e in emails if not e.lower().startswith(('noreply', 'no-reply', 'test@', 'admin@', 'no-spam'))}
    metadata['emails'] = list(emails)[:5]  # Max 5 emailů

    # Telefon - České a slovenské formáty
    phone_patterns = [
        r'\+420\s?[1-9]\d{2}\s?\d{3}\s?\d{3}',  # +420 xxx xxx xxx
        r'(?<!\d)[\s\(]?(?:\+420|00420|420)?[\s\)]?([1-9]\d{2})[\s\-\.]?(\d{3})[\s\-\.]?(\d{3})(?!\d)',
        r'\+421\s?[1-9]\d{1}\s?\d{3}\s?\d{3}',  # +421 xx xxx xxx
        r'(?<!\d)[\s\(]?(?:\+421|00421|421)?[\s\)]?([1-9]\d{1})[\s\-\.]?(\d{3})[\s\-\.]?(\d{3})(?!\d)',
    ]

    phones = set()
    for pattern in phone_patterns:
        matches = re.findall(pattern, html)
        for match in matches:
            if isinstance(match, tuple):
                phone = ''.join(match)
            else:
                phone = match
            if phone and len(phone) >= 9:
                phones.add(phone)

    metadata['phones'] = list(phones)[:3]  # Max 3 telefony

    # Adresa - pokud je explicitně uvedena
    # Hledej vzory jako "Ulice 123, PSČ Město" nebo pouze město
    address_patterns = [
        r'(?:Adresa|Address|Sídlo|Sídlem je|Sídlem|Sídlem je umístěna)[:\s]+([^\n<]{10,100})',
    ]

    for pattern in address_patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            address = match.group(1).strip()
            # Očisti HTML entity
            address = re.sub(r'<[^>]+>', '', address)
            address = address[:200]  # Max 200 znaků
            metadata['address'] = address
            break
