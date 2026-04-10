"""
Dynamické kurzy z ČNB (Česká národní banka).
Cache 24 hodin, fallback na pevné kurzy při výpadku.
"""

import asyncio
import aiohttp
import logging
import re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict

logger = logging.getLogger(__name__)

# Fallback pevné kurzy (CZK za 1 jednotku cizí měny)
_FALLBACK: Dict[str, Decimal] = {
    'CZK': Decimal('1'),
    'EUR': Decimal('25.0'),
    'HUF': Decimal('0.065'),
    'USD': Decimal('23.0'),
    'GBP': Decimal('29.0'),
}

# Cache: (_rates_dict, _fetched_at)
_cache: dict = {'rates': None, 'fetched_at': None}
_CACHE_TTL_HOURS = 24
_CNB_URL = (
    'https://www.cnb.cz/en/financial-markets/foreign-exchange-market/'
    'central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt'
)


def _parse_cnb(text: str) -> Dict[str, Decimal]:
    """Parsuj ČNB daily.txt formát → {currency_code: rate_per_1_unit}"""
    rates: Dict[str, Decimal] = {'CZK': Decimal('1')}
    lines = text.strip().splitlines()
    # Přeskoč hlavičku (první 2 řádky)
    for line in lines[2:]:
        parts = line.split('|')
        if len(parts) < 5:
            continue
        try:
            amount = Decimal(parts[2].replace(',', '.'))
            code = parts[3].strip()
            rate = Decimal(parts[4].replace(',', '.'))
            # rate je v CZK za `amount` jednotek → převeď na 1 jednotku
            rates[code] = rate / amount
        except Exception:
            continue
    return rates


async def _fetch_cnb_rates() -> Dict[str, Decimal]:
    """Stáhni aktuální kurzy z ČNB."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                _CNB_URL,
                timeout=aiohttp.ClientTimeout(total=8),
                headers={'User-Agent': 'NutiesPricingApp/1.0'},
            ) as resp:
                if resp.status == 200:
                    text = await resp.text(encoding='utf-8', errors='replace')
                    rates = _parse_cnb(text)
                    if 'EUR' in rates and 'HUF' in rates:
                        logger.info(f"[CNB] Kurzy načteny: EUR={rates['EUR']}, HUF={rates['HUF']}")
                        return rates
    except Exception as e:
        logger.warning(f"[CNB] Chyba při načítání kurzů: {e}")
    return {}


async def get_exchange_rates() -> Dict[str, Decimal]:
    """
    Vrátí aktuální kurzy (CZK za 1 jednotku). Výsledek je cachován 24 hodin.
    Při chybě vrátí fallback hodnoty.
    """
    global _cache
    now = datetime.utcnow()
    fetched_at = _cache.get('fetched_at')

    # Vrátit z cache pokud je čerstvá
    if _cache.get('rates') and fetched_at and (now - fetched_at) < timedelta(hours=_CACHE_TTL_HOURS):
        return _cache['rates']

    # Stáhnout nové kurzy
    fresh = await _fetch_cnb_rates()
    if fresh:
        _cache['rates'] = fresh
        _cache['fetched_at'] = now
        return fresh

    # Fallback
    logger.warning("[CNB] Používám záložní pevné kurzy")
    return _FALLBACK


def get_exchange_rates_sync() -> Dict[str, Decimal]:
    """
    Synchronní verze — pro volání z non-async kontextu.
    Pokud je cache platná, vrátí ji okamžitě bez IO.
    """
    now = datetime.utcnow()
    fetched_at = _cache.get('fetched_at')
    if _cache.get('rates') and fetched_at and (now - fetched_at) < timedelta(hours=_CACHE_TTL_HOURS):
        return _cache['rates']
    # Cache prázdná — vrátíme fallback (async refresh se spustí při příštím async volání)
    return _FALLBACK
