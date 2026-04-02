"""
Matching API – správa párování produktů s konkurenty.

Endpointy:

  Kandidáti:
    GET  /api/matching/candidates                         – seznam kandidátů (filtrovaný)
    GET  /api/matching/candidates/{candidate_id}          – detail kandidáta

  Matche:
    GET  /api/matching/matches                            – seznam matchů (filtrovaný dle statusu)
    GET  /api/matching/matches/{match_id}                 – detail matche
    POST /api/matching/matches/{match_id}/approve         – schválit
    POST /api/matching/matches/{match_id}/reject          – zamítnout
    POST /api/matching/matches/{match_id}/deactivate      – deaktivovat

  Pipeline:
    POST /api/matching/run-discovery                      – spustit discovery pro konkurenta
    POST /api/matching/run-pipeline                       – spustit celý pipeline
    POST /api/matching/rescore/{product_id}/{competitor_id} – přepočítat skóre

  Statistiky:
    GET  /api/matching/stats                              – přehled stavů matchů
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.middleware.auth import verify_token
from app.models.competitor import Competitor
from app.models.competitor_candidate import CompetitorCandidate
from app.models.price import Price
from app.models.product import Product
from app.models.product_match import ProductMatch
from app.scraping.domain_guard import DomainGuard
from app.scraping.discovery import discover_product_urls
from app.scraping.candidate_scraper import scrape_batch
from app.scraping.pipeline import (
    run_pipeline_for_product,
    run_pipeline_for_competitor,
    rescore_existing_candidates,
    score_and_propose_matches,
)

router = APIRouter(prefix="/api/matching", tags=["matching"])
logger = logging.getLogger(__name__)


# ── Pydantic schémata ──────────────────────────────────────────────────────────

class CandidateResponse(BaseModel):
    id: str
    competitor_id: str
    competitor_name: Optional[str] = None
    source_url: str
    discovered_url: str
    product_name_raw: Optional[str] = None
    product_name_normalized: Optional[str] = None
    brand_raw: Optional[str] = None
    price_value: Optional[float] = None
    currency: str = "CZK"
    weight_g: Optional[int] = None
    unit_price_per_kg: Optional[float] = None
    is_available: Optional[bool] = None
    has_structured_data: bool = False
    canonical_attributes: Optional[dict] = None
    scraped_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MatchResponse(BaseModel):
    id: str
    product_id: str
    product_name: Optional[str] = None
    competitor_id: str
    competitor_name: Optional[str] = None
    competitor_market: Optional[str] = "CZ"
    candidate_id: Optional[str] = None
    candidate_name: Optional[str] = None
    candidate_url: Optional[str] = None
    candidate_price: Optional[float] = None
    candidate_weight_g: Optional[int] = None
    candidate_available: Optional[bool] = None

    match_status: str
    match_confidence_score: Optional[float] = None
    match_grade: Optional[str] = None
    scoring_breakdown: Optional[dict] = None

    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    last_price_check_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ApproveRequest(BaseModel):
    notes: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str
    notes: Optional[str] = None


class RunDiscoveryRequest(BaseModel):
    competitor_id: str
    listing_url: str
    max_candidates: int = 50


class RunPipelineRequest(BaseModel):
    product_id: str
    competitor_id: str
    listing_urls: Optional[list[str]] = None


class MatchStats(BaseModel):
    proposed: int = 0
    auto_approved: int = 0
    manually_approved: int = 0
    rejected: int = 0
    inactive: int = 0
    total: int = 0


# ── Pomocné funkce ─────────────────────────────────────────────────────────────

def _enrich_match_response(match: ProductMatch, db: Session) -> dict:
    """Obohatí ProductMatch o informace z propojených modelů."""
    product = db.query(Product).filter_by(id=match.product_id).first()
    competitor = db.query(Competitor).filter_by(id=match.competitor_id).first()
    candidate = db.query(CompetitorCandidate).filter_by(id=match.candidate_id).first() if match.candidate_id else None

    return {
        "id": str(match.id),
        "product_id": str(match.product_id),
        "product_name": product.name if product else None,
        "competitor_id": str(match.competitor_id),
        "competitor_name": competitor.name if competitor else None,
        "competitor_market": competitor.market if competitor else "CZ",
        "candidate_id": str(match.candidate_id) if match.candidate_id else None,
        "candidate_name": candidate.product_name_raw if candidate else None,
        "candidate_url": candidate.discovered_url if candidate else None,
        "candidate_price": float(candidate.price_value) if candidate and candidate.price_value else None,
        "candidate_weight_g": candidate.weight_g if candidate else None,
        "candidate_available": candidate.is_available if candidate else None,
        "match_status": match.match_status,
        "match_confidence_score": float(match.match_confidence_score) if match.match_confidence_score else None,
        "match_grade": match.match_grade,
        "scoring_breakdown": match.scoring_breakdown_json,
        "approved_at": match.approved_at,
        "rejection_reason": match.rejection_reason,
        "notes": match.notes,
        "is_active": match.is_active,
        "last_price_check_at": match.last_price_check_at,
        "created_at": match.created_at,
        "updated_at": match.updated_at,
    }


def _enrich_candidate_response(candidate: CompetitorCandidate, db: Session) -> dict:
    """Obohatí CompetitorCandidate o název konkurenta."""
    competitor = db.query(Competitor).filter_by(id=candidate.competitor_id).first()
    has_struct = bool(
        candidate.scraped_structured_data_json
        and len(candidate.scraped_structured_data_json) > 0
    )
    return {
        "id": str(candidate.id),
        "competitor_id": str(candidate.competitor_id),
        "competitor_name": competitor.name if competitor else None,
        "source_url": candidate.source_url,
        "discovered_url": candidate.discovered_url,
        "product_name_raw": candidate.product_name_raw,
        "product_name_normalized": candidate.product_name_normalized,
        "brand_raw": candidate.brand_raw,
        "price_value": float(candidate.price_value) if candidate.price_value else None,
        "currency": candidate.currency or "CZK",
        "weight_g": candidate.weight_g,
        "unit_price_per_kg": float(candidate.unit_price_per_kg) if candidate.unit_price_per_kg else None,
        "is_available": candidate.is_available,
        "has_structured_data": has_struct,
        "canonical_attributes": candidate.canonical_attributes_json,
        "scraped_at": candidate.scraped_at,
    }


# ── Endpointy: Kandidáti ───────────────────────────────────────────────────────

@router.get("/candidates", response_model=list[CandidateResponse])
def list_candidates(
    competitor_id: Optional[str] = Query(None),
    has_price: Optional[bool] = Query(None),
    is_available: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """Vrátí seznam scraped kandidátů s volitelným filtrováním."""
    q = db.query(CompetitorCandidate)

    if competitor_id:
        q = q.filter(CompetitorCandidate.competitor_id == competitor_id)
    if has_price is True:
        q = q.filter(CompetitorCandidate.price_value.isnot(None))
    if has_price is False:
        q = q.filter(CompetitorCandidate.price_value.is_(None))
    if is_available is not None:
        q = q.filter(CompetitorCandidate.is_available == is_available)

    q = q.order_by(CompetitorCandidate.scraped_at.desc())
    candidates = q.offset(skip).limit(limit).all()
    return [_enrich_candidate_response(c, db) for c in candidates]


@router.get("/candidates/{candidate_id}", response_model=CandidateResponse)
def get_candidate(
    candidate_id: str,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """Detail kandidáta."""
    candidate = db.query(CompetitorCandidate).filter_by(id=candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Kandidát nenalezen")
    return _enrich_candidate_response(candidate, db)


# ── Endpointy: Matche ──────────────────────────────────────────────────────────

@router.get("/matches", response_model=list[MatchResponse])
def list_matches(
    product_id: Optional[str] = Query(None),
    competitor_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="proposed|auto_approved|manually_approved|rejected|inactive"),
    grade: Optional[str] = Query(None, description="A|B|C|X"),
    market: Optional[str] = Query(None, description="CZ|SK|HU — filtruje dle trhu konkurenta"),
    product_market: Optional[str] = Query(None, description="CZ|SK|HU — filtruje dle trhu produktu (dle záznamu v ceníku)"),
    is_active: Optional[bool] = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """Vrátí seznam matchů s volitelným filtrováním."""
    q = db.query(ProductMatch)

    if product_id:
        q = q.filter(ProductMatch.product_id == product_id)
    if competitor_id:
        q = q.filter(ProductMatch.competitor_id == competitor_id)
    if status:
        q = q.filter(ProductMatch.match_status == status)
    if grade:
        q = q.filter(ProductMatch.match_grade == grade)
    if is_active is not None:
        q = q.filter(ProductMatch.is_active == is_active)
    if market:
        # Filtruj dle trhu konkurenta — JOIN přes competitor_id
        q = q.join(Competitor, ProductMatch.competitor_id == Competitor.id)\
             .filter(Competitor.market == market)
    if product_market:
        # Filtruj dle trhu produktu — produkt musí mít alespoň jednu cenu v daném trhu
        sk_product_ids = db.query(Price.product_id).filter(Price.market == product_market).distinct().subquery()
        q = q.filter(ProductMatch.product_id.in_(sk_product_ids))

    q = q.order_by(ProductMatch.match_confidence_score.desc().nullslast())
    matches = q.offset(skip).limit(limit).all()
    return [_enrich_match_response(m, db) for m in matches]


@router.get("/matches/{match_id}", response_model=MatchResponse)
def get_match(
    match_id: str,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """Detail matche."""
    match = db.query(ProductMatch).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match nenalezen")
    return _enrich_match_response(match, db)


@router.post("/matches/{match_id}/approve")
def approve_match(
    match_id: str,
    body: ApproveRequest,
    db: Session = Depends(get_db),
    token=Depends(verify_token),
):
    """Ručně schválí navržený match."""
    match = db.query(ProductMatch).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match nenalezen")

    if match.match_status in ("rejected", "inactive"):
        raise HTTPException(
            status_code=400,
            detail=f"Nelze schválit match ve stavu '{match.match_status}'"
        )

    match.match_status = "manually_approved"
    match.approved_by = token.get("sub")
    match.approved_at = datetime.now(timezone.utc)
    match.is_active = True
    if body.notes:
        match.notes = body.notes

    db.commit()
    return {"message": "Match schválen", "match_id": match_id, "status": "manually_approved"}


@router.post("/matches/{match_id}/reject")
def reject_match(
    match_id: str,
    body: RejectRequest,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """Zamítne navržený match."""
    match = db.query(ProductMatch).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match nenalezen")

    match.match_status = "rejected"
    match.rejection_reason = body.reason
    match.is_active = False
    if body.notes:
        match.notes = body.notes

    db.commit()
    return {"message": "Match zamítnut", "match_id": match_id, "status": "rejected"}


@router.post("/matches/{match_id}/deactivate")
def deactivate_match(
    match_id: str,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """Deaktivuje aktivní match (produkt přestal existovat u konkurenta)."""
    match = db.query(ProductMatch).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match nenalezen")

    match.match_status = "inactive"
    match.is_active = False
    db.commit()
    return {"message": "Match deaktivován", "match_id": match_id}


@router.delete("/matches/{match_id}")
def delete_match(
    match_id: str,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """Trvale smaže match záznam (hard delete)."""
    match = db.query(ProductMatch).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match nenalezen")
    db.delete(match)
    db.commit()
    return {"message": "Match smazán", "match_id": match_id}


class UpdateCandidateUrlRequest(BaseModel):
    url: str


@router.patch("/candidates/{candidate_id}/url")
def update_candidate_url(
    candidate_id: str,
    body: UpdateCandidateUrlRequest,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """
    Opraví URL kandidáta a vymaže zastaralá scraped data (příští pipeline
    data znovu stáhne z nové adresy).
    """
    candidate = db.query(CompetitorCandidate).filter_by(id=candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Kandidát nenalezen")

    candidate.discovered_url = body.url.strip()
    # Vymaž zastaralá data — příští scrape je načte z nové URL
    candidate.product_name_raw = None
    candidate.product_name_normalized = None
    candidate.price_value = None
    candidate.scraped_at = None
    candidate.content_hash = None
    db.commit()
    return {"message": "URL kandidáta aktualizováno", "candidate_id": candidate_id, "url": body.url}


# ── Endpointy: Pipeline ────────────────────────────────────────────────────────

@router.post("/run-discovery")
async def run_discovery(
    body: RunDiscoveryRequest,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """
    Spustí pouze discovery krok pro daného konkurenta a listing URL.
    Vrátí seznam nalezených produktových URL (bez scrapingu).
    """
    competitor = db.query(Competitor).filter_by(id=body.competitor_id).first()
    if not competitor:
        raise HTTPException(status_code=404, detail="Konkurent nenalezen")

    guard = DomainGuard(db, default_min_delay_s=float(competitor.default_crawl_delay_s or 3.0))

    try:
        urls = await discover_product_urls(
            listing_url=body.listing_url,
            guard=guard,
            crawl_delay_s=float(competitor.default_crawl_delay_s or 3.0),
            max_candidates=body.max_candidates,
        )
        db.commit()  # Uložíme domain_crawl_state změny
        return {
            "listing_url": body.listing_url,
            "found": len(urls),
            "product_urls": urls,
        }
    except Exception as e:
        logger.error(f"[matching API] Discovery error: {e}")
        raise HTTPException(status_code=500, detail=f"Discovery selhala: {str(e)[:200]}")


@router.post("/run-pipeline")
async def run_pipeline(
    body: RunPipelineRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """
    Spustí celý pipeline (discovery + scraping + scoring + propose matches)
    pro jeden produkt × jeden konkurent.

    Pipeline běží v background tasku – vrátí okamžitou odpověď.
    """
    product = db.query(Product).filter_by(id=body.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    competitor = db.query(Competitor).filter_by(id=body.competitor_id).first()
    if not competitor:
        raise HTTPException(status_code=404, detail="Konkurent nenalezen")

    # Poznámka: canonical_attributes_json.ingredient není povinný – scoring engine
    # funguje i bez něj (použije porovnání názvů). Produkty bez profilu dostanou
    # nižší skóre, ale pipeline proběhne a navrhne nejlepší shody.

    has_profile = bool((product.canonical_attributes_json or {}).get("ingredient"))

    async def run_bg():
        from app.database import SessionLocal
        bg_db = SessionLocal()
        try:
            bg_product = bg_db.query(Product).filter_by(id=body.product_id).first()
            bg_competitor = bg_db.query(Competitor).filter_by(id=body.competitor_id).first()
            if bg_product and bg_competitor:
                await run_pipeline_for_product(
                    product=bg_product,
                    competitor=bg_competitor,
                    db=bg_db,
                    listing_urls=body.listing_urls,
                )
        except Exception as e:
            logger.error(f"[matching API] Background pipeline error: {e}")
        finally:
            bg_db.close()

    background_tasks.add_task(run_bg)

    return {
        "message": "Pipeline spuštěn na pozadí",
        "product_id": body.product_id,
        "product_name": product.name,
        "competitor_id": body.competitor_id,
        "competitor_name": competitor.name,
        "has_profile": has_profile,
        "note": None if has_profile else "Produkt nemá plný profil — výsledky budou porovnány jen podle názvu. Pro přesnější matching propojte produkt s katalogem.",
    }


@router.post("/rescore/{product_id}/{competitor_id}")
def rescore_matches(
    product_id: str,
    competitor_id: str,
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """
    Přepočítá skóre existujících kandidátů pro daný produkt × konkurent.
    Používá se po změně matching profilu produktu.
    """
    product = db.query(Product).filter_by(id=product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    proposed, auto_approved = rescore_existing_candidates(
        product=product,
        competitor_id=competitor_id,
        db=db,
    )

    return {
        "message": "Přepočet hotov",
        "proposed": proposed,
        "auto_approved": auto_approved,
    }


# ── Statistiky ─────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=MatchStats)
def get_match_stats(
    product_id: Optional[str] = Query(None),
    competitor_id: Optional[str] = Query(None),
    market: Optional[str] = Query(None, description="CZ|SK|HU — filtruje dle trhu konkurenta"),
    product_market: Optional[str] = Query(None, description="CZ|SK|HU — filtruje dle trhu produktu"),
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """Souhrnné statistiky matchů dle stavu."""
    q = db.query(ProductMatch.match_status, func.count(ProductMatch.id))

    if product_id:
        q = q.filter(ProductMatch.product_id == product_id)
    if competitor_id:
        q = q.filter(ProductMatch.competitor_id == competitor_id)
    if market:
        q = q.join(Competitor, ProductMatch.competitor_id == Competitor.id)\
             .filter(Competitor.market == market)
    if product_market:
        pm_product_ids = db.query(Price.product_id).filter(Price.market == product_market).distinct().subquery()
        q = q.filter(ProductMatch.product_id.in_(pm_product_ids))

    rows = q.group_by(ProductMatch.match_status).all()

    counts = {row[0]: row[1] for row in rows}
    total = sum(counts.values())

    return MatchStats(
        proposed=counts.get("proposed", 0),
        auto_approved=counts.get("auto_approved", 0),
        manually_approved=counts.get("manually_approved", 0),
        rejected=counts.get("rejected", 0),
        inactive=counts.get("inactive", 0),
        total=total,
    )


# ── Přehled matchů pro detail produktu ─────────────────────────────────────────

@router.get("/product/{product_id}/matches", response_model=list[MatchResponse])
def get_product_matches(
    product_id: str,
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="proposed|auto_approved|manually_approved|rejected|inactive|active"
    ),
    db: Session = Depends(get_db),
    _token=Depends(verify_token),
):
    """
    Vrátí všechny aktivní matche pro daný produkt.
    status=active → vrátí auto_approved + manually_approved.
    """
    q = db.query(ProductMatch).filter_by(product_id=product_id)

    if status_filter == "active":
        q = q.filter(ProductMatch.match_status.in_(["auto_approved", "manually_approved"]))
    elif status_filter:
        q = q.filter(ProductMatch.match_status == status_filter)

    q = q.filter(ProductMatch.is_active == True)
    q = q.order_by(ProductMatch.match_confidence_score.desc().nullslast())

    matches = q.all()
    return [_enrich_match_response(m, db) for m in matches]
