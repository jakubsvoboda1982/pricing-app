from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
from app.database import get_db
from app.middleware.auth import verify_token
from app.models import Competitor, CompetitorPrice, CompetitorRank, CompetitorAlert, Company
from app.schemas.competitor import (
    CompetitorCreate, CompetitorUpdate, CompetitorResponse,
    CompetitorDetailResponse, CompetitorListResponse, CompetitorPriceResponse,
    CompetitorRankResponse, CompetitorAlertResponse
)
from app.utils.scraper import scrape_competitor_metadata
from datetime import datetime, timedelta
from decimal import Decimal
import logging

router = APIRouter(prefix="/api/competitors", tags=["competitors"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[CompetitorListResponse])
def get_competitors(
    category: str = None,
    market: str = None,
    is_active: bool = True,
    skip: int = 0,
    limit: int = 50,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Načti seznam konkurentů s filtry"""
    from sqlalchemy import func, and_

    query = db.query(Competitor).filter(Competitor.is_active == is_active)

    if category:
        query = query.filter(Competitor.category == category)

    if market:
        query = query.filter(Competitor.market == market)

    competitors = query.offset(skip).limit(limit).all()

    # Efektivnější dotazy - vytvoř mapy pro snadný lookup
    if not competitors:
        return []

    competitor_ids = [c.id for c in competitors]

    # Dotaz na nejnovější ceny
    latest_prices_subq = (
        db.query(
            CompetitorPrice.competitor_id,
            CompetitorPrice.price
        ).filter(
            CompetitorPrice.competitor_id.in_(competitor_ids)
        ).distinct(CompetitorPrice.competitor_id)
        .order_by(CompetitorPrice.competitor_id, desc(CompetitorPrice.recorded_at))
    ).all()

    prices_map = {p[0]: p[1] for p in latest_prices_subq}

    # Dotaz na nejnovější ranking
    latest_ranks_subq = (
        db.query(
            CompetitorRank.competitor_id,
            CompetitorRank.rank
        ).filter(
            CompetitorRank.competitor_id.in_(competitor_ids)
        ).distinct(CompetitorRank.competitor_id)
        .order_by(CompetitorRank.competitor_id, desc(CompetitorRank.evaluated_at))
    ).all()

    ranks_map = {r[0]: r[1] for r in latest_ranks_subq}

    # Počet nepřečtených alertů
    alerts_subq = db.query(
        CompetitorAlert.competitor_id,
        func.count(CompetitorAlert.id).label('alert_count')
    ).filter(
        and_(
            CompetitorAlert.competitor_id.in_(competitor_ids),
            CompetitorAlert.is_read == False
        )
    ).group_by(CompetitorAlert.competitor_id).all()

    alerts_map = {a[0]: a[1] for a in alerts_subq}

    # Vytvořit výsledky
    result = []
    for comp in competitors:
        result.append(CompetitorListResponse(
            id=comp.id,
            name=comp.name,
            url=comp.url,
            logo_url=comp.logo_url,
            category=comp.category,
            market=comp.market,
            is_active=comp.is_active,
            last_scrape_date=comp.last_scrape_date,
            scrape_error=comp.scrape_error,
            latest_price=prices_map.get(comp.id),
            latest_rank=ranks_map.get(comp.id),
            unread_alerts_count=alerts_map.get(comp.id, 0)
        ))

    return result


@router.post("", response_model=CompetitorResponse, status_code=status.HTTP_201_CREATED)
def add_competitor(
    competitor_data: CompetitorCreate,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Přidej nového konkurenta - okamžitě bez čekání na scraping"""
    from app.models import User

    # Získej aktuálního uživatele a jeho společnost
    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Uživatel nenalezen"
        )

    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Společnost nenalezena"
        )

    # Ověř unikátnost URL+market+company
    existing = db.query(Competitor).filter(
        and_(
            Competitor.url == competitor_data.url,
            Competitor.market == competitor_data.market,
            Competitor.company_id == company.id
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tento konkurent je již v systému pro trh {competitor_data.market}"
        )

    # Extrahuj doménové jméno jako název
    import re as _re
    domain = _re.sub(r'https?://(www\.)?', '', competitor_data.url).split('/')[0]
    # Detect country from domain
    if '.sk' in domain:
        country = 'SK'
    elif '.cz' in domain:
        country = 'CZ'
    else:
        country = None

    scrape_data = {'success': False}

    # Vytvoř konkurenta
    competitor = Competitor(
        company_id=company.id,
        name=domain,
        url=competitor_data.url,
        market=competitor_data.market,
        logo_url=None,
        description=None,
        email=None,
        phone=None,
        address=None,
        country=country,
        first_scrape_date=datetime.utcnow() if scrape_data.get('success') else None,
        last_scrape_date=datetime.utcnow() if scrape_data.get('success') else None,
        scrape_error=scrape_data.get('error') if not scrape_data.get('success') else None,
        scrape_data=scrape_data,
        scrape_attempts=1,
        scrape_failures=0 if scrape_data.get('success') else 1
    )

    db.add(competitor)
    db.commit()
    db.refresh(competitor)

    # Pokud byl scraping úspěšný, ulož ceny
    if scrape_data.get('success') and scrape_data.get('prices_found'):
        for price in scrape_data['prices_found'][:5]:  # Max 5 cen
            competitor_price = CompetitorPrice(
                competitor_id=competitor.id,
                product_name="Nenalezeno",  # TODO: lepší detekce produktu
                price=Decimal(str(price)),
                currency=scrape_data.get('country', 'CZK'),
                market=scrape_data.get('country', 'CZ')
            )
            db.add(competitor_price)

        # Vytvoř iniciální rank
        competitor_rank = CompetitorRank(
            competitor_id=competitor.id,
            rank=50,  # Výchozí rank
            positioning="Medium",
            score_reason="Nový konkurent"
        )
        db.add(competitor_rank)
        db.commit()

    return CompetitorResponse.model_validate(competitor)


@router.get("/{competitor_id}", response_model=CompetitorDetailResponse)
def get_competitor_detail(
    competitor_id: str,
    days_back: int = 30,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Načti detaily konkurenta včetně cen, rankingu a upozornění"""
    competitor = db.query(Competitor).filter(Competitor.id == competitor_id).first()
    if not competitor:
        raise HTTPException(status_code=404, detail="Konkurent nenalezen")

    # Poslední cena
    latest_price = db.query(CompetitorPrice).filter(
        CompetitorPrice.competitor_id == competitor_id
    ).order_by(desc(CompetitorPrice.recorded_at)).first()

    # Poslední rank
    latest_rank = db.query(CompetitorRank).filter(
        CompetitorRank.competitor_id == competitor_id
    ).order_by(desc(CompetitorRank.evaluated_at)).first()

    # Nepřečtená upozornění
    unread_alerts = db.query(CompetitorAlert).filter(
        and_(
            CompetitorAlert.competitor_id == competitor_id,
            CompetitorAlert.is_read == False
        )
    ).order_by(desc(CompetitorAlert.created_at)).all()

    # Ceny za poslední N dní
    date_from = datetime.utcnow() - timedelta(days=days_back)
    recent_prices = db.query(CompetitorPrice).filter(
        and_(
            CompetitorPrice.competitor_id == competitor_id,
            CompetitorPrice.recorded_at >= date_from
        )
    ).order_by(desc(CompetitorPrice.recorded_at)).limit(30).all()

    return CompetitorDetailResponse(
        competitor=CompetitorResponse.model_validate(competitor),
        latest_price=CompetitorPriceResponse.model_validate(latest_price) if latest_price else None,
        latest_rank=CompetitorRankResponse.model_validate(latest_rank) if latest_rank else None,
        unread_alerts=[CompetitorAlertResponse.model_validate(a) for a in unread_alerts],
        recent_prices=[CompetitorPriceResponse.model_validate(p) for p in recent_prices]
    )


@router.put("/{competitor_id}", response_model=CompetitorResponse)
def update_competitor(
    competitor_id: str,
    competitor_data: CompetitorUpdate,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Aktualizuj informace o konkurentovi (manuální editace)"""
    competitor = db.query(Competitor).filter(Competitor.id == competitor_id).first()
    if not competitor:
        raise HTTPException(status_code=404, detail="Konkurent nenalezen")

    # Aktualizuj pole
    update_data = competitor_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(competitor, field, value)

    competitor.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(competitor)

    return CompetitorResponse.model_validate(competitor)


@router.delete("/{competitor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_competitor(
    competitor_id: str,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Smaž konkurenta (soft delete - is_active = False)"""
    competitor = db.query(Competitor).filter(Competitor.id == competitor_id).first()
    if not competitor:
        raise HTTPException(status_code=404, detail="Konkurent nenalezen")

    competitor.is_active = False
    competitor.updated_at = datetime.utcnow()
    db.commit()

    return None


@router.post("/{competitor_id}/rescrape", response_model=CompetitorResponse)
async def rescrape_competitor(
    competitor_id: str,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Znovu stáhni metadata konkurenta z URL (max 8s timeout)"""
    import asyncio

    competitor = db.query(Competitor).filter(Competitor.id == competitor_id).first()
    if not competitor:
        raise HTTPException(status_code=404, detail="Konkurent nenalezen")

    competitor.scrape_attempts += 1

    # Stáhni nová metadata s max 8s timeoutem (bezpečné pro Railway)
    try:
        scrape_data = await asyncio.wait_for(
            scrape_competitor_metadata(competitor.url, timeout=7),
            timeout=8.0
        )

        # Aktualizuj konkurenta
        competitor.name = scrape_data.get('name') or competitor.name
        competitor.logo_url = scrape_data.get('logo_url') or competitor.logo_url
        competitor.description = scrape_data.get('description') or competitor.description
        competitor.email = scrape_data.get('emails', [None])[0] if scrape_data.get('emails') else competitor.email
        competitor.phone = scrape_data.get('phones', [None])[0] if scrape_data.get('phones') else competitor.phone
        competitor.address = scrape_data.get('address') or competitor.address
        competitor.last_scrape_date = datetime.utcnow()
        competitor.scrape_data = scrape_data
        competitor.scrape_error = None

        # Ulož nové ceny
        if scrape_data.get('prices_found'):
            for price in scrape_data['prices_found'][:5]:
                competitor_price = CompetitorPrice(
                    competitor_id=competitor.id,
                    product_name="Aktualizováno",
                    price=Decimal(str(price)),
                    currency=scrape_data.get('country', 'CZK'),
                    market=scrape_data.get('country', 'CZ')
                )
                db.add(competitor_price)

    except (asyncio.TimeoutError, Exception) as e:
        competitor.scrape_error = "Timeout - web neodpověděl" if isinstance(e, asyncio.TimeoutError) else str(e)
        competitor.scrape_failures += 1

    db.commit()
    db.refresh(competitor)

    return CompetitorResponse.model_validate(competitor)


@router.get("/{competitor_id}/prices", response_model=list[CompetitorPriceResponse])
def get_competitor_prices(
    competitor_id: str,
    days_back: int = 30,
    market: str = None,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Načti historii cen konkurenta"""
    competitor = db.query(Competitor).filter(Competitor.id == competitor_id).first()
    if not competitor:
        raise HTTPException(status_code=404, detail="Konkurent nenalezen")

    date_from = datetime.utcnow() - timedelta(days=days_back)

    query = db.query(CompetitorPrice).filter(
        and_(
            CompetitorPrice.competitor_id == competitor_id,
            CompetitorPrice.recorded_at >= date_from
        )
    )

    if market:
        query = query.filter(CompetitorPrice.market == market)

    prices = query.order_by(desc(CompetitorPrice.recorded_at)).limit(200).all()

    return [CompetitorPriceResponse.model_validate(p) for p in prices]


@router.get("/alerts", response_model=list[CompetitorAlertResponse])
def get_alerts(
    competitor_id: str = None,
    is_read: bool = False,
    skip: int = 0,
    limit: int = 50,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Načti upozornění konkurentů"""
    query = db.query(CompetitorAlert).filter(CompetitorAlert.is_read == is_read)

    if competitor_id:
        query = query.filter(CompetitorAlert.competitor_id == competitor_id)

    alerts = query.order_by(desc(CompetitorAlert.created_at)).offset(skip).limit(limit).all()

    return [CompetitorAlertResponse.model_validate(a) for a in alerts]


@router.put("/alerts/{alert_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_alert(
    alert_id: str,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Označ upozornění jako přečtené"""
    alert = db.query(CompetitorAlert).filter(CompetitorAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Upozornění nenalezeno")

    alert.is_read = True
    alert.dismissed_at = datetime.utcnow()
    db.commit()

    return None
