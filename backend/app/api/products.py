from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse, PriceResponse, PriceCreate, CompetitorUrlItem
from app.models import Product, Price, CatalogProduct, Company
from uuid import UUID
from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
import re

router = APIRouter(prefix="/api/products", tags=["products"])


class CompetitorUrlAdd(BaseModel):
    url: str
    name: Optional[str] = None
    market: str = "CZ"


class PricingUpdate(BaseModel):
    purchase_price: Optional[Decimal] = None
    min_price: Optional[Decimal] = None


def _get_domain_name(url: str) -> str:
    match = re.search(r'https?://(?:www\.)?([^/]+)', url)
    return match.group(1) if match else url


def _compute_hero_score(
    current_price: Optional[Decimal],
    purchase_price: Optional[Decimal],
    min_price: Optional[Decimal],
    competitor_urls: Optional[list],
) -> int:
    """
    Hero Score (0–100) — měří připravenost produktu na optimální cenotvorbu.

    Složení:
      25  Aktuální cena nastavena
      15  Nákupní cena nastavena
      35  Kvalita marže (0 / 5 / 10 / 18 / 28 / 35)
      10  Minimální cena nastavena
      15  Sleduje alespoň 1 URL konkurenta
    """
    score = 0

    if current_price is not None:
        score += 25

    if purchase_price is not None:
        score += 15
        # Marže = (prodejní - nákupní) / prodejní * 100
        if current_price and current_price > 0:
            margin_pct = (current_price - purchase_price) / current_price * 100
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
            # margin <= 0 → 0 bodů (prodáváme pod nákupní cenou)

    if min_price is not None:
        score += 10

    if competitor_urls and len(competitor_urls) >= 1:
        score += 15

    return min(score, 100)


def _enrich_with_price(product: Product, db: Session) -> dict:
    """Přidej poslední cenu, marži a hero score k produktu."""
    price = db.query(Price).filter(
        Price.product_id == product.id
    ).order_by(desc(Price.changed_at)).first()

    current_price = price.current_price if price else None
    purchase_price = getattr(product, 'purchase_price', None)
    min_price = getattr(product, 'min_price', None)
    competitor_urls = product.competitor_urls or []

    # Marže v procentech
    margin = None
    if current_price and purchase_price and current_price > 0:
        margin = (current_price - purchase_price) / current_price * Decimal('100')
        margin = round(margin, 2)

    hero_score = _compute_hero_score(current_price, purchase_price, min_price, competitor_urls)

    return {
        'id': product.id,
        'name': product.name,
        'sku': product.sku,
        'category': product.category,
        'description': product.description,
        'ean': product.ean,
        'thumbnail_url': product.thumbnail_url,
        'url_reference': product.url_reference,
        'catalog_product_id': product.catalog_product_id,
        'competitor_urls': competitor_urls,
        'current_price': current_price,
        'old_price': price.old_price if price else None,
        'market': price.market if price else 'CZ',
        'purchase_price': purchase_price,
        'min_price': min_price,
        'margin': margin,
        'hero_score': hero_score,
        'created_at': product.created_at,
        'updated_at': product.updated_at,
    }


@router.get("/", response_model=list[ProductResponse])
def list_products(db: Session = Depends(get_db)):
    products = db.query(Product).all()
    return [ProductResponse(**_enrich_with_price(p, db)) for p in products]


@router.post("/", response_model=ProductResponse)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    company = db.query(Company).first()
    if not company:
        raise HTTPException(status_code=400, detail="Žádná společnost")

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
        except Exception:
            pass

    existing = db.query(Product).filter(
        Product.sku == product.sku,
        Product.company_id == company.id
    ).first()
    if existing:
        return ProductResponse(**_enrich_with_price(existing, db))

    db_product = Product(
        company_id=company.id,
        name=product.name,
        sku=product.sku,
        category=extra_data.get('category', product.category),
        description=extra_data.get('description', product.description),
        catalog_product_id=product.catalog_product_id,
        ean=extra_data.get('ean', product.ean),
        thumbnail_url=extra_data.get('thumbnail_url', product.thumbnail_url),
        url_reference=extra_data.get('url_reference', product.url_reference),
        competitor_urls=[]
    )
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return ProductResponse(**_enrich_with_price(db_product, db))


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: UUID, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return ProductResponse(**_enrich_with_price(product, db))


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(product_id: UUID, product_update: ProductUpdate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    for key, value in product_update.model_dump(exclude_unset=True).items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)
    return ProductResponse(**_enrich_with_price(product, db))


@router.patch("/{product_id}/pricing", response_model=ProductResponse)
def update_pricing(product_id: UUID, data: PricingUpdate, db: Session = Depends(get_db)):
    """Nastav nákupní cenu a/nebo minimální cenu produktu."""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    if data.purchase_price is not None:
        product.purchase_price = data.purchase_price
    if data.min_price is not None:
        product.min_price = data.min_price

    db.commit()
    db.refresh(product)
    return ProductResponse(**_enrich_with_price(product, db))


@router.delete("/{product_id}")
def delete_product(product_id: UUID, db: Session = Depends(get_db)):
    """Odebere produkt ze sledování - katalogový záznam zůstane zachován"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    # Smažeme pouze ceny a samotný produkt ze sledování
    db.query(Price).filter(Price.product_id == product_id).delete()
    db.delete(product)
    db.commit()
    return {"message": "Produkt odebrán ze sledování. Záznam v katalogu zůstán zachován."}


@router.get("/{product_id}/prices", response_model=list[PriceResponse])
def get_product_prices(product_id: UUID, db: Session = Depends(get_db)):
    prices = db.query(Price).filter(
        Price.product_id == product_id
    ).order_by(desc(Price.changed_at)).limit(30).all()
    return prices


@router.post("/{product_id}/prices", response_model=PriceResponse)
def set_product_price(product_id: UUID, price_data: PriceCreate, db: Session = Depends(get_db)):
    """Nastav cenu produktu ručně"""
    product = db.query(Product).filter(Product.id == product_id).first()
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
def add_competitor_url(product_id: UUID, payload: CompetitorUrlAdd, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    urls = list(product.competitor_urls or [])
    if any(u.get('url') == payload.url for u in urls):
        raise HTTPException(status_code=400, detail="Tato URL je již přidána")

    name = payload.name or _get_domain_name(payload.url)
    urls.append({"url": payload.url, "name": name, "market": payload.market})

    product.competitor_urls = urls
    db.commit()
    db.refresh(product)
    return ProductResponse(**_enrich_with_price(product, db))


@router.delete("/{product_id}/competitor-urls")
def remove_competitor_url(product_id: UUID, url: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    urls = [u for u in (product.competitor_urls or []) if u.get('url') != url]
    product.competitor_urls = urls
    db.commit()
    db.refresh(product)
    return ProductResponse(**_enrich_with_price(product, db))
