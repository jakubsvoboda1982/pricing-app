from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from collections import defaultdict
from app.database import get_db
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse, PriceResponse, PriceCreate, CompetitorUrlItem
from app.models import Product, Price, CatalogProduct, Company
from app.middleware.auth import verify_token
from uuid import UUID
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from datetime import datetime, timedelta
import re

router = APIRouter(prefix="/api/products", tags=["products"])


class CompetitorUrlAdd(BaseModel):
    url: str
    name: Optional[str] = None
    market: str = "CZ"


class PricingUpdate(BaseModel):
    purchase_price_without_vat: Optional[Decimal] = None  # Nákupní cena bez DPH
    purchase_vat_rate: Optional[Decimal] = None           # Sazba DPH (default 12 pro CZ)
    manufacturing_cost: Optional[Decimal] = None          # Výrobní cena
    min_price: Optional[Decimal] = None
    clear_purchase_price: bool = False    # True = smaž nákupní cenu
    clear_manufacturing_cost: bool = False  # True = smaž výrobní cenu


class BulkLinkCatalogRequest(BaseModel):
    product_ids: Optional[list[str]] = None  # None = všechny nepropojené
    force: bool = False                       # True = přepiš i existující propojení


def _get_domain_name(url: str) -> str:
    match = re.search(r'https?://(?:www\.)?([^/]+)', url)
    return match.group(1) if match else url


def _lower_cost_with_vat(
    purchase_price_without_vat: Optional[Decimal],
    manufacturing_cost: Optional[Decimal],
    vat_rate: Decimal,
) -> Optional[Decimal]:
    """Vrátí nižší z nákupní/výrobní ceny s DPH (pokud není 0 nebo None)."""
    candidates = []
    for cost in [purchase_price_without_vat, manufacturing_cost]:
        if cost is not None and cost > 0:
            candidates.append(cost * (1 + vat_rate / Decimal('100')))
    if not candidates:
        return None
    return min(candidates)


def _compute_hero_score(
    current_price: Optional[Decimal],
    cost_with_vat: Optional[Decimal],   # nižší z nákupní/výrobní (s DPH)
    min_price: Optional[Decimal],
    competitor_urls: Optional[list],
) -> int:
    """
    Hero Score (0–100) — měří připravenost produktu na optimální cenotvorbu.

    Složení:
      25  Aktuální cena nastavena
      15  Nákupní/výrobní cena nastavena
      35  Kvalita marže (0 / 5 / 10 / 18 / 28 / 35)
      10  Minimální cena nastavena
      15  Sleduje alespoň 1 URL konkurenta
    """
    score = 0

    if current_price is not None:
        score += 25

    if cost_with_vat is not None:
        score += 15
        # Marže = (prodejní - nižší_cena_s_DPH) / prodejní * 100
        if current_price and current_price > 0:
            margin_pct = (current_price - cost_with_vat) / current_price * 100
            if margin_pct >= 30:
                score += 35
            elif margin_pct >= 20:
                score += 28
            elif margin_pct >= 10:
                score += 18
            elif margin_pct >= 5:
                score += 10
            elif margin_pct > 0:
                score += 5

    if min_price is not None:
        score += 10

    if competitor_urls and len(competitor_urls) >= 1:
        score += 15

    return min(score, 100)


