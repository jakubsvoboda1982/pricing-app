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


def _sync_tracked_price(db: Session, catalog_product_id, price_vat, market: str,
                        stock: int = None, thumbnail_url: str = None):
    """
    If any tracked Product is linked to this catalog_product_id,
    update (or create) its Price record with the VAT-inclusive selling price.
    Also syncs stock_quantity and thumbnail_url if provided.
    """
    if price_vat is None and stock is None:
        return
    from app.models import Product, Price
    from sqlalchemy import desc
    tracked = db.query(Product).filter(
        Product.catalog_product_id == catalog_product_id
    ).all()
    for product in tracked:
        # Sync price
        if price_vat is not None:
            latest = db.query(Price).filter(
                Price.product_id == product.id,
                Price.market == market,
            ).order_by(desc(Price.changed_at)).first()
            if latest:
                if latest.current_price != price_vat:
                    latest.old_price = latest.current_price
                    latest.current_price = price_vat
            else:
                db.add(Price(
                    product_id=product.id,
                    market=market,
                    currency='CZK' if market == 'CZ' else 'EUR',
                    current_price=price_vat,
                ))
        # Sync stock
        if stock is not None:
            product.stock_quantity = stock
        # Sync thumbnail if not already set
        if thumbnail_url and not product.thumbnail_url:
            product.thumbnail_url = thumbnail_url
        db.commit()


def _sync_canonical_to_watched(
    db: Session,
    catalog_product_id,
    canonical_attrs: dict,
    target_weight_g,
    must_have: list,
    should_have: list,
    must_not_have: list,
) -> None:
    """
    Propaguje canonical matching profil z katalogu na linked Product záznamy.
    Přepisuje pouze pokud Product ještě nemá vlastní (ručně upravený) profil.
    """
    if not canonical_attrs:
        return
    try:
        from app.models import Product
        tracked = db.query(Product).filter(
            Product.catalog_product_id == catalog_product_id
        ).all()
        for product in tracked:
            # Přepiš pouze pokud je profil prázdný (nebyl upraven ručně)
            existing_attrs = product.canonical_attributes_json or {}
            if not existing_attrs.get("ingredient"):
                product.canonical_attributes_json = canonical_attrs
                product.must_have_terms_json = must_have
                product.should_have_terms_json = should_have
                product.must_not_have_terms_json = must_not_have
            # Gramáž vždy aktualizujeme z feedu (pokud ještě není nastavena)
            if not product.target_weight_g and target_weight_g:
                product.target_weight_g = target_weight_g
        if tracked:
            db.commit()
    except Exception:
        pass  # Best-effort


def _sync_products_from_feed(
    db: Session,
    tracked_products,
    name: Optional[str],
    price_vat,
    market: str,
    stock: int = None,
    thumbnail_url: str = None,
    url_reference: str = None,
) -> None:
    """
    Sdílená logika synchronizace sledovaných produktů z feedu.
    Aktualizuje: cenu, sklad, název pro trh, thumbnail, own_market_url.
    """
    from app.models import Price
    from sqlalchemy import desc
    currency = 'CZK' if market == 'CZ' else ('EUR' if market == 'SK' else 'HUF')

    for product in tracked_products:
        changed = False
        # Název pro daný trh
        if name:
            names = dict(product.market_names_json or {})
            if names.get(market) != name:
                names[market] = name
                product.market_names_json = names
                changed = True
        # Cena
        if price_vat is not None:
            latest = db.query(Price).filter(
                Price.product_id == product.id,
                Price.market == market,
            ).order_by(desc(Price.changed_at)).first()
            if latest:
                if latest.current_price != price_vat:
                    latest.old_price = latest.current_price
                    latest.current_price = price_vat
                    latest.currency = currency
                    changed = True
            else:
                db.add(Price(
                    product_id=product.id,
                    market=market,
                    currency=currency,
                    current_price=price_vat,
                ))
                changed = True
        # Sklad
        if stock is not None and product.stock_quantity != stock:
            product.stock_quantity = stock
            changed = True
        # Thumbnail (jen pokud chybí)
        if thumbnail_url and not product.thumbnail_url:
            product.thumbnail_url = thumbnail_url
            changed = True
        # Vlastní URL trhu (jen pokud chybí)
        if url_reference:
            own_urls = dict(product.own_market_urls_json or {})
            if not own_urls.get(market):
                own_urls[market] = url_reference
                product.own_market_urls_json = own_urls
                changed = True
        if changed:
            try:
                db.commit()
            except Exception:
                db.rollback()


