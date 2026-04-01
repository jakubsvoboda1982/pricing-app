from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from app.database import get_db
from app.middleware.auth import verify_token
from app.models import BaselinkerConfig, Product
from app.integrations.baselinker_client import BaselinkerClient, BaselinkerError
from datetime import datetime, timezone

router = APIRouter(prefix="/api/baselinker", tags=["baselinker"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class BaselinkerConfigIn(BaseModel):
    api_token: str
    inventory_id: Optional[int] = None


class InventorySelect(BaseModel):
    inventory_id: int


class BaselinkerConfigOut(BaseModel):
    api_token_masked: str
    inventory_id: Optional[int]
    is_active: bool
    last_sync_at: Optional[datetime]


class SyncResult(BaseModel):
    synced: int
    not_found: int
    errors: int
    message: str


class MatchIn(BaseModel):
    bl_product_id: str
    bl_sku: Optional[str] = None
    bl_ean: Optional[str] = None
    bl_name: Optional[str] = None
    product_id: Optional[str] = None  # UUID as string, None = zrušit párování


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_company_id(payload: dict, db: Session) -> str:
    from app.models import User
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Uživatel nenalezen")
    return str(user.company_id)


def _get_config(company_id: str, db: Session) -> Optional[BaselinkerConfig]:
    return db.query(BaselinkerConfig).filter(
        BaselinkerConfig.company_id == company_id
    ).first()


# ── Endpointy ────────────────────────────────────────────────────────────────

@router.get("/config", response_model=Optional[BaselinkerConfigOut])
def get_config(payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Vrátí aktuální Baselinker konfiguraci (token zamaskovaný)."""
    company_id = _get_company_id(payload, db)
    config = _get_config(company_id, db)
    if not config:
        return None
    masked = config.api_token[:6] + "..." + config.api_token[-4:] if len(config.api_token) > 10 else "***"
    return BaselinkerConfigOut(
        api_token_masked=masked,
        inventory_id=config.inventory_id,
        is_active=config.is_active,
        last_sync_at=config.last_sync_at,
    )


@router.post("/config")
async def save_config(data: BaselinkerConfigIn, payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Uloží nebo aktualizuje Baselinker API token a/nebo inventory_id."""
    company_id = _get_company_id(payload, db)

    # Otestuj token
    client = BaselinkerClient(data.api_token)
    try:
        test = await client.test_connection()
    except BaselinkerError as e:
        raise HTTPException(status_code=400, detail=f"Neplatný API token: {e}")

    config = _get_config(company_id, db)
    if config:
        config.api_token = data.api_token
        if data.inventory_id is not None:
            config.inventory_id = data.inventory_id
        config.is_active = True
    else:
        config = BaselinkerConfig(
            company_id=company_id,
            api_token=data.api_token,
            inventory_id=data.inventory_id,
        )
        db.add(config)
    db.commit()

    return {"ok": True, "inventories": test["inventories"], "inventories_count": test["inventories_count"]}


@router.post("/save-inventory", response_model=dict)
async def save_inventory(data: InventorySelect, payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Uloží vybraný katalog (inventory_id) do konfigurace a ihned spustí sync skladovosti."""
    company_id = _get_company_id(payload, db)
    config = _get_config(company_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="Baselinker není nastaven")

    config.inventory_id = data.inventory_id
    db.commit()

    # Ihned spusť sync skladovosti
    client = BaselinkerClient(config.api_token)
    synced = 0
    errors = 0
    try:
        from app.models import Product
        from datetime import datetime, timezone
        bl_products = await client.get_all_products(data.inventory_id)

        sku_to_stock: dict[str, int] = {}
        ean_to_stock: dict[str, int] = {}
        for p in bl_products:
            sku = (p.get("sku") or "").strip()
            ean = (p.get("ean") or "").strip()
            stock = p.get("stock", {})
            total = int(sum(v for v in stock.values() if isinstance(v, (int, float))))
            if sku:
                sku_to_stock[sku] = total
            if ean:
                ean_to_stock[ean] = total

        products = db.query(Product).filter(Product.company_id == company_id).all()
        for product in products:
            key_sku = (product.product_code or product.sku or "").strip()
            key_ean = (product.ean or "").strip()
            if key_ean and key_ean in ean_to_stock:
                product.stock_quantity = ean_to_stock[key_ean]
                synced += 1
            elif key_sku and key_sku in sku_to_stock:
                product.stock_quantity = sku_to_stock[key_sku]
                synced += 1

        config.last_sync_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        errors += 1

    return {
        "ok": True,
        "inventory_id": config.inventory_id,
        "message": f"Katalog uložen. Synchronizováno {synced} produktů." + (f" ({errors} chyb)" if errors else ""),
        "synced": synced,
    }


@router.get("/inventories")
async def get_inventories(payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """Vrátí seznam katalogů z Baselinker."""
    company_id = _get_company_id(payload, db)
    config = _get_config(company_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="Baselinker není nastaven")

    client = BaselinkerClient(config.api_token)
    try:
        inventories = await client.get_inventories()
    except BaselinkerError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"inventories": inventories}


@router.post("/sync-stock", response_model=SyncResult)
async def sync_stock(payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """
    Synchronizuje skladovost z Baselinker do sledovaných produktů.
    Párování: products.product_code (PRODUCTNO) = Baselinker SKU
    """
    company_id = _get_company_id(payload, db)
    config = _get_config(company_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="Baselinker není nastaven")
    if not config.inventory_id:
        raise HTTPException(status_code=400, detail="Není vybrán katalog (inventory_id)")

    client = BaselinkerClient(config.api_token)

    # Stáhni všechny produkty z Baselinker
    try:
        bl_products = await client.get_all_products(config.inventory_id)
    except BaselinkerError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Vytvoř mapu SKU → Baselinker produkt (stock)
    sku_to_stock: dict[str, int] = {}
    for p in bl_products:
        sku = p.get("sku") or p.get("name", "")
        stock = p.get("stock", {})
        # Sečti sklad ze všech skladů
        total_stock = sum(v for v in stock.values() if isinstance(v, (int, float)))
        if sku:
            sku_to_stock[sku.strip()] = int(total_stock)

    # Načti sledované produkty firmy
    products = db.query(Product).filter(Product.company_id == company_id).all()

    synced = 0
    not_found = 0
    errors = 0

    for product in products:
        # Páruj přes product_code (PRODUCTNO)
        key = product.product_code or product.sku
        if not key:
            not_found += 1
            continue

        if key in sku_to_stock:
            try:
                product.stock_quantity = sku_to_stock[key]
                synced += 1
            except Exception:
                errors += 1
        else:
            not_found += 1

    # Ulož čas synchronizace
    config.last_sync_at = datetime.now(timezone.utc)
    db.commit()

    return SyncResult(
        synced=synced,
        not_found=not_found,
        errors=errors,
        message=f"Synchronizováno {synced} produktů, {not_found} nenalezeno v Baselinker",
    )


@router.post("/sync-by-ean", response_model=SyncResult)
async def sync_by_ean(payload: dict = Depends(verify_token), db: Session = Depends(get_db)):
    """
    Synchronizuje skladovost z Baselinker do sledovaných produktů.
    Párování:
    1. products.ean = Baselinker EAN (primární)
    2. products.sku = Baselinker SKU (fallback)
    3. products.product_code = Baselinker SKU (fallback)
    """
    company_id = _get_company_id(payload, db)
    config = _get_config(company_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="Baselinker není nastaven")
    if not config.inventory_id:
        raise HTTPException(status_code=400, detail="Není vybrán katalog (inventory_id)")

    client = BaselinkerClient(config.api_token)

    # Stáhni všechny produkty z Baselinker
    try:
        bl_products = await client.get_all_products(config.inventory_id)
    except BaselinkerError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Vytvoř mapy pro párování
    ean_to_stock: dict[str, int] = {}
    sku_to_stock: dict[str, int] = {}

    for p in bl_products:
        stock = p.get("stock", {})
        # Sečti sklad ze všech skladů
        total_stock = sum(v for v in stock.values() if isinstance(v, (int, float)))
        total_stock = int(total_stock)

        # EAN mapa
        ean = p.get("ean", "").strip()
        if ean:
            ean_to_stock[ean] = total_stock

        # SKU mapa
        sku = p.get("sku", "").strip()
        if sku:
            sku_to_stock[sku] = total_stock

    # Načti sledované produkty firmy
    products = db.query(Product).filter(Product.company_id == company_id).all()

    synced = 0
    not_found = 0
    errors = 0

    for product in products:
        stock_value = None

        # 1. Zkus EAN
        if product.ean:
            ean_key = product.ean.strip()
            if ean_key in ean_to_stock:
                stock_value = ean_to_stock[ean_key]

        # 2. Fallback: zkus SKU
        if stock_value is None and product.sku:
            sku_key = product.sku.strip()
            if sku_key in sku_to_stock:
                stock_value = sku_to_stock[sku_key]

        # 3. Fallback: zkus product_code (PRODUCTNO)
        if stock_value is None and product.product_code:
            code_key = product.product_code.strip()
            if code_key in sku_to_stock:
                stock_value = sku_to_stock[code_key]

        # Ulož výsledek
        if stock_value is not None:
            try:
                product.stock_quantity = stock_value
                synced += 1
            except Exception:
                errors += 1
        else:
            not_found += 1

    # Ulož čas synchronizace
    config.last_sync_at = datetime.now(timezone.utc)
    db.commit()

    return SyncResult(
        synced=synced,
        not_found=not_found,
        errors=errors,
        message=f"Synchronizováno {synced} produktů (EAN/SKU/PRODUCTNO), {not_found} nenalezeno",
    )


# ── Přehled produktů z Baselinker + ruční párování ───────────────────────────

@router.get("/products")
async def get_bl_products(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Načte všechny produkty z Baslinker (vybraného katalogu) a přidá info o párování."""
    from app.models import BaselinkerProductMatch
    company_id = _get_company_id(payload, db)
    config = _get_config(company_id, db)
    if not config:
        raise HTTPException(status_code=404, detail="Baselinker není nastaven")
    if not config.inventory_id:
        raise HTTPException(status_code=400, detail="Není vybrán katalog (inventory_id)")

    client = BaselinkerClient(config.api_token)
    try:
        bl_products = await client.get_all_products(config.inventory_id)
    except BaselinkerError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Načti existující párování pro tuto firmu
    matches = db.query(BaselinkerProductMatch).filter(
        BaselinkerProductMatch.company_id == company_id
    ).all()
    match_by_bl_id: dict[str, BaselinkerProductMatch] = {str(m.bl_product_id): m for m in matches}

    result = []
    for p in bl_products:
        bl_id = str(p.get("baselinker_id", ""))
        stock = p.get("stock", {})
        total_stock = int(sum(v for v in stock.values() if isinstance(v, (int, float))))

        # Cena – Baselinker vrací různé price_* fieldy; vezmi první neprázdnou
        raw_price = (
            p.get("price_brutto") or
            p.get("price_wholesale") or
            p.get("price") or
            None
        )
        price = float(raw_price) if raw_price not in (None, "", 0) else None

        match = match_by_bl_id.get(bl_id)
        matched_product = None
        if match and match.product_id:
            prod = match.product
            if prod:
                matched_product = {
                    "id": str(prod.id),
                    "name": prod.name,
                    "sku": prod.sku,
                    "match_id": str(match.id),
                }
            else:
                matched_product = {"match_id": str(match.id)}

        result.append({
            "bl_product_id": bl_id,
            "name": p.get("name", ""),
            "sku": (p.get("sku") or "").strip(),
            "ean": (p.get("ean") or "").strip(),
            "stock": total_stock,
            "price": price,
            "matched_product": matched_product,
        })

    return {"products": result, "total": len(result)}


@router.post("/matches")
def create_or_update_match(
    data: MatchIn,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vytvoří nebo aktualizuje ruční párování BL produktu s naším produktem."""
    from app.models import BaselinkerProductMatch
    company_id = _get_company_id(payload, db)

    existing = db.query(BaselinkerProductMatch).filter(
        BaselinkerProductMatch.company_id == company_id,
        BaselinkerProductMatch.bl_product_id == data.bl_product_id,
    ).first()

    product_uuid = None
    if data.product_id:
        try:
            import uuid as uuid_lib
            product_uuid = uuid_lib.UUID(data.product_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Neplatné product_id")

    if existing:
        existing.product_id = product_uuid
        existing.bl_sku = data.bl_sku
        existing.bl_ean = data.bl_ean
        existing.bl_name = data.bl_name
        db.commit()
        db.refresh(existing)
        return {"ok": True, "match_id": str(existing.id)}
    else:
        new_match = BaselinkerProductMatch(
            company_id=company_id,
            bl_product_id=data.bl_product_id,
            bl_sku=data.bl_sku,
            bl_ean=data.bl_ean,
            bl_name=data.bl_name,
            product_id=product_uuid,
        )
        db.add(new_match)
        db.commit()
        db.refresh(new_match)
        return {"ok": True, "match_id": str(new_match.id)}


@router.delete("/matches/{match_id}")
def delete_match(
    match_id: UUID,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Odstraní ruční párování."""
    from app.models import BaselinkerProductMatch
    company_id = _get_company_id(payload, db)

    match = db.query(BaselinkerProductMatch).filter(
        BaselinkerProductMatch.id == match_id,
        BaselinkerProductMatch.company_id == company_id,
    ).first()
    if not match:
        raise HTTPException(status_code=404, detail="Párování nenalezeno")

    db.delete(match)
    db.commit()
    return {"ok": True}
