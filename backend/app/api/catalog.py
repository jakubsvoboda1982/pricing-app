from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Query, Body
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import CatalogProduct, Company, FeedSubscription
from app.schemas.catalog_product import CatalogProductResponse, CatalogProductCreate
from app.utils.heureka_parser import HeureaFeedParser, HeurekaParsError
from uuid import UUID
import openpyxl
from io import BytesIO
from decimal import Decimal
from pydantic import BaseModel
from typing import Optional
import aiohttp
import re
from datetime import datetime, timezone

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


# ---------------------------------------------------------------------------
# Schémata
# ---------------------------------------------------------------------------

class ImportUrlRequest(BaseModel):
    url: str
    name: Optional[str] = None
    market: str = "CZ"
    product_type: str = "own"   # "own" = vlastní produkt, "competitor" = konkurent


class FeedSubscriptionCreate(BaseModel):
    name: str
    feed_url: str
    market: str = "CZ"
    merge_existing: bool = True


class FeedSubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    feed_url: Optional[str] = None
    market: Optional[str] = None
    merge_existing: Optional[bool] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Pomocné funkce
# ---------------------------------------------------------------------------

def _get_company(db: Session) -> Company:
    company = db.query(Company).first()
    if not company:
        raise HTTPException(status_code=400, detail="Žádná společnost v systému")
    return company


def _sync_tracked_price(db: Session, catalog_product_id, price_vat, market: str):
    """
    If any tracked Product is linked to this catalog_product_id,
    update (or create) its Price record with the VAT-inclusive selling price.
    """
    if price_vat is None:
        return
    from app.models import Product, Price
    from sqlalchemy import desc
    tracked = db.query(Product).filter(
        Product.catalog_product_id == catalog_product_id
    ).all()
    for product in tracked:
        latest = db.query(Price).filter(
            Price.product_id == product.id,
            Price.market == market,
        ).order_by(desc(Price.changed_at)).first()
        if latest:
            # Only update if price actually changed
            if latest.current_price != price_vat:
                latest.old_price = latest.current_price
                latest.current_price = price_vat
                db.commit()
        else:
            new_price = Price(
                product_id=product.id,
                market=market,
                currency='CZK' if market == 'CZ' else 'EUR',
                current_price=price_vat,
            )
            db.add(new_price)
            db.commit()


def _find_existing_product(db: Session, ean: Optional[str], product_code: Optional[str], market: str, company_id) -> Optional[CatalogProduct]:
    """Najdi existující produkt podle EAN nebo PRODUCTNO"""
    if ean:
        existing = db.query(CatalogProduct).filter(
            CatalogProduct.ean == ean,
            CatalogProduct.market == market,
            CatalogProduct.company_id == company_id
        ).first()
        if existing:
            return existing
    if product_code:
        existing = db.query(CatalogProduct).filter(
            CatalogProduct.product_code == product_code,
            CatalogProduct.market == market,
            CatalogProduct.company_id == company_id
        ).first()
        if existing:
            return existing
    return None