def _sync_by_ean(db: Session, ean: Optional[str], name: Optional[str], price_vat, market: str,
                 company_id, stock: int = None, thumbnail_url: str = None,
                 url_reference: str = None) -> None:
    """
    Pro produkty sledované s daným EAN: synchronizuj cenu, sklad, název, thumbnail a vlastní URL.
    """
    if not ean:
        return
    try:
        from app.models import Product
        tracked = db.query(Product).filter(
            Product.ean == ean,
            Product.company_id == company_id,
        ).all()
        if tracked:
            _sync_products_from_feed(db, tracked, name, price_vat, market, stock, thumbnail_url, url_reference)
    except Exception:
        pass  # Best-effort


def _sync_by_sku(db: Session, product_code: Optional[str], name: Optional[str], price_vat, market: str,
                 company_id, stock: int = None, thumbnail_url: str = None,
                 url_reference: str = None) -> None:
    """
    Pro produkty sledované s daným SKU (PRODUCTNO): synchronizuj cenu, sklad, název.
    Fallback pro produkty bez EAN nebo s jiným EAN v DB.
    """
    if not product_code:
        return
    try:
        from app.models import Product
        tracked = db.query(Product).filter(
            Product.sku == product_code,
            Product.company_id == company_id,
        ).all()
        if tracked:
            _sync_products_from_feed(db, tracked, name, price_vat, market, stock, thumbnail_url, url_reference)
    except Exception:
        pass  # Best-effort


