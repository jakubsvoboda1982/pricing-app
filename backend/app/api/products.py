from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse, PriceResponse, CompetitorUrlItem
from app.models import Product, Price, CatalogProduct, Company
from uuid import UUID
from pydantic import BaseModel
from typing import Optional
import re

router = APIRouter(prefix="/api/products", tags=["products"])


class CompetitorUrlAdd(BaseModel):
    url: str
    name: Optional[str] = None
    market: str = "CZ"


def _get_domain_name(url: str) -> str:
    """Extrahuj doménové jméno z URL"""
    match = re.search(r'https?://(?:www\.)?([^/]+)', url)
    return match.group(1) if match else url


@router.get("/", response_model=list[ProductResponse])
def list_products(db: Session = Depends(get_db)):
    products = db.query(Product).all()
    return products


@router.post("/", response_model=ProductResponse)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    # Najdi company
    company = db.query(Company).first()
    if not company:
        raise HTTPException(status_code=400, detail="Žádná společnost")

    # Pokud je zadán catalog_product_id, doplň data z katalogu
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

    # Zkontroluj duplicitu SKU pro tuto firmu
    existing = db.query(Product).filter(
        Product.sku == product.sku,
        Product.company_id == company.id
    ).first()
    if existing:
        # Vrať existující produkt místo chyby
        return existing

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
    return db_product


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: UUID, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(product_id: UUID, product_update: ProductUpdate, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    for key, value in product_update.dict(exclude_unset=True).items():
        setattr(product, key, value)

    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}")
def delete_product(product_id: UUID, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    db.delete(product)
    db.commit()
    return {"message": "Product deleted"}


@router.get("/{product_id}/prices", response_model=list[PriceResponse])
def get_product_prices(product_id: UUID, db: Session = Depends(get_db)):
    prices = db.query(Price).filter(Price.product_id == product_id).all()
    return prices


# ---------------------------------------------------------------------------
# Správa URL konkurentů pro sledovaný produkt
# ---------------------------------------------------------------------------

@router.post("/{product_id}/competitor-urls")
def add_competitor_url(
    product_id: UUID,
    payload: CompetitorUrlAdd,
    db: Session = Depends(get_db)
):
    """Přidej URL produktu u konkurenta ke sledovanému produktu"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    urls = list(product.competitor_urls or [])

    # Zkontroluj duplicitu
    if any(u.get('url') == payload.url for u in urls):
        raise HTTPException(status_code=400, detail="Tato URL je již přidána")

    name = payload.name or _get_domain_name(payload.url)
    urls.append({"url": payload.url, "name": name, "market": payload.market})

    product.competitor_urls = urls
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}/competitor-urls")
def remove_competitor_url(
    product_id: UUID,
    url: str,
    db: Session = Depends(get_db)
):
    """Odeber URL konkurenta od sledovaného produktu"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    urls = [u for u in (product.competitor_urls or []) if u.get('url') != url]
    product.competitor_urls = urls
    db.commit()
    db.refresh(product)
    return product