async def _fetch_and_import_feed(feed_sub: FeedSubscription, db: Session):
    """Načti feed z URL a importuj produkty. Aktualizuje stav FeedSubscription."""
    company = db.query(Company).filter(Company.id == feed_sub.company_id).first()
    if not company:
        feed_sub.last_fetch_status = "error"
        feed_sub.last_fetch_message = "Společnost nenalezena"
        feed_sub.last_fetched_at = datetime.now(timezone.utc)
        db.commit()
        return

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(feed_sub.feed_url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status != 200:
                    raise Exception(f"HTTP {resp.status}")
                xml_string = await resp.text()

        parser = HeureaFeedParser()
        products, errors = parser.parse_string(xml_string, market=feed_sub.market)

        imported_count = 0
        updated_count = 0
        skipped_count = 0

        for product_data in products:
            try:
                ean = product_data.get('ean')
                product_code = product_data.get('product_code')
                name = product_data.get('name')
                price_vat = product_data.get('price_vat')  # Selling price with VAT

                existing = _find_existing_product(db, ean, product_code, feed_sub.market, company.id)

                if existing and feed_sub.merge_existing:
                    existing.name = name
                    existing.category = product_data.get('category')
                    existing.manufacturer = product_data.get('manufacturer')
                    existing.description = product_data.get('description')
                    existing.price_without_vat = product_data.get('price_without_vat')
                    existing.vat_rate = product_data.get('vat_rate')
                    existing.quantity_in_stock = product_data.get('quantity_in_stock')
                    existing.unit_of_measure = product_data.get('unit_of_measure', 'ks')
                    existing.thumbnail_url = product_data.get('thumbnail_url')
                    existing.url_reference = product_data.get('url_reference')
                    existing.imported_from = product_data.get('imported_from')
                    if product_code and not existing.product_code:
                        existing.product_code = product_code
                    db.commit()
                    updated_count += 1
                    _sync_tracked_price(db, existing.id, price_vat, feed_sub.market)
                elif existing and not feed_sub.merge_existing:
                    skipped_count += 1
                else:
                    catalog_product = CatalogProduct(
                        company_id=company.id,
                        ean=ean,
                        product_code=product_code,
                        name=name,
                        category=product_data.get('category'),
                        manufacturer=product_data.get('manufacturer'),
                        description=product_data.get('description'),
                        price_without_vat=product_data.get('price_without_vat'),
                        vat_rate=product_data.get('vat_rate'),
                        quantity_in_stock=product_data.get('quantity_in_stock'),
                        unit_of_measure=product_data.get('unit_of_measure', 'ks'),
                        market=feed_sub.market,
                        thumbnail_url=product_data.get('thumbnail_url'),
                        url_reference=product_data.get('url_reference'),
                        imported_from=product_data.get('imported_from'),
                        is_active=True,
                        catalog_identifier=f"{company.id}_{ean}_{feed_sub.market}" if ean else None
                    )
                    db.add(catalog_product)
                    db.commit()
                    imported_count += 1
                    _sync_tracked_price(db, catalog_product.id, price_vat, feed_sub.market)
            except Exception:
                skipped_count += 1
                continue

        feed_sub.last_fetch_status = "success"
        feed_sub.last_fetch_message = f"Importováno: {imported_count}, aktualizováno: {updated_count}, přeskočeno: {skipped_count}"
        feed_sub.last_imported_count = imported_count
        feed_sub.last_updated_count = updated_count

    except Exception as e:
        feed_sub.last_fetch_status = "error"
        feed_sub.last_fetch_message = str(e)[:490]

    feed_sub.last_fetched_at = datetime.now(timezone.utc)
    db.commit()


# ---------------------------------------------------------------------------
# Endpointy: Katalog produktů
# ---------------------------------------------------------------------------

def _enrich_catalog_product(cp: CatalogProduct, db: Session) -> dict:
    """Obohaď katalogový produkt o price_vat a linked watched product info."""
    from app.models import Product as WatchedProduct

    # Vypočítej cenu s DPH
    price_vat = None
    if cp.price_without_vat is not None and cp.vat_rate is not None:
        price_vat = cp.price_without_vat * (1 + cp.vat_rate / 100)
    elif cp.price_without_vat is not None:
        price_vat = cp.price_without_vat

    # Najdi linked watched product
    watched = db.query(WatchedProduct).filter(
        WatchedProduct.catalog_product_id == cp.id
    ).first()

    competitor_urls = None
    watched_product_id = None
    if watched:
        watched_product_id = watched.id
        raw_urls = watched.competitor_urls or []
        competitor_urls = [
            {"url": u.get("url", ""), "name": u.get("name", ""), "market": u.get("market", "CZ")}
            for u in raw_urls if u.get("url")
        ]

    return {
        "id": cp.id,
        "name": cp.name,
        "ean": cp.ean,
        "category": cp.category,
        "manufacturer": cp.manufacturer,
        "price_without_vat": cp.price_without_vat,
        "price_vat": price_vat,
        "purchase_price": cp.purchase_price,
        "vat_rate": cp.vat_rate,
        "quantity_in_stock": cp.quantity_in_stock,
        "unit_of_measure": cp.unit_of_measure,
        "market": cp.market,
        "thumbnail_url": cp.thumbnail_url,
        "url_reference": cp.url_reference,
        "imported_from": cp.imported_from,
        "is_active": cp.is_active,
        "watched_product_id": watched_product_id,
        "competitor_urls": competitor_urls,
        "created_at": cp.created_at,
        "imported_at": cp.imported_at,
    }


@router.get("/products", response_model=list[CatalogProductResponse])
def get_catalog_products(
    db: Session = Depends(get_db),
    category: str = None,
    manufacturer: str = None,
    market: str = Query(None, description="CZ, SK, nebo null pro všechny"),
    search: str = None,
    in_stock: bool = Query(None, description="True = pouze skladem"),
    min_price: float = Query(None, description="Minimální cena s DPH"),
    max_price: float = Query(None, description="Maximální cena s DPH"),
    skip: int = 0,
    limit: int = 2000,
):
    """Získej produkty z katalogu s filtrem a obohacenými daty"""
    query = db.query(CatalogProduct)

    if market:
        query = query.filter(CatalogProduct.market == market)

    if category:
        query = query.filter(CatalogProduct.category == category)

    if manufacturer:
        query = query.filter(CatalogProduct.manufacturer == manufacturer)

    if search:
        query = query.filter(
            CatalogProduct.name.ilike(f"%{search}%") |
            CatalogProduct.ean.ilike(f"%{search}%") |
            CatalogProduct.category.ilike(f"%{search}%") |
            CatalogProduct.manufacturer.ilike(f"%{search}%")
        )

    if in_stock is True:
        query = query.filter(CatalogProduct.quantity_in_stock > 0)

    # Price filter: compare against price_without_vat * (1 + vat_rate/100)
    # Use price_without_vat as a proxy since price_vat is computed
    if min_price is not None:
        query = query.filter(
            CatalogProduct.price_without_vat * (1 + CatalogProduct.vat_rate / 100) >= min_price
        )
    if max_price is not None:
        query = query.filter(
            CatalogProduct.price_without_vat * (1 + CatalogProduct.vat_rate / 100) <= max_price
        )

    products = query.order_by(CatalogProduct.name).offset(skip).limit(limit).all()
    return [CatalogProductResponse(**_enrich_catalog_product(p, db)) for p in products]


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """Získej seznam všech kategorií v katalogu"""
    categories = db.query(CatalogProduct.category).distinct().filter(
        CatalogProduct.category.isnot(None)
    ).all()
    return [cat[0] for cat in categories]


@router.get("/manufacturers")
def get_manufacturers(db: Session = Depends(get_db)):
    """Získej seznam všech výrobců v katalogu"""
    manufacturers = db.query(CatalogProduct.manufacturer).distinct().filter(
        CatalogProduct.manufacturer.isnot(None)
    ).all()
    return sorted([m[0] for m in manufacturers if m[0]])


@router.post("/import")
def import_catalog_from_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Importuj produkty z Excel souboru do katalogu"""
    try:
        contents = file.file.read()
        wb = openpyxl.load_workbook(BytesIO(contents))
        ws = wb.active

        company = _get_company(db)

        imported_count = 0
        skipped_count = 0
        errors = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), 2):
            try:
                code = row[0].value if row[0] else None
                ean = str(row[1].value).strip() if row[1] and row[1].value else None
                isbn = str(row[2].value).strip() if row[2] and row[2].value else None
                manufacturer = str(row[3].value).strip() if row[3] and row[3].value else None
                category = str(row[4].value).strip() if row[4] and row[4].value else None
                name = str(row[6].value).strip() if row[6] and row[6].value else None
                is_active_str = str(row[7].value).strip() if row[7] and row[7].value else "Ano"

                if not name:
                    skipped_count += 1
                    continue

                vat_rate = row[8].value if row[8] else None
                price_without_vat = row[9].value if row[9] else None
                purchase_price = row[10].value if row[10] else None
                quantity_in_stock = row[11].value if row[11] else None
                unit_of_measure = str(row[12].value).strip() if row[12] and row[12].value else "ks"

                is_active = is_active_str.lower() in ["ano", "yes", "true", "1", "y"]

                existing = db.query(CatalogProduct).filter_by(ean=ean, company_id=company.id).first() if ean else None
                if existing and ean:
                    existing.name = name
                    existing.category = category
                    existing.manufacturer = manufacturer
                    existing.vat_rate = Decimal(str(vat_rate)) if vat_rate else None
                    existing.price_without_vat = Decimal(str(price_without_vat)) if price_without_vat else None
                    existing.purchase_price = Decimal(str(purchase_price)) if purchase_price else None
                    existing.quantity_in_stock = int(quantity_in_stock) if quantity_in_stock else None
                    existing.unit_of_measure = unit_of_measure
                    existing.is_active = is_active
                    db.commit()
                else:
                    catalog_product = CatalogProduct(
                        company_id=company.id,
                        ean=ean,
                        isbn=isbn,
                        name=name,
                        category=category,
                        manufacturer=manufacturer,
                        vat_rate=Decimal(str(vat_rate)) if vat_rate else None,
                        price_without_vat=Decimal(str(price_without_vat)) if price_without_vat else None,
                        purchase_price=Decimal(str(purchase_price)) if purchase_price else None,
                        quantity_in_stock=int(quantity_in_stock) if quantity_in_stock else None,
                        unit_of_measure=unit_of_measure,
                        is_active=is_active,
                        catalog_identifier=f"{company.id}_{ean}" if ean else None
                    )
                    db.add(catalog_product)
                    db.commit()

                imported_count += 1

            except Exception as e:
                skipped_count += 1
                errors.append(f"Řádek {row_idx}: {str(e)}")
                continue

        return {
            "status": "success",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": errors[:10]
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import-heureka")
async def import_catalog_from_heureka(
    file: UploadFile = File(...),
    market: str = Query("CZ", description="CZ nebo SK"),
    merge_existing: bool = Query(False, description="Sloučit s existujícími produkty"),
    db: Session = Depends(get_db)
):
    """
    Importuj produkty z Heureka XML feedu do katalogu.
    Slučuje podle EAN nebo PRODUCTNO.
    """
    if market not in ["CZ", "SK"]:
        raise HTTPException(status_code=400, detail="Market musí být 'CZ' nebo 'SK'")

    try:
        contents = await file.read()
        xml_string = contents.decode('utf-8')

        parser = HeureaFeedParser()
        products, errors = parser.parse_string(xml_string, market=market)

        if not products and errors:
            detail = "; ".join(str(e.get('errors', e)) for e in errors[:3])
            raise HTTPException(status_code=400, detail=f"Chyba při parsování XML: {detail}")

        company = _get_company(db)

        imported_count = 0
        skipped_count = 0
        updated_count = 0

        for product_data in products:
            try:
                ean = product_data.get('ean')
                product_code = product_data.get('product_code')
                name = product_data.get('name')
                price_vat = product_data.get('price_vat')  # Selling price with VAT

                existing = _find_existing_product(db, ean, product_code, market, company.id)

                if existing and merge_existing:
                    existing.name = name
                    existing.category = product_data.get('category')
                    existing.manufacturer = product_data.get('manufacturer')
                    existing.description = product_data.get('description')
                    existing.price_without_vat = product_data.get('price_without_vat')
                    existing.vat_rate = product_data.get('vat_rate')
                    existing.quantity_in_stock = product_data.get('quantity_in_stock')
                    existing.unit_of_measure = product_data.get('unit_of_measure', 'ks')
                    existing.thumbnail_url = product_data.get('thumbnail_url')
                    existing.url_reference = product_data.get('url_reference')
                    existing.imported_from = product_data.get('imported_from')
                    # Přidej product_code, pokud ještě není
                    if product_code and not existing.product_code:
                        existing.product_code = product_code
                    db.commit()
                    updated_count += 1
                    _sync_tracked_price(db, existing.id, price_vat, market)
                elif existing and not merge_existing:
                    skipped_count += 1
                else:
                    catalog_product = CatalogProduct(
                        company_id=company.id,
                        ean=ean,
                        product_code=product_code,
                        name=name,
                        category=product_data.get('category'),
                        manufacturer=product_data.get('manufacturer'),
                        description=product_data.get('description'),
                        price_without_vat=product_data.get('price_without_vat'),
                        vat_rate=product_data.get('vat_rate'),
                        quantity_in_stock=product_data.get('quantity_in_stock'),
                        unit_of_measure=product_data.get('unit_of_measure', 'ks'),
                        market=market,
                        thumbnail_url=product_data.get('thumbnail_url'),
                        url_reference=product_data.get('url_reference'),
                        imported_from=product_data.get('imported_from'),
                        is_active=True,
                        catalog_identifier=f"{company.id}_{ean}_{market}" if ean else None
                    )
                    db.add(catalog_product)
                    db.commit()
                    imported_count += 1
                    _sync_tracked_price(db, catalog_product.id, price_vat, market)

            except Exception:
                skipped_count += 1
                continue

        return {
            "status": "success",
            "imported": imported_count,
            "updated": updated_count,
            "skipped": skipped_count,
            "errors": errors[:10] if errors else []
        }

    except HeurekaParsError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Chyba při importu: {str(e)}")


@router.post("/import-url")
async def import_product_from_url(
    payload: ImportUrlRequest,
    db: Session = Depends(get_db)
):
    """
    Importuj produkt ze zadané URL adresy.
    Typ "own" přidá produkt do katalogu.
    Typ "competitor" přidá konkurenční produkt ke sledování.
    """
    url = payload.url.strip()
    market = payload.market if payload.market in ["CZ", "SK"] else "CZ"

    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL musí začínat http:// nebo https://")

    company = _get_company(db)

    # Pokus o načtení titulku stránky
    fetched_name = payload.name
    if not fetched_name:
        try:
            async with aiohttp.ClientSession() as session:
                headers = {"User-Agent": "Mozilla/5.0 (compatible; PricingBot/1.0)"}
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=15), headers=headers) as resp:
                    if resp.status == 200:
                        html = await resp.text(errors='ignore')
                        # Extrahuj titulek
                        match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
                        if match:
                            fetched_name = match.group(1).strip()
                            # Zkrať titulek na 200 znaků
                            fetched_name = fetched_name[:200]
        except Exception:
            pass

    if not fetched_name:
        # Použij doménu jako fallback
        domain_match = re.search(r'https?://(?:www\.)?([^/]+)', url)
        fetched_name = domain_match.group(1) if domain_match else "Nový produkt"

    if payload.product_type == "competitor":
        # Přidej konkurenční produkt – vytvoř nebo najdi Competitor záznam
        from app.models import Competitor
        # Použij doménu jako URL konkurenta
        domain_match = re.search(r'(https?://(?:www\.)?[^/]+)', url)
        competitor_base_url = domain_match.group(1) if domain_match else url

        existing_comp = db.query(Competitor).filter(
            Competitor.url == competitor_base_url,
            Competitor.market == market,
            Competitor.company_id == company.id
        ).first()

        if not existing_comp:
            domain_name = re.sub(r'https?://(?:www\.)?', '', competitor_base_url)
            competitor = Competitor(
                company_id=company.id,
                name=domain_name,
                url=competitor_base_url,
                market=market,
                is_active=True,
                scrape_data={"tracked_urls": [url]}
            )
            db.add(competitor)
            db.commit()
            db.refresh(competitor)
            return {
                "status": "success",
                "type": "competitor",
                "message": f"Konkurent '{domain_name}' byl přidán ke sledování",
                "name": domain_name,
                "url": competitor_base_url,
                "product_url": url
            }
        else:
            # Přidej URL do existujícího scrape_data
            tracked = existing_comp.scrape_data.get("tracked_urls", []) if existing_comp.scrape_data else []
            if url not in tracked:
                tracked.append(url)
                existing_comp.scrape_data = {**(existing_comp.scrape_data or {}), "tracked_urls": tracked}
                db.commit()
            return {
                "status": "success",
                "type": "competitor",
                "message": f"URL přidána ke sledování u konkurenta '{existing_comp.name}'",
                "name": existing_comp.name,
                "url": competitor_base_url,
                "product_url": url
            }

    else:
        # Vlastní produkt – přidej do katalogu
        existing = db.query(CatalogProduct).filter(
            CatalogProduct.url_reference == url,
            CatalogProduct.company_id == company.id
        ).first()

        if existing:
            return {
                "status": "skipped",
                "type": "own",
                "message": f"Produkt s touto URL již existuje: {existing.name}",
                "id": str(existing.id),
                "name": existing.name
            }

        catalog_product = CatalogProduct(
            company_id=company.id,
            name=fetched_name,
            market=market,
            url_reference=url,
            imported_from="url",
            is_active=True
        )
        db.add(catalog_product)
        db.commit()
        db.refresh(catalog_product)

        return {
            "status": "success",
            "type": "own",
            "message": f"Produkt '{fetched_name}' byl přidán do katalogu",
            "id": str(catalog_product.id),
            "name": fetched_name,
            "url": url
        }


# ---------------------------------------------------------------------------
# Endpointy: Feed Subscriptions (pravidelné XML feedy)
# ---------------------------------------------------------------------------

@router.get("/feeds")
def get_feed_subscriptions(db: Session = Depends(get_db)):
    """Vrať seznam všech feed subscriptions"""
    company = _get_company(db)
    feeds = db.query(FeedSubscription).filter(
        FeedSubscription.company_id == company.id
    ).order_by(FeedSubscription.created_at.desc()).all()
    return feeds


@router.post("/feeds")
def create_feed_subscription(
    payload: FeedSubscriptionCreate,
    db: Session = Depends(get_db)
):
    """Přidej nový XML feed ke sledování"""
    company = _get_company(db)

    if payload.market not in ["CZ", "SK"]:
        raise HTTPException(status_code=400, detail="Market musí být 'CZ' nebo 'SK'")

    # Zkontroluj duplicitu URL
    existing = db.query(FeedSubscription).filter(
        FeedSubscription.feed_url == payload.feed_url,
        FeedSubscription.company_id == company.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tento feed je již přidán")

    feed = FeedSubscription(
        company_id=company.id,
        name=payload.name,
        feed_url=payload.feed_url,
        market=payload.market,
        merge_existing=payload.merge_existing,
        is_active=True
    )
    db.add(feed)
    db.commit()
    db.refresh(feed)
    return feed


@router.put("/feeds/{feed_id}")
def update_feed_subscription(
    feed_id: UUID,
    payload: FeedSubscriptionUpdate,
    db: Session = Depends(get_db)
):
    """Uprav feed subscription"""
    company = _get_company(db)
    feed = db.query(FeedSubscription).filter(
        FeedSubscription.id == feed_id,
        FeedSubscription.company_id == company.id
    ).first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed nenalezen")

    if payload.name is not None:
        feed.name = payload.name
    if payload.feed_url is not None:
        feed.feed_url = payload.feed_url
    if payload.market is not None:
        feed.market = payload.market
    if payload.merge_existing is not None:
        feed.merge_existing = payload.merge_existing
    if payload.is_active is not None:
        feed.is_active = payload.is_active

    db.commit()
    db.refresh(feed)
    return feed


@router.delete("/feeds/{feed_id}")
def delete_feed_subscription(
    feed_id: UUID,
    db: Session = Depends(get_db)
):
    """Smaž feed subscription"""
    company = _get_company(db)
    feed = db.query(FeedSubscription).filter(
        FeedSubscription.id == feed_id,
        FeedSubscription.company_id == company.id
    ).first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed nenalezen")

    db.delete(feed)
    db.commit()
    return {"message": "Feed byl smazán"}


@router.post("/feeds/{feed_id}/fetch")
async def trigger_feed_fetch(
    feed_id: UUID,
    db: Session = Depends(get_db)
):
    """Ručně spusť načtení feedu"""
    company = _get_company(db)
    feed = db.query(FeedSubscription).filter(
        FeedSubscription.id == feed_id,
        FeedSubscription.company_id == company.id
    ).first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed nenalezen")

    await _fetch_and_import_feed(feed, db)

    return {
        "status": feed.last_fetch_status,
        "message": feed.last_fetch_message,
        "imported": feed.last_imported_count,
        "updated": feed.last_updated_count,
        "fetched_at": feed.last_fetched_at
    }
