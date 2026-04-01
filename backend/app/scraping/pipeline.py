"""
Matching Pipeline – orchestrace celého procesu:
  1. Discovery: Listing URL → seznam produktových URL
  2. Scraping: Každá produktová URL → CompetitorCandidate
  3. Scoring: CompetitorCandidate × WatchedProduct → ScoringResult
  4. Propose: Výsledky uložíme jako ProductMatch záznamy

Vstupní body:
  run_pipeline_for_product()   – jeden sledovaný produkt × jeden konkurent
  run_pipeline_for_competitor() – jeden konkurent × všechny sledované produkty firmy
  run_full_pipeline()          – všichni aktivní konkurenti × všechny produkty firmy

Pravidla auto-approve:
  - Grade A (≥ 85 bodů) a is_available=True → status = "auto_approved"
  - Ostatní non-reject → status = "proposed"  (čeká na ruční review)

Pravidla duplikátů:
  - UNIQUE constraint (product_id, competitor_id, candidate_id) → upsert
  - Pokud match existuje a je "manually_approved" nebo "rejected" → nepřepisujeme

Databázové operace:
  - Vše běží v jedné DB session, commit na konci pipeline
  - Pokud selže scraping jednoho kandidáta, pokračujeme bez rollback
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models.competitor import Competitor
from app.models.competitor_candidate import CompetitorCandidate
from app.models.product import Product
from app.models.product_match import ProductMatch
from app.scoring.engine import (
    candidate_to_profile,
    watched_product_to_profile,
    score_candidate,
    score_all_candidates,
)
from app.scraping.candidate_scraper import scrape_batch
from app.scraping.discovery import discover_product_urls
from app.scraping.domain_guard import DomainGuard, BlockedDomainError

logger = logging.getLogger(__name__)

# ── Konfigurace ────────────────────────────────────────────────────────────────

AUTO_APPROVE_MIN_SCORE = 85.0   # Grade A
MAX_CANDIDATES_PER_LISTING = 50
TOP_N_PER_COMPETITOR = 5        # Kolik nejlepších matchů uložíme per competitor


# ── Výsledkový objekt ──────────────────────────────────────────────────────────

@dataclass
class PipelineResult:
    """Výsledek pipeline pro jeden product × competitor pár."""
    product_id: str
    competitor_id: str
    discovered: int = 0          # Počet nalezených URL
    scraped: int = 0             # Počet úspěšně scraped kandidátů
    matches_proposed: int = 0    # Počet navržených matchů
    matches_auto_approved: int = 0
    errors: list[str] = None

    def __post_init__(self):
        if self.errors is None:
            self.errors = []


# ── Uložení matchů do DB ───────────────────────────────────────────────────────

def _upsert_product_match(
    db: Session,
    product_id: str,
    competitor_id: str,
    candidate_id: str,
    score_result,
    auto_approve: bool,
) -> ProductMatch:
    """
    Vytvoří nebo aktualizuje ProductMatch záznam.
    Nepřepisuje manually_approved / rejected záznamy.
    """
    existing: Optional[ProductMatch] = (
        db.query(ProductMatch)
        .filter_by(
            product_id=product_id,
            competitor_id=competitor_id,
            candidate_id=candidate_id,
        )
        .first()
    )

    if existing:
        # Nemažeme manuální rozhodnutí
        if existing.match_status in ("manually_approved", "rejected"):
            return existing

        # Aktualizujeme scoring
        existing.match_confidence_score = score_result.final_score
        existing.match_grade = score_result.grade
        existing.scoring_breakdown_json = score_result.to_dict()
        existing.is_active = True
        existing.updated_at = datetime.now(timezone.utc)
        if auto_approve and existing.match_status == "proposed":
            existing.match_status = "auto_approved"
        db.flush()
        return existing

    # Nový záznam
    status = "auto_approved" if auto_approve else "proposed"
    match = ProductMatch(
        id=uuid.uuid4(),
        product_id=product_id,
        competitor_id=competitor_id,
        candidate_id=candidate_id,
        match_status=status,
        match_confidence_score=score_result.final_score,
        match_grade=score_result.grade,
        scoring_breakdown_json=score_result.to_dict(),
        is_active=True,
    )
    if auto_approve:
        match.approved_at = datetime.now(timezone.utc)

    db.add(match)
    db.flush()
    return match


# ── Core pipeline krok 3+4: Score + Propose ────────────────────────────────────

def score_and_propose_matches(
    product: Product,
    candidates: list[CompetitorCandidate],
    competitor_id: str,
    db: Session,
    top_n: int = TOP_N_PER_COMPETITOR,
) -> tuple[int, int]:
    """
    Ohodnotí kandidáty proti sledovanému produktu a uloží návrhy matchů.

    Vrátí tuple (proposed_count, auto_approved_count).
    """
    if not candidates:
        return 0, 0

    watched_profile = watched_product_to_profile(product)
    candidate_profiles = [candidate_to_profile(c) for c in candidates]

    # Scoring – vrátí seřazené non-reject páry (candidate, result)
    scored = score_all_candidates(watched_profile, candidate_profiles, top_n=top_n)

    proposed = 0
    auto_approved = 0

    for candidate_profile, result in scored:
        # Najdi odpovídající DB objekt
        candidate_obj = next(
            (c for c in candidates if str(c.id) == candidate_profile.candidate_id),
            None
        )
        if not candidate_obj:
            continue

        auto = (
            result.final_score >= AUTO_APPROVE_MIN_SCORE
            and result.grade == "A"
            and candidate_obj.is_available is not False  # None = neznámo → propose
        )

        try:
            match = _upsert_product_match(
                db=db,
                product_id=str(product.id),
                competitor_id=competitor_id,
                candidate_id=str(candidate_obj.id),
                score_result=result,
                auto_approve=auto,
            )
            if match.match_status == "auto_approved":
                auto_approved += 1
            else:
                proposed += 1
        except Exception as e:
            logger.error(
                f"[pipeline] Failed to save match product={product.id} "
                f"candidate={candidate_obj.id}: {e}"
            )

    return proposed, auto_approved


# ── Pipeline pro jeden produkt × jeden konkurent ──────────────────────────────

async def run_pipeline_for_product(
    product: Product,
    competitor: Competitor,
    db: Session,
    listing_urls: Optional[list[str]] = None,
) -> PipelineResult:
    """
    Spustí celý pipeline pro jeden sledovaný produkt × jeden konkurent.

    listing_urls – pokud None, použijeme competitor.url jako listing
    """
    result = PipelineResult(
        product_id=str(product.id),
        competitor_id=str(competitor.id),
    )

    if not competitor.is_scraping_active:
        result.errors.append("Scraping disabled for competitor")
        return result

    # Listing URL – z konfigurce nebo fallback na homepage
    if listing_urls is None:
        listing_urls_resolved = [competitor.url]
    else:
        listing_urls_resolved = listing_urls

    guard = DomainGuard(db, default_min_delay_s=float(competitor.default_crawl_delay_s or 3.0))
    crawl_delay = float(competitor.default_crawl_delay_s or 3.0)

    # ── Krok 1: Discovery ──────────────────────────────────────────────────────
    all_product_urls: list[str] = []
    for listing_url in listing_urls_resolved:
        try:
            urls = await discover_product_urls(
                listing_url=listing_url,
                guard=guard,
                crawl_delay_s=crawl_delay,
                max_candidates=MAX_CANDIDATES_PER_LISTING,
            )
            all_product_urls.extend(urls)
        except BlockedDomainError as e:
            result.errors.append(f"Domain blocked: {e}")
            logger.warning(f"[pipeline] Blocked: {e}")
            break
        except Exception as e:
            result.errors.append(f"Discovery error: {str(e)[:200]}")
            logger.error(f"[pipeline] Discovery error for {listing_url}: {e}")

    # Deduplikace napříč listingy
    seen = set()
    dedup_urls = []
    for u in all_product_urls:
        if u not in seen:
            seen.add(u)
            dedup_urls.append(u)

    result.discovered = len(dedup_urls)
    if not dedup_urls:
        logger.info(f"[pipeline] No product URLs found for competitor {competitor.name}")
        return result

    # ── Krok 2: Scraping ───────────────────────────────────────────────────────
    candidates = await scrape_batch(
        urls=dedup_urls,
        competitor_id=str(competitor.id),
        source_url=listing_urls_resolved[0],
        guard=guard,
        db=db,
        crawl_delay_s=crawl_delay,
        max_concurrent=1,
    )
    result.scraped = len(candidates)
    db.flush()  # Flush candidates před scoringem

    if not candidates:
        logger.info(f"[pipeline] No candidates scraped for competitor {competitor.name}")
        return result

    # ── Krok 3+4: Score + Propose ──────────────────────────────────────────────
    proposed, auto_approved = score_and_propose_matches(
        product=product,
        candidates=candidates,
        competitor_id=str(competitor.id),
        db=db,
        top_n=TOP_N_PER_COMPETITOR,
    )
    result.matches_proposed = proposed
    result.matches_auto_approved = auto_approved

    db.commit()

    logger.info(
        f"[pipeline] product={product.id} competitor={competitor.name}: "
        f"discovered={result.discovered} scraped={result.scraped} "
        f"proposed={proposed} auto_approved={auto_approved}"
    )
    return result


# ── Pipeline pro jednoho konkurenta × všechny produkty firmy ─────────────────

async def run_pipeline_for_competitor(
    competitor_id: str,
    company_id: str,
    db: Session,
) -> list[PipelineResult]:
    """
    Spustí pipeline pro všechny aktivní sledované produkty firmy
    ve vztahu k jednomu konkurentovi.
    """
    competitor = db.query(Competitor).filter_by(id=competitor_id).first()
    if not competitor:
        logger.error(f"[pipeline] Competitor {competitor_id} not found")
        return []

    products = (
        db.query(Product)
        .filter_by(company_id=company_id, is_active=True)
        .all()
    )

    logger.info(
        f"[pipeline] Starting for competitor={competitor.name}, "
        f"{len(products)} products"
    )

    results = []
    for product in products:
        # Jen produkty, které mají vyplněné canonical attrs
        attrs = product.canonical_attributes_json or {}
        if not attrs.get("ingredient"):
            logger.debug(f"[pipeline] Skipping product {product.id} — no canonical attrs")
            continue

        r = await run_pipeline_for_product(
            product=product,
            competitor=competitor,
            db=db,
        )
        results.append(r)

    return results


# ── Full pipeline (všichni konkurenti × všechny produkty) ────────────────────

async def run_full_pipeline(company_id: str) -> dict:
    """
    Spustí full pipeline pro celou firmu.
    Používá vlastní DB session (vhodné pro scheduler / background job).

    Vrátí souhrnné statistiky.
    """
    db = SessionLocal()
    totals = {
        "discovered": 0, "scraped": 0,
        "proposed": 0, "auto_approved": 0,
        "errors": 0,
    }
    try:
        competitors = (
            db.query(Competitor)
            .filter_by(company_id=company_id, is_active=True, is_scraping_active=True)
            .all()
        )

        logger.info(f"[pipeline] Full run for company={company_id}, {len(competitors)} competitors")

        for competitor in competitors:
            results = await run_pipeline_for_competitor(
                competitor_id=str(competitor.id),
                company_id=company_id,
                db=db,
            )
            for r in results:
                totals["discovered"] += r.discovered
                totals["scraped"] += r.scraped
                totals["proposed"] += r.matches_proposed
                totals["auto_approved"] += r.matches_auto_approved
                totals["errors"] += len(r.errors)

        logger.info(f"[pipeline] Full run complete: {totals}")
        return {"status": "success", **totals}

    except Exception as e:
        logger.error(f"[pipeline] Full pipeline failed: {e}")
        return {"status": "error", "message": str(e), **totals}
    finally:
        db.close()


# ── Rescore existujících kandidátů (bez nového scrapingu) ────────────────────

def rescore_existing_candidates(
    product: Product,
    competitor_id: str,
    db: Session,
) -> tuple[int, int]:
    """
    Přeskóruje existující (dříve scraped) kandidáty pro daný produkt × konkurent.
    Neprovolává scraping – jen přepočítá skóre a aktualizuje match záznamy.
    Vrátí (proposed, auto_approved).
    """
    candidates = (
        db.query(CompetitorCandidate)
        .filter_by(competitor_id=competitor_id)
        .all()
    )

    if not candidates:
        return 0, 0

    proposed, auto_approved = score_and_propose_matches(
        product=product,
        candidates=candidates,
        competitor_id=competitor_id,
        db=db,
    )
    db.commit()
    return proposed, auto_approved