def _enrich_with_price(
    product: Product,
    db: Session,
    *,
    _price=None,       # pre-loaded Price (batch optimisation)
    _comp_prices=None, # pre-loaded list[CompetitorProductPrice]
    _cat=None,         # pre-loaded CatalogProduct
) -> dict:
    """
    Přidej poslední cenu, marži a hero score k produktu.
    Pokud jsou předány _price/_comp_prices/_cat, přeskočí DB dotazy
    (využívá se z list_products pro batch loading).
    """
    from app.models import CompetitorProductPrice

    # ── Price ──────────────────────────────────────────────────────────────
    if _price is None:
        _price = (
            db.query(Price)
            .filter(Price.product_id == product.id)
            .order_by(desc(Price.changed_at))
            .first()
        )
    price = _price

    current_price = price.current_price if price else None
    purchase_price_without_vat = getattr(product, 'purchase_price_without_vat', None)
    manufacturing_cost = getattr(product, 'manufacturing_cost', None)
    purchase_vat_rate = getattr(product, 'purchase_vat_rate', None) or Decimal('12.00')
    min_price = getattr(product, 'min_price', None)
    competitor_urls = product.competitor_urls or []

    # Nižší z nákupní/výrobní ceny s DPH — základ pro marži
    cost_with_vat = _lower_cost_with_vat(purchase_price_without_vat, manufacturing_cost, purchase_vat_rate)

    purchase_price_with_vat = None
    if purchase_price_without_vat and purchase_price_without_vat > 0:
        purchase_price_with_vat = round(
            purchase_price_without_vat * (1 + purchase_vat_rate / Decimal('100')), 2
        )

    manufacturing_cost_with_vat = None
    if manufacturing_cost and manufacturing_cost > 0:
        manufacturing_cost_with_vat = round(
            manufacturing_cost * (1 + purchase_vat_rate / Decimal('100')), 2
        )

    # ── Kurzy pro přepočet nákupní ceny do měny daného trhu ──────────────────
    # Nákupní/výrobní cena je vždy v CZK. Pro SK/HU produkty přepočítáme dle kurzu.
    EXCHANGE_CZK = {'CZK': Decimal('1'), 'EUR': Decimal('24.5'), 'HUF': Decimal('0.0655')}
    price_market = price.market if price else 'CZ'
    price_currency = price.currency if price else 'CZK'
    # Přepočet cost_with_vat do měny produktového trhu (pro správnou marži)
    cost_with_vat_in_market = None
    if cost_with_vat is not None and price_currency != 'CZK':
        rate = EXCHANGE_CZK.get(price_currency, Decimal('1'))
        cost_with_vat_in_market = round(cost_with_vat / rate, 4)
    else:
        cost_with_vat_in_market = cost_with_vat

    margin = None
    if current_price and cost_with_vat_in_market and current_price > 0:
        margin = (current_price - cost_with_vat_in_market) / current_price * Decimal('100')
        margin = round(margin, 2)

    # ── Competitor prices ──────────────────────────────────────────────────
    lowest_competitor_price = None
    competitor_products = []
    try:
        comp_prices = _comp_prices if _comp_prices is not None else (
            db.query(CompetitorProductPrice)
            .filter(CompetitorProductPrice.product_id == product.id)
            .all()
        )
        if comp_prices:
            prices_with_values = [cp for cp in comp_prices if cp.price is not None]
            if prices_with_values:
                # Nejnižší cena — normalizováno do měny aktivního trhu (price_currency)
                # Pokud je produkt SK, hledáme nejnižší EUR cenu z SK konkurentů
                market_prices = [
                    cp for cp in prices_with_values
                    if (cp.currency or 'CZK') == price_currency
                ]
                if market_prices:
                    lowest_competitor_price = min(cp.price for cp in market_prices)
                else:
                    # Fallback: přepočítej do měny trhu
                    rate = EXCHANGE_CZK.get(price_currency, Decimal('1'))
                    lowest_czk = min(
                        Decimal(str(cp.price)) * EXCHANGE_CZK.get(cp.currency or 'CZK', Decimal('1'))
                        for cp in prices_with_values
                    )
                    lowest_competitor_price = round(lowest_czk / rate, 2)
            competitor_products = [
                {
                    'id': cp.id,
                    'product_id': cp.product_id,
                    'competitor_url': cp.competitor_url,
                    'price': cp.price,
                    'currency': cp.currency,
                    'market': cp.market,
                    'last_fetched_at': cp.last_fetched_at,
                    'next_update_at': cp.next_update_at,
                    'fetch_status': cp.fetch_status,
                    'fetch_error': cp.fetch_error,
                    'created_at': cp.created_at,
                    'updated_at': cp.updated_at,
                }
                for cp in comp_prices
            ]
    except Exception:
        pass

    hero_score = _compute_hero_score(current_price, cost_with_vat, min_price, competitor_urls)

    # ── Catalog data ───────────────────────────────────────────────────────
    manufacturer = None
    catalog_price_vat = None
    catalog_quantity_in_stock = None
    if product.catalog_product_id:
        try:
            cat = _cat if _cat is not None else (
                db.query(CatalogProduct)
                .filter(CatalogProduct.id == product.catalog_product_id)
                .first()
            )
            if cat:
                manufacturer = cat.manufacturer
                catalog_quantity_in_stock = cat.quantity_in_stock
                if cat.price_without_vat is not None and cat.vat_rate is not None:
                    catalog_price_vat = round(
                        cat.price_without_vat * (1 + cat.vat_rate / Decimal('100')), 2
                    )
                elif cat.price_without_vat is not None:
                    catalog_price_vat = cat.price_without_vat
        except Exception:
            pass

    return {
        'id': product.id,
        'name': product.name,
        'sku': product.sku,
        'product_code': getattr(product, 'product_code', None),
        'category': product.category,
        'description': product.description,
        'ean': product.ean,
        'thumbnail_url': product.thumbnail_url,
        'url_reference': product.url_reference,
        'catalog_product_id': product.catalog_product_id,
        'competitor_urls': competitor_urls,
        'current_price': current_price,
        'old_price': price.old_price if price else None,
        'market': price_market,
        'currency': price_currency,
        'purchase_price_without_vat': purchase_price_without_vat,
        'purchase_vat_rate': purchase_vat_rate,
        'purchase_price_with_vat': purchase_price_with_vat,
        'manufacturing_cost': manufacturing_cost,
        'manufacturing_cost_with_vat': manufacturing_cost_with_vat,
        'min_price': min_price,
        'margin': margin,
        'hero_score': hero_score,
        'lowest_competitor_price': lowest_competitor_price,
        'competitor_products': competitor_products,
        'stock_quantity': getattr(product, 'stock_quantity', None),
        'manufacturer': manufacturer,
        'catalog_price_vat': catalog_price_vat,
        'catalog_quantity_in_stock': catalog_quantity_in_stock,
        'market_names': getattr(product, 'market_names_json', None) or {},
        'stock_divisor': getattr(product, 'stock_divisor', None) or 1,
        'created_at': product.created_at,
        'updated_at': product.updated_at,
    }