def _ensure_tracked_product(
    db, catalog_product_id, company_id, name, ean, product_code, market,
    price_vat=None, stock=None, thumbnail_url=None, url_reference=None,
    canonical_attrs=None, target_weight_g=None,
    must_have=None, should_have=None, must_not_have=None,
) -> None:
    """
    Zajistí, že pro daný CatalogProduct existuje sledovaný Product.
    Pokud neexistuje (ani dle catalog_product_id, EAN ani SKU), vytvoří nový.
    Pokud existuje, pouze propojí s katalogem (catalog_product_id) pokud ještě není.
    Voláno při každém importu feedu — idempotentní.
    """
    from app.models import Product, Price
    currency = 'CZK' if market == 'CZ' else ('EUR' if market == 'SK' else 'HUF')

    try:
        # Hledej existující sledovaný produkt (3 fallbacky)
        existing = None
        if catalog_product_id:
            existing = db.query(Product).filter(
                Product.catalog_product_id == catalog_product_id,
                Product.company_id == company_id,
            ).first()
        if not existing and ean:
            existing = db.query(Product).filter(
                Product.ean == ean,
                Product.company_id == company_id,
            ).first()
        if not existing and product_code:
            existing = db.query(Product).filter(
                Product.sku == product_code,
                Product.company_id == company_id,
            ).first()

        if existing:
            # Propoj s katalogem, pokud ještě není
            changed = False
            if not existing.catalog_product_id and catalog_product_id:
                existing.catalog_product_id = catalog_product_id
                changed = True
            if thumbnail_url and not existing.thumbnail_url:
                existing.thumbnail_url = thumbnail_url
                changed = True
            if changed:
                try:
                    db.commit()
                except Exception:
                    db.rollback()
            return

        # Produkkt ještě neexistuje — vytvoříme nový sledovaný produkt
        sku = (product_code or ean or '').strip()
        if not sku or not name:
            return  # Nelze vytvořit bez identifikátoru a názvu

        tracked = Product(
            company_id=company_id,
            name=name,
            sku=sku,
            product_code=product_code,
            ean=ean,
            catalog_product_id=catalog_product_id,
            thumbnail_url=thumbnail_url,
            url_reference=url_reference,
            stock_quantity=stock,
            canonical_attributes_json=canonical_attrs or {},
            target_weight_g=target_weight_g,
            must_have_terms_json=must_have or [],
            should_have_terms_json=should_have or [],
            must_not_have_terms_json=must_not_have or [],
            own_market_urls_json={market: url_reference} if url_reference else {},
        )
        db.add(tracked)
        db.flush()  # získej ID bez commitu

        if price_vat is not None:
            db.add(Price(
                product_id=tracked.id,
                market=market,
                currency=currency,
                current_price=price_vat,
            ))

        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def _find_existing_product(db: Session, ean: Optional[str], product_code: Optional[str], market: str, company_id) -> Optional[CatalogProduct]:
    """
    Najdi existující CatalogProduct.
    Priorita: product_code (specifičtější) → EAN (fallback).
    Pokud matchujeme přes EAN ale product_code se liší, nepovažujeme za shodu —
    jinak by dvě různé položky sdílející stejný EAN přepisovaly ten samý záznam.
    """
    # 1. Primárně hledej přes product_code (PRODUCTNO) — nejpřesnější
    if product_code:
        existing = db.query(CatalogProduct).filter(
            CatalogProduct.product_code == product_code,
            CatalogProduct.market == market,
            CatalogProduct.company_id == company_id
        ).first()
        if existing:
            return existing

    # 2. Fallback přes EAN
    if ean:
        existing = db.query(CatalogProduct).filter(
            CatalogProduct.ean == ean,
            CatalogProduct.market == market,
            CatalogProduct.company_id == company_id
        ).first()
        if existing:
            # Pokud oba záznamy mají odlišný product_code, jde o JINÉ produkty
            # se shodným EAN (chyba v datech feedu) — nevracej shodu
            if product_code and existing.product_code and existing.product_code != product_code:
                return None
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
            async with session.get(
                feed_sub.feed_url,
                timeout=aiohttp.ClientTimeout(total=120),  # 120 s pro velké feedy
            ) as resp:
                if resp.status != 200:
                    raise Exception(f"HTTP {resp.status}")
                # Čteme jako bytes a předáme přímo ET — správně zpracuje encoding z XML deklarace
                xml_bytes = await resp.read()

        # Předáme bytes parseru; ET.fromstring(bytes) přečte encoding z XML deklarace
        parser = HeureaFeedParser()
        products, parse_errors = parser.parse_string(xml_bytes, market=feed_sub.market)

        imported_count = 0
        updated_count = 0
        skipped_count = 0
        parse_error_count = len(parse_errors)

        for product_data in products:
            try:
                ean = product_data.get('ean')
                product_code = product_data.get('product_code')
                name = product_data.get('name')
                price_vat = product_data.get('price_vat')  # Selling price with VAT

                existing = _find_existing_product(db, ean, product_code, feed_sub.market, company.id)

                # Canonical profil z normalizéru (přišel z heureka_parser)
                canonical_attrs = product_data.get('canonical_attributes', {})
                target_weight_g = product_data.get('target_weight_g')

                # Extra pole z feedu pro synchronizaci sledovaných produktů
                _stock = product_data.get('quantity_in_stock')
                _thumbnail = product_data.get('thumbnail_url')
                _url_ref = product_data.get('url_reference')

                _cat_id = None  # ID catalog_productu pro tento průchod
                _must_have = product_data.get('must_have_terms', [])
                _should_have = product_data.get('should_have_terms', [])
                _must_not_have = product_data.get('must_not_have_terms', [])

                if existing and feed_sub.merge_existing:
                    existing.name = name
                    existing.category = product_data.get('category')
                    existing.manufacturer = product_data.get('manufacturer')
                    existing.description = product_data.get('description')
                    existing.price_without_vat = product_data.get('price_without_vat')
                    existing.vat_rate = product_data.get('vat_rate')
                    existing.quantity_in_stock = _stock
                    existing.unit_of_measure = product_data.get('unit_of_measure', 'ks')
                    existing.thumbnail_url = _thumbnail
                    existing.url_reference = _url_ref
                    existing.imported_from = product_data.get('imported_from')
                    if product_code and not existing.product_code:
                        existing.product_code = product_code
                    db.commit()
                    updated_count += 1
                    _cat_id = existing.id
                    _sync_tracked_price(db, existing.id, price_vat, feed_sub.market, stock=_stock, thumbnail_url=_thumbnail)
                    # Propaguj canonical profil na linked Products
                    _sync_canonical_to_watched(
                        db, existing.id, canonical_attrs, target_weight_g,
                        _must_have, _should_have, _must_not_have,
                    )
                elif existing and not feed_sub.merge_existing:
                    skipped_count += 1
                    _cat_id = existing.id  # i pro skip chceme zajistit tracked product
                else:
                    new_cat = CatalogProduct(
                        company_id=company.id,
                        ean=ean,
                        product_code=product_code,
                        name=name,
                        category=product_data.get('category'),
                        manufacturer=product_data.get('manufacturer'),
                        description=product_data.get('description'),
                        price_without_vat=product_data.get('price_without_vat'),
                        vat_rate=product_data.get('vat_rate'),
                        quantity_in_stock=_stock,
                        unit_of_measure=product_data.get('unit_of_measure', 'ks'),
                        market=feed_sub.market,
                        thumbnail_url=_thumbnail,
                        url_reference=_url_ref,
                        imported_from=product_data.get('imported_from'),
                        is_active=True,
                        catalog_identifier=f"{company.id}_{product_code}" if product_code else (f"{company.id}_{ean}_{feed_sub.market}" if ean else None)
                    )
                    db.add(new_cat)
                    db.commit()
                    imported_count += 1
                    _cat_id = new_cat.id
                    _sync_tracked_price(db, new_cat.id, price_vat, feed_sub.market, stock=_stock, thumbnail_url=_thumbnail)
                    _sync_canonical_to_watched(
                        db, new_cat.id, canonical_attrs, target_weight_g,
                        _must_have, _should_have, _must_not_have,
                    )

                # Synchronizuj název, cenu, sklad a URL pro sledované produkty
                # (EAN matching + SKU/PRODUCTNO matching jako záloha)
                _sync_by_ean(db, ean, name, price_vat, feed_sub.market, company.id, stock=_stock, thumbnail_url=_thumbnail, url_reference=_url_ref)
                _sync_by_sku(db, product_code, name, price_vat, feed_sub.market, company.id, stock=_stock, thumbnail_url=_thumbnail, url_reference=_url_ref)

                # Zajisti, že sledovaný Product existuje — vytvoří ho pokud neexistuje
                if _cat_id:
                    _ensure_tracked_product(
                        db, _cat_id, company.id, name, ean, product_code, feed_sub.market,
                        price_vat=price_vat, stock=_stock, thumbnail_url=_thumbnail,
                        url_reference=_url_ref, canonical_attrs=canonical_attrs,
                        target_weight_g=target_weight_g,
                        must_have=_must_have, should_have=_should_have, must_not_have=_must_not_have,
                    )
            except Exception:
                # DŮLEŽITÉ: rollback nutný před dalším použitím session
                # (bez rollback by SQLAlchemy odmítl další operace na broken transakci)
                try:
                    db.rollback()
                except Exception:
                    pass
                skipped_count += 1
                continue

        total_in_feed = imported_count + updated_count + skipped_count + parse_error_count
        msg_parts = [
            f"Importováno: {imported_count}",
            f"aktualizováno: {updated_count}",
            f"přeskočeno: {skipped_count}",
        ]
        if parse_error_count:
            msg_parts.append(f"chyby parsování: {parse_error_count}")
        feed_sub.last_fetch_status = "success"
        feed_sub.last_fetch_message = ", ".join(msg_parts)
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

