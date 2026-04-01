"""
Per-domain ochrana před blokací.

Každá doména má vlastní DomainCrawlState záznam v DB.
DomainGuard řídí:
  - povinné pauzy mezi requesty (min. delay + exponential backoff)
  - exponential backoff při chybách (429, 403, connection errors)
  - pravidla pro trvalé zablokování domény
  - robots.txt cache

Pravidla blokace:
  - 5+ po sobě jdoucích 403 → doména označena is_blocked=True
  - 10+ po sobě jdoucích chyb → doména označena is_blocked=True
  - Při 429 přidáme cooldown = 60s × 2^consecutive_429 (max 1 hodina)

Použití:
    guard = DomainGuard(db)
    if not guard.can_request(domain):
        raise BlockedDomainError(domain)
    delay = guard.required_delay(domain)
    await asyncio.sleep(delay)
    # ... fetch ...
    guard.record_success(domain)
    # nebo
    guard.record_error(domain, status_code=429)
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import aiohttp
from sqlalchemy.orm import Session

from app.models.domain_crawl_state import DomainCrawlState

logger = logging.getLogger(__name__)

# ── Konstanty ─────────────────────────────────────────────────────────────────

# Minimální pauza mezi requesty na stejnou doménu (sekundy)
_DEFAULT_MIN_DELAY_S = 3.0

# Maximální cooldown (1 hodina) při opakovaných 429
_MAX_COOLDOWN_S = 3600

# Prahové hodnoty pro trvalou blokaci
_BLOCK_ON_CONSECUTIVE_403 = 5
_BLOCK_ON_CONSECUTIVE_ERRORS = 10

# Robots.txt cache – platnost (24 hodin)
_ROBOTS_CACHE_TTL_S = 86400


class BlockedDomainError(Exception):
    """Doména je trvale zablokována."""
    def __init__(self, domain: str, reason: str = ""):
        self.domain = domain
        self.reason = reason
        super().__init__(f"Domain blocked: {domain}" + (f" ({reason})" if reason else ""))


class CooldownError(Exception):
    """Doména je momentálně v cooldownu."""
    def __init__(self, domain: str, until: datetime):
        self.domain = domain
        self.until = until
        super().__init__(f"Domain on cooldown until {until.isoformat()}: {domain}")


# ── Hlavní třída ───────────────────────────────────────────────────────────────

class DomainGuard:
    """
    Stav per-doménu ukládá do DB (DomainCrawlState).
    Každá instance sdílí tentýž DB session – vhodné pro použití
    v rámci jednoho pipeline běhu.
    """

    def __init__(self, db: Session, default_min_delay_s: float = _DEFAULT_MIN_DELAY_S):
        self.db = db
        self.default_min_delay_s = default_min_delay_s

    # ── Pomocné metody ─────────────────────────────────────────────────────────

    @staticmethod
    def extract_domain(url: str) -> str:
        """Vrátí normalizovanou doménu z URL."""
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            # Odstraň www.
            if domain.startswith("www."):
                domain = domain[4:]
            return domain
        except Exception:
            return url

    def _get_or_create_state(self, domain: str) -> DomainCrawlState:
        """Načte nebo vytvoří DomainCrawlState pro doménu."""
        state = self.db.query(DomainCrawlState).filter_by(domain=domain).first()
        if not state:
            state = DomainCrawlState(domain=domain)
            self.db.add(state)
            self.db.flush()
        return state

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    # ── Veřejné API ────────────────────────────────────────────────────────────

    def can_request(self, domain_or_url: str) -> bool:
        """
        Zkontroluje, zda smíme odeslat request na doménu.
        Vrátí False pokud:
          - doména je is_blocked
          - doména je v aktivním cooldownu
        """
        domain = self.extract_domain(domain_or_url)
        state = self._get_or_create_state(domain)

        if state.is_blocked:
            return False

        now = self._now()
        if state.current_cooldown_until and state.current_cooldown_until > now:
            return False

        return True

    def required_delay_s(self, domain_or_url: str, crawl_delay_override: Optional[float] = None) -> float:
        """
        Vrátí počet sekund, které musíme počkat před dalším requestem.
        Bere v úvahu:
          - min. zpoždění dle nastavení konkurenta
          - exponential backoff dle consecutive_errors
          - zbývající čas cooldownu
        """
        domain = self.extract_domain(domain_or_url)
        state = self._get_or_create_state(domain)
        now = self._now()

        # Cooldown
        if state.current_cooldown_until and state.current_cooldown_until > now:
            remaining = (state.current_cooldown_until - now).total_seconds()
            return remaining

        # Exponential backoff dle chyb (max 60s)
        backoff = 0.0
        if state.consecutive_errors > 0:
            backoff = min(60.0, self.default_min_delay_s * (2 ** (state.consecutive_errors - 1)))

        # Minimální delay od posledního requestu
        min_delay = crawl_delay_override if crawl_delay_override is not None else self.default_min_delay_s
        if state.last_request_at:
            elapsed = (now - state.last_request_at).total_seconds()
            wait_for_min = max(0.0, min_delay - elapsed)
        else:
            wait_for_min = 0.0

        return max(backoff, wait_for_min)

    def record_success(self, domain_or_url: str) -> None:
        """Zaznamená úspěšný request – resetuje čítače chyb."""
        domain = self.extract_domain(domain_or_url)
        state = self._get_or_create_state(domain)

        state.last_request_at = self._now()
        state.consecutive_errors = 0
        state.consecutive_403 = 0
        state.consecutive_429 = 0
        state.suspicious_response_count = 0
        state.total_requests = (state.total_requests or 0) + 1
        # Pokud byl v cooldownu kvůli 429 a teď jsme uspěli, zrušíme ho
        if state.current_cooldown_until and state.current_cooldown_until <= self._now():
            state.current_cooldown_until = None

        self.db.flush()
        logger.debug(f"[DomainGuard] ✓ success: {domain}")

    def record_error(self, domain_or_url: str, status_code: Optional[int] = None, reason: str = "") -> None:
        """
        Zaznamená chybu requestu a případně aktivuje cooldown.

        status_code=429 → exponential cooldown (60s → 120s → 240s … max 1h)
        status_code=403 → inkrementuj consecutive_403; po 5× → blokace
        ostatní → inkrementuj consecutive_errors; po 10× → blokace
        """
        domain = self.extract_domain(domain_or_url)
        state = self._get_or_create_state(domain)

        state.last_request_at = self._now()
        state.total_requests = (state.total_requests or 0) + 1
        state.total_errors = (state.total_errors or 0) + 1
        state.consecutive_errors = (state.consecutive_errors or 0) + 1

        if status_code == 429:
            # Rate limit – exponential cooldown
            n = (state.consecutive_429 or 0) + 1
            state.consecutive_429 = n
            cooldown_s = min(_MAX_COOLDOWN_S, 60 * (2 ** (n - 1)))
            state.current_cooldown_until = self._now() + timedelta(seconds=cooldown_s)
            state.last_block_reason = f"429 rate-limited (cooldown {cooldown_s}s)"
            logger.warning(f"[DomainGuard] 429 on {domain}: cooldown {cooldown_s}s")

        elif status_code == 403:
            # Přístup odepřen
            n = (state.consecutive_403 or 0) + 1
            state.consecutive_403 = n
            state.last_block_reason = reason or "403 Forbidden"
            if n >= _BLOCK_ON_CONSECUTIVE_403:
                state.is_blocked = True
                logger.error(f"[DomainGuard] ✗ BLOCKED {domain}: {n}× 403")
            else:
                logger.warning(f"[DomainGuard] 403 on {domain} ({n}/{_BLOCK_ON_CONSECUTIVE_403})")

        else:
            # Obecná chyba (timeout, connection error, 5xx, ...)
            state.last_block_reason = reason or f"HTTP {status_code}" if status_code else reason or "error"
            if state.consecutive_errors >= _BLOCK_ON_CONSECUTIVE_ERRORS:
                state.is_blocked = True
                logger.error(f"[DomainGuard] ✗ BLOCKED {domain}: {state.consecutive_errors}× errors")
            else:
                logger.warning(
                    f"[DomainGuard] error on {domain} "
                    f"({state.consecutive_errors}/{_BLOCK_ON_CONSECUTIVE_ERRORS})"
                    + (f" HTTP {status_code}" if status_code else "")
                )

        self.db.flush()

    def is_blocked(self, domain_or_url: str) -> bool:
        """Rychlá kontrola je-li doména trvale zablokovaná."""
        domain = self.extract_domain(domain_or_url)
        state = self.db.query(DomainCrawlState).filter_by(domain=domain).first()
        return bool(state and state.is_blocked)

    def reset_domain(self, domain_or_url: str) -> None:
        """Manuální reset blokace domény (admin akce)."""
        domain = self.extract_domain(domain_or_url)
        state = self._get_or_create_state(domain)
        state.is_blocked = False
        state.consecutive_errors = 0
        state.consecutive_403 = 0
        state.consecutive_429 = 0
        state.suspicious_response_count = 0
        state.current_cooldown_until = None
        state.last_block_reason = None
        self.db.flush()
        logger.info(f"[DomainGuard] Manual reset: {domain}")

    # ── Robots.txt ─────────────────────────────────────────────────────────────

    async def fetch_robots_txt(self, base_url: str) -> Optional[str]:
        """
        Načte robots.txt a uloží snapshot do DB (cache 24h).
        Vrátí obsah robots.txt nebo None.
        """
        domain = self.extract_domain(base_url)
        state = self._get_or_create_state(domain)

        # Cache check
        if state.robots_txt_snapshot is not None and state.updated_at:
            age_s = (self._now() - state.updated_at).total_seconds()
            if age_s < _ROBOTS_CACHE_TTL_S:
                return state.robots_txt_snapshot

        parsed = urlparse(base_url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

        try:
            connector = aiohttp.TCPConnector(ssl=False)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(
                    robots_url,
                    timeout=aiohttp.ClientTimeout(total=10),
                    headers={"User-Agent": "Mozilla/5.0 compatible"},
                ) as resp:
                    if resp.status == 200:
                        content = await resp.text(errors="replace")
                        state.robots_txt_snapshot = content[:10000]  # cap na 10kB
                        self.db.flush()
                        logger.debug(f"[DomainGuard] robots.txt cached for {domain}")
                        return state.robots_txt_snapshot
                    else:
                        # 404 nebo jiný status → žádná omezení, uložíme prázdný string
                        state.robots_txt_snapshot = ""
                        self.db.flush()
                        return None
        except Exception as e:
            logger.debug(f"[DomainGuard] robots.txt fetch failed for {domain}: {e}")
            return None

    def is_allowed_by_robots(self, url: str, user_agent: str = "*") -> bool:
        """
        Zkontroluje, zda je URL povolena dle robots.txt.
        Pokud nemáme snapshot, vrátí True (optimisticky).
        """
        domain = self.extract_domain(url)
        state = self.db.query(DomainCrawlState).filter_by(domain=domain).first()

        if not state or not state.robots_txt_snapshot:
            return True

        try:
            rp = RobotFileParser()
            rp.parse(state.robots_txt_snapshot.splitlines())
            return rp.can_fetch(user_agent, url)
        except Exception:
            return True

    # ── Kontextový manažer (async) ─────────────────────────────────────────────

    async def wait_and_acquire(
        self,
        url: str,
        crawl_delay_override: Optional[float] = None,
    ) -> None:
        """
        Asynchrounně počká potřebný čas a zkontroluje blokaci.
        Vyhodí BlockedDomainError nebo CooldownError pokud nelze pokračovat.

        Použití:
            await guard.wait_and_acquire(url)
            html = await fetch_page(url)
        """
        domain = self.extract_domain(url)
        state = self._get_or_create_state(domain)

        if state.is_blocked:
            raise BlockedDomainError(domain, state.last_block_reason or "")

        now = self._now()
        if state.current_cooldown_until and state.current_cooldown_until > now:
            remaining = (state.current_cooldown_until - now).total_seconds()
            if remaining > 60:
                # Příliš dlouhý cooldown – přeskočíme
                raise CooldownError(domain, state.current_cooldown_until)
            # Krátký cooldown – počkáme
            logger.debug(f"[DomainGuard] waiting cooldown {remaining:.1f}s for {domain}")
            await asyncio.sleep(remaining)

        delay = self.required_delay_s(url, crawl_delay_override)
        if delay > 0:
            logger.debug(f"[DomainGuard] delay {delay:.1f}s for {domain}")
            await asyncio.sleep(delay)