@router.get("/", response_model=list[ProductResponse])
def list_products(
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """
    Batch-optimized list: fetches prices, competitor prices and catalog data
    in 4 queries total instead of 3×N (N+1 fix).
    """
    from app.models import CompetitorProductPrice, User

    # Authenticate user and get their company
    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    # Filter products by company
    products = db.query(Product).filter(Product.company_id == user.company_id).all()
    if not products:
        return []

    product_ids = [p.id for p in products]

    # 1. Latest price per product (one subquery + join)
    latest_ts_subq = (
        db.query(Price.product_id, func.max(Price.changed_at).label("max_ts"))
        .filter(Price.product_id.in_(product_ids))
        .group_by(Price.product_id)
        .subquery()
    )
    latest_prices = (
        db.query(Price)
        .join(
            latest_ts_subq,
            (Price.product_id == latest_ts_subq.c.product_id)
            & (Price.changed_at == latest_ts_subq.c.max_ts),
        )
        .all()
    )
    price_map = {str(p.product_id): p for p in latest_prices}

    # 2. All competitor prices in one query
    comp_prices_all = (
        db.query(CompetitorProductPrice)
        .filter(CompetitorProductPrice.product_id.in_(product_ids))
        .all()
    )
    comp_map: dict = defaultdict(list)
    for cp in comp_prices_all:
        comp_map[str(cp.product_id)].append(cp)

    # 3. All linked catalog products in one query
    catalog_ids = [p.catalog_product_id for p in products if p.catalog_product_id]
    cat_map = {}
    if catalog_ids:
        cats = db.query(CatalogProduct).filter(CatalogProduct.id.in_(catalog_ids)).all()
        cat_map = {str(c.id): c for c in cats}

    return [
        ProductResponse(**_enrich_with_price(
            p, db,
            _price=price_map.get(str(p.id)),
            _comp_prices=comp_map.get(str(p.id), []),
            _cat=cat_map.get(str(p.catalog_product_id)) if p.catalog_product_id else None,
        ))
        for p in products
    ]


@router.post("/", response_model=ProductResponse)
def create_product(
    product: ProductCreate,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    from app.models import User

    # Authenticate user and get their company
    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(status_code=400, detail="Společnost nenalezena")

    extra_data = {}
    if product.catalog_product_id:
        try:
            cat_product = db.query(CatalogProduct).filter(
                CatalogProduct.id == product.catalog_product_id
            ).first()
            if cat_product:
                extra_data['ean'] = cat_product.ean or product.ean
                extra_data['thumbnail_url'] = cat_product.thumbnail_url or product.thumbnail_url
                extra_data['url_reference'] = cat_product.url_reference or product.url_reference
                extra_data['category'] = product.category or cat_product.category
                extra_data['description'] = product.description or cat_product.description
                extra_data['product_code'] = cat_product.product_code
                extra_data['_catalog_price_without_vat'] = cat_product.price_without_vat
                extra_data['_catalog_vat_rate'] = cat_product.vat_rate
                extra_data['_catalog_market'] = cat_product.market or 'CZ'
                # Canonical profil: pokusíme se odvozit z dat katalogu
                try:
                    from app.normalization.normalizer import build_product_profile
                    _attrs, _profile = build_product_profile(
                        name=product.name or cat_product.name,
                        category=cat_product.category,
                        manufacturer=cat_product.manufacturer,
                        description=cat_product.description,
                    )
                    extra_data['_canonical_attrs'] = _attrs.to_dict()
                    extra_data['_target_weight_g'] = _attrs.target_weight_g
                    extra_data['_must_have'] = _profile.must_have_terms
                    extra_data['_should_have'] = _profile.should_have_terms
                    extra_data['_must_not_have'] = _profile.must_not_have_terms
                except Exception:
                    pass
        except Exception:
            pass

    existing = db.query(Product).filter(
        Product.sku == product.sku,
        Product.company_id == company.id
    ).first()
    if existing:
        # Produkt s tímto SKU/EAN již existuje — zajisti, že má i cenu pro daný trh
        # (např. uživatel klikl "Sledovat" na SK katalogový produkt, ale CZ produkt s EAN již sleduje)
        _cat_market = extra_data.get('_catalog_market', 'CZ')
        _cat_price_raw = extra_data.get('_catalog_price_without_vat')
        _cat_vat = extra_data.get('_catalog_vat_rate')
        _cat_name = product.name
        if _cat_price_raw is not None and _cat_price_raw > 0:
            try:
                from sqlalchemy import desc as _desc
                _cat_currency = 'CZK' if _cat_market == 'CZ' else ('EUR' if _cat_market == 'SK' else 'HUF')
                _vat = Decimal(str(_cat_vat)) if _cat_vat is not None else Decimal('0')
                _price_vat = round(Decimal(str(_cat_price_raw)) * (1 + _vat / Decimal('100')), 2)
                _latest = db.query(Price).filter(
                    Price.product_id == existing.id,
                    Price.market == _cat_market,
                ).order_by(_desc(Price.changed_at)).first()
                if _latest:
                    if _latest.current_price != _price_vat:
                        _latest.old_price = _latest.current_price
                        _latest.current_price = _price_vat
                        _latest.currency = _cat_currency
                else:
                    db.add(Price(
                        product_id=existing.id,
                        market=_cat_market,
                        currency=_cat_currency,
                        current_price=_price_vat,
                    ))
            except Exception:
                pass
        # Uloži název z SK/HU feedu
        if _cat_market != 'CZ' and _cat_name:
            try:
                names = dict(existing.market_names_json or {})
                names[_cat_market] = _cat_name
                existing.market_names_json = names
            except Exception:
                pass
        try:
            db.commit()
        except Exception:
            db.rollback()
        return ProductResponse(**_enrich_with_price(existing, db))

    db_product = Product(
        company_id=company.id,
        name=product.name,
        sku=product.sku,
        product_code=extra_data.get('product_code'),
        category=extra_data.get('category', product.category),
        description=extra_data.get('description', product.description),
        catalog_product_id=product.catalog_product_id,
        ean=extra_data.get('ean', product.ean),
        thumbnail_url=extra_data.get('thumbnail_url', product.thumbnail_url),
        url_reference=extra_data.get('url_reference', product.url_reference),
        competitor_urls=[],
        # Canonical matching profil z normalizéru
        canonical_attributes_json=extra_data.get('_canonical_attrs', {}),
        target_weight_g=extra_data.get('_target_weight_g'),
        must_have_terms_json=extra_data.get('_must_have', []),
        should_have_terms_json=extra_data.get('_should_have', []),
        must_not_have_terms_json=extra_data.get('_must_not_have', []),
    )
    db.add(db_product)
    db.flush()  # get db_product.id before commit

    # Vytvoř počáteční cenový záznam z katalogové ceny (pokud existuje)
    cat_price_raw = extra_data.get('_catalog_price_without_vat')
    cat_vat = extra_data.get('_catalog_vat_rate')
    if cat_price_raw is not None and cat_price_raw > 0:
        try:
            vat = Decimal(str(cat_vat)) if cat_vat is not None else Decimal('0')
            price_vat = Decimal(str(cat_price_raw)) * (1 + vat / Decimal('100'))
            _mkt = extra_data.get('_catalog_market', 'CZ')
            _currency = 'CZK' if _mkt == 'CZ' else ('EUR' if _mkt == 'SK' else 'HUF')
            initial_price = Price(
                product_id=db_product.id,
                market=_mkt,
                currency=_currency,
                current_price=round(price_vat, 2),
            )
            db.add(initial_price)
        except Exception:
            pass

    db.commit()
    db.refresh(db_product)
    return ProductResponse(**_enrich_with_price(db_product, db))


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: UUID,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    from app.models import User
    from sqlalchemy import and_

    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    product = db.query(Product).filter(
        and_(
            Product.id == product_id,
            Product.company_id == user.company_id
        )
    ).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return ProductResponse(**_enrich_with_price(product, db))


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: UUID,
    product_update: ProductUpdate,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    from app.models import User
    from sqlalchemy import and_

    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    product = db.query(Product).filter(
        and_(
            Product.id == product_id,
            Product.company_id == user.company_id
        )
    ).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    for key, value in product_update.model_dump(exclude_unset=True).items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)
    return ProductResponse(**_enrich_with_price(product, db))


@router.patch("/{product_id}/stock-divisor")
def update_stock_divisor(
    product_id: UUID,
    divisor: int,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Nastav koeficient pro přepočet skladovosti (stock_divisor)."""
    from app.models import User
    from sqlalchemy import and_

    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    product = db.query(Product).filter(
        and_(
            Product.id == product_id,
            Product.company_id == user.company_id
        )
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")
    if divisor < 1:
        raise HTTPException(status_code=422, detail="Koeficient musí být >= 1")
    product.stock_divisor = divisor
    db.commit()
    db.refresh(product)
    return {"stock_divisor": product.stock_divisor}


@router.patch("/{product_id}/pricing", response_model=ProductResponse)
def update_pricing(
    product_id: UUID,
    data: PricingUpdate,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Nastav nákupní cenu bez DPH, sazbu DPH a/nebo minimální cenu produktu."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    if data.clear_purchase_price:
        product.purchase_price_without_vat = None
    elif data.purchase_price_without_vat is not None:
        product.purchase_price_without_vat = data.purchase_price_without_vat

    if data.clear_manufacturing_cost:
        product.manufacturing_cost = None
    elif data.manufacturing_cost is not None:
        product.manufacturing_cost = data.manufacturing_cost

    if data.purchase_vat_rate is not None:
        product.purchase_vat_rate = data.purchase_vat_rate
    if data.min_price is not None:
        product.min_price = data.min_price

    db.commit()
    db.refresh(product)
    return ProductResponse(**_enrich_with_price(product, db))


@router.post("/bulk-link-catalog")
def bulk_link_catalog(
    body: BulkLinkCatalogRequest,
    db: Session = Depends(get_db),
):
    """
    Hromadné propojení sledovaných produktů s katalogem.

    Párování dle priority (od nejpřesnějšího):
      1. EAN          – přesná shoda čárového kódu
      2. PRODUCTNO    – product_code z XML feedu (Heureka)
      3. SKU = PRODUCTNO katalogu  – SKU produktu odpovídá product_code v katalogu
      4. Jméno        – Jaccard ≥ 70 % normalizovaných tokenů

    Po nalezení shody:
      - Nastaví catalog_product_id
      - Propaguje canonical atributy (ingredient, processing, …) pokud ještě nejsou
      - Doplní cenu z katalogu pokud produkt nemá žádnou cenu
      - Doplní EAN a obrázek z katalogu pokud chybí
    """
    from app.normalization.normalizer import build_product_profile, normalize_text

    company = db.query(Company).first()
    if not company:
        raise HTTPException(status_code=400, detail="Žádná společnost")

    # Produkty k zpracování
    if body.product_ids:
        products_q = db.query(Product).filter(
            Product.id.in_(body.product_ids),
            Product.company_id == company.id,
        ).all()
    else:
        q = db.query(Product).filter(Product.company_id == company.id)
        if not body.force:
            q = q.filter(Product.catalog_product_id.is_(None))
        products_q = q.all()

    if not products_q:
        return {"linked": 0, "already_linked": 0, "not_found": 0, "details": [], "not_found_list": []}

    # Načti všechny aktivní katalogové produkty firmy
    catalog_all = db.query(CatalogProduct).filter(
        CatalogProduct.company_id == company.id,
        CatalogProduct.is_active == True,
    ).all()

    # Indexy pro O(1) lookup
    by_ean: dict[str, CatalogProduct] = {}
    by_product_code: dict[str, CatalogProduct] = {}
    for cp in catalog_all:
        if cp.ean:
            by_ean[cp.ean.strip()] = cp
        if cp.product_code:
            by_product_code[cp.product_code.strip().upper()] = cp

    linked_list = []
    already_linked_list = []
    not_found_list = []

    for product in products_q:
        # Přeskoč propojené (pokud není force)
        if product.catalog_product_id and not body.force:
            already_linked_list.append({"id": str(product.id), "name": product.name})
            continue

        match: Optional[CatalogProduct] = None
        match_reason = ""

        # 1. EAN
        if product.ean:
            match = by_ean.get(product.ean.strip())
            if match:
                match_reason = "ean"

        # 2. PRODUCTNO (product_code produktu = product_code katalogu)
        if not match and product.product_code:
            match = by_product_code.get(product.product_code.strip().upper())
            if match:
                match_reason = "product_code"

        # 3. SKU produktu = product_code katalogu
        if not match and product.sku:
            match = by_product_code.get(product.sku.strip().upper())
            if match:
                match_reason = "sku_as_productcode"

        # 4. Jméno – Jaccard similarity ≥ 70 %
        if not match:
            norm_name = normalize_text(product.name)
            toks_a = set(norm_name.split())
            best_score = 0.0
            best_cp = None
            for cp in catalog_all:
                toks_b = set(normalize_text(cp.name).split())
                if not toks_a or not toks_b:
                    continue
                score = len(toks_a & toks_b) / len(toks_a | toks_b)
                if score > best_score:
                    best_score = score
                    best_cp = cp
            if best_score >= 0.70 and best_cp:
                match = best_cp
                match_reason = f"name_jaccard_{best_score:.2f}"

        if not match:
            not_found_list.append({"id": str(product.id), "name": product.name})
            continue

        # ── Propojení ───────────────────────────────────────────────────────
        product.catalog_product_id = match.id

        # Propaguj canonical atributy (jen pokud ještě nemá ingredient)
        existing_attrs = product.canonical_attributes_json or {}
        if not existing_attrs.get("ingredient"):
            try:
                attrs, profile = build_product_profile(
                    match.name,
                    category=match.category,
                    manufacturer=match.manufacturer,
                    description=match.description,
                )
                product.canonical_attributes_json = attrs.to_dict()
                product.target_weight_g = product.target_weight_g or attrs.target_weight_g
                product.must_have_terms_json = profile.must_have_terms
                product.should_have_terms_json = profile.should_have_terms
                product.must_not_have_terms_json = profile.must_not_have_terms
            except Exception:
                pass  # Canonical error nesmí zastavit bulk

        # Doplň cenu z katalogu pokud produkt nemá žádnou
        if match.price_without_vat and match.vat_rate:
            existing_price = db.query(Price).filter(
                Price.product_id == product.id
            ).order_by(desc(Price.changed_at)).first()
            if not existing_price:
                price_vat = match.price_without_vat * (1 + match.vat_rate / 100)
                db.add(Price(
                    product_id=product.id,
                    market=match.market or "CZ",
                    currency="CZK" if (match.market or "CZ") == "CZ" else "EUR",
                    current_price=price_vat,
                ))

        # Doplň EAN, obrázek, product_code z katalogu pokud chybí
        if not product.ean and match.ean:
            product.ean = match.ean
        if not product.thumbnail_url and match.thumbnail_url:
            product.thumbnail_url = match.thumbnail_url
        if not product.product_code and match.product_code:
            product.product_code = match.product_code

        linked_list.append({
            "id": str(product.id),
            "name": product.name,
            "catalog_name": match.name,
            "match_reason": match_reason,
        })

    db.commit()

    return {
        "linked": len(linked_list),
        "already_linked": len(already_linked_list),
        "not_found": len(not_found_list),
        "details": linked_list,
        "not_found_list": not_found_list,
    }


@router.delete("/{product_id}")
def delete_product(
    product_id: UUID,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Odebere produkt ze sledování - katalogový záznam zůstane zachován"""
    from app.models import User
    from sqlalchemy import and_

    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    product = db.query(Product).filter(
        and_(
            Product.id == product_id,
            Product.company_id == user.company_id
        )
    ).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    # Smažeme pouze ceny a samotný produkt ze sledování
    db.query(Price).filter(Price.product_id == product_id).delete()
    db.delete(product)
    db.commit()
    return {"message": "Produkt odebrán ze sledování. Záznam v katalogu zůstán zachován."}


@router.get("/{product_id}/prices", response_model=list[PriceResponse])
def get_product_prices(
    product_id: UUID,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    from app.models import User
    from sqlalchemy import and_

    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    # Verify product belongs to user's company
    product = db.query(Product).filter(
        and_(
            Product.id == product_id,
            Product.company_id == user.company_id
        )
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    prices = db.query(Price).filter(
        Price.product_id == product_id
    ).order_by(desc(Price.changed_at)).limit(30).all()
    return prices


@router.post("/{product_id}/prices", response_model=PriceResponse)
def set_product_price(
    product_id: UUID,
    price_data: PriceCreate,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Nastav cenu produktu ručně"""
    from app.models import User
    from sqlalchemy import and_

    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    product = db.query(Product).filter(
        and_(
            Product.id == product_id,
            Product.company_id == user.company_id
        )
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    price = Price(
        product_id=product_id,
        market=price_data.market,
        currency=price_data.currency,
        current_price=price_data.current_price,
        old_price=price_data.old_price,
    )
    db.add(price)
    db.commit()
    db.refresh(price)
    return price


@router.post("/{product_id}/competitor-urls")
async def add_competitor_url(
    product_id: UUID,
    payload: CompetitorUrlAdd,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    from app.models import CompetitorProductPrice, CompetitorPriceHistory, User
    from app.competitor_scraper import scrape_competitor_price
    from sqlalchemy import and_

    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    product = db.query(Product).filter(
        and_(
            Product.id == product_id,
            Product.company_id == user.company_id
        )
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    urls = list(product.competitor_urls or [])
    if any(u.get('url') == payload.url for u in urls):
        raise HTTPException(status_code=400, detail="Tato URL je již přidána")

    name = payload.name or _get_domain_name(payload.url)
    urls.append({"url": payload.url, "name": name, "market": payload.market})
    product.competitor_urls = urls
    db.commit()

    # Vytvoř CompetitorProductPrice tracking record (pokud ještě neexistuje)
    existing_track = db.query(CompetitorProductPrice).filter(
        CompetitorProductPrice.product_id == product_id,
        CompetitorProductPrice.competitor_url == payload.url,
    ).first()
    if not existing_track:
        track = CompetitorProductPrice(
            product_id=product_id,
            competitor_url=payload.url,
            currency="CZK" if payload.market == "CZ" else "EUR",
            market=payload.market,
            fetch_status="pending",
        )
        db.add(track)
        db.commit()
        db.refresh(track)

        # Ihned načti cenu na pozadí
        try:
            price = await scrape_competitor_price(payload.url)
            if price is not None:
                track.price = price
                track.last_fetched_at = datetime.utcnow()
                track.fetch_status = "success"
                track.next_update_at = datetime.utcnow() + timedelta(days=7)
            else:
                track.fetch_status = "error"
                track.fetch_error = "Cena nenalezena na stránce"
                track.last_fetched_at = datetime.utcnow()
            db.commit()
        except Exception as e:
            track.fetch_status = "error"
            track.fetch_error = str(e)
            db.commit()

    db.refresh(product)
    return ProductResponse(**_enrich_with_price(product, db))


@router.delete("/{product_id}/competitor-urls")
def remove_competitor_url(
    product_id: UUID,
    url: str,
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    from app.models import User
    from sqlalchemy import and_

    user_id = token_payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Neautorizováno")

    product = db.query(Product).filter(
        and_(
            Product.id == product_id,
            Product.company_id == user.company_id
        )
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    urls = [u for u in (product.competitor_urls or []) if u.get('url') != url]
    product.competitor_urls = urls
    db.commit()
    db.refresh(product)
    return ProductResponse(**_enrich_with_price(product, db))