def _build_price_vat(cp: CatalogProduct):
    if cp.price_without_vat is not None and cp.vat_rate is not None:
        return cp.price_without_vat * (1 + cp.vat_rate / 100)
    return cp.price_without_vat


def _serialize_catalog_product(cp: CatalogProduct, watched_map: dict) -> dict:
    """Serialize catalog product using pre-fetched watched_map — no extra DB queries."""
    watched_id, competitor_urls = watched_map.get(str(cp.id), (None, None))
    return {
        "id": cp.id,
        "name": cp.name,
        "ean": cp.ean,
        "category": cp.category,
        "manufacturer": cp.manufacturer,
        "price_without_vat": cp.price_without_vat,
        "price_vat": _build_price_vat(cp),
        "purchase_price": cp.purchase_price,
        "vat_rate": cp.vat_rate,
        "quantity_in_stock": cp.quantity_in_stock,
        "unit_of_measure": cp.unit_of_measure,
        "market": cp.market,
        "thumbnail_url": cp.thumbnail_url,
        "url_reference": cp.url_reference,
        "imported_from": cp.imported_from,
        "is_active": cp.is_active,
        "watched_product_id": watched_id,
        "competitor_urls": competitor_urls,
        "created_at": cp.created_at,
        "imported_at": cp.imported_at,
    }


def _enrich_catalog_product(cp: CatalogProduct, db: Session) -> dict:
    """Single-product enrich (used by non-list endpoints)."""
    from app.models import Product as WatchedProduct
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
    return _serialize_catalog_product.__wrapped__(cp) if False else {
        **_serialize_catalog_product(cp, {str(cp.id): (watched_product_id, competitor_urls)}),
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
    limit: int = Query(10000, description="Max výsledků (default=vše)"),
):
    """Získej produkty z katalogu s filtrem a obohacenými daty"""
    from app.models import Product as WatchedProduct
    from sqlalchemy import or_

    query = db.query(CatalogProduct)

    if market:
        query = query.filter(CatalogProduct.market == market)
    if category:
        query = query.filter(
            or_(
                CatalogProduct.category == category,
                CatalogProduct.category.ilike(f'% | {category}'),
            )
        )
    if manufacturer:
        query = query.filter(CatalogProduct.manufacturer == manufacturer)
    if search:
        query = query.filter(
            CatalogProduct.name.ilike(f"%{search}%") |
            CatalogProduct.ean.ilike(f"%{search}%") |
            CatalogProduct.product_code.ilike(f"%{search}%") |
            CatalogProduct.category.ilike(f"%{search}%") |
            CatalogProduct.manufacturer.ilike(f"%{search}%")
        )
    if in_stock is True:
        query = query.filter(CatalogProduct.quantity_in_stock > 0)
    if min_price is not None:
        query = query.filter(
            CatalogProduct.price_without_vat * (1 + CatalogProduct.vat_rate / 100) >= min_price
        )
    if max_price is not None:
        query = query.filter(
            CatalogProduct.price_without_vat * (1 + CatalogProduct.vat_rate / 100) <= max_price
        )

    products = query.order_by(CatalogProduct.name).offset(skip).limit(limit).all()

    if not products:
        return []

    # Batch query: match watched products via catalog_product_id OR EAN (fallback)
    catalog_ids = [p.id for p in products]
    catalog_eans = [p.ean for p in products if p.ean]

    # 1) Primární: propojení přes catalog_product_id
    watched_by_cat = db.query(
        WatchedProduct.catalog_product_id,
        WatchedProduct.id,
        WatchedProduct.competitor_urls,
    ).filter(WatchedProduct.catalog_product_id.in_(catalog_ids)).all()

    watched_map: dict = {}
    for row in watched_by_cat:
        raw_urls = row.competitor_urls or []
        competitor_urls = [
            {"url": u.get("url", ""), "name": u.get("name", ""), "market": u.get("market", "CZ")}
            for u in raw_urls if isinstance(u, dict) and u.get("url")
        ]
        watched_map[str(row.catalog_product_id)] = (row.id, competitor_urls)

    # 2) Fallback: propojení přes EAN (pro starší produkty bez catalog_product_id)
    if catalog_eans:
        watched_by_ean = db.query(
            WatchedProduct.ean,
            WatchedProduct.id,
            WatchedProduct.competitor_urls,
        ).filter(
            WatchedProduct.ean.in_(catalog_eans),
            WatchedProduct.catalog_product_id.is_(None),  # již zpracované přeskočíme
        ).all()

        ean_to_cat_id = {p.ean: str(p.id) for p in products if p.ean}
        for row in watched_by_ean:
            cat_id = ean_to_cat_id.get(row.ean)
            if cat_id and cat_id not in watched_map:
                raw_urls = row.competitor_urls or []
                competitor_urls = [
                    {"url": u.get("url", ""), "name": u.get("name", ""), "market": u.get("market", "CZ")}
                    for u in raw_urls if isinstance(u, dict) and u.get("url")
                ]
                watched_map[cat_id] = (row.id, competitor_urls)

    return [CatalogProductResponse(**_serialize_catalog_product(p, watched_map)) for p in products]


@router.get("/categories")
def get_categories(market: str = None, db: Session = Depends(get_db)):
    """
    Získej seznam unikátních kategorií v katalogu.
    Pro hierarchické kategorie Heureka CZ (formát "A | B | C") vrací
    poslední segment — takže CZ i SK nabídnou srovnatelný počet filtrů.
    """
    q = db.query(CatalogProduct.category).distinct().filter(
        CatalogProduct.category.isnot(None)
    )
    if market and market != 'ALL':
        q = q.filter(CatalogProduct.market == market)
    rows = q.all()

    # Extrahuj poslední segment z hierarchické kategorie ("A | B | C" → "C")
    segments: set[str] = set()
    for (cat,) in rows:
        if cat:
            segment = cat.split('|')[-1].strip()
            if segment:
                segments.add(segment)

    return sorted(segments)


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
