from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.config import get_settings
from app.database import Base, engine, SessionLocal
from app.models import Product
from app.api import auth, products, users, audit, analytics, imports, exports, admin, opportunities, simulator, catalog, competitors, competitor_prices, baselinker, recommendations, watchlist, hero, seasonality, alerts, matching


async def run_all_active_feeds():
    """Načti všechny aktivní feedy (spouštěno schedulérem 1x denně)"""
    from app.models import FeedSubscription
    from app.api.catalog import _fetch_and_import_feed

    db = SessionLocal()
    try:
        feeds = db.query(FeedSubscription).filter(FeedSubscription.is_active == True).all()
        for feed in feeds:
            try:
                await _fetch_and_import_feed(feed, db)
            except Exception as e:
                print(f"[Scheduler] Chyba při načítání feedu {feed.name}: {e}")
    finally:
        db.close()


async def update_competitor_prices_scheduled():
    """Aktualizuj ceny konkurence (spouštěno schedulérem 1x týdně)"""
    from app.competitor_scraper import update_all_competitor_prices

    try:
        result = await update_all_competitor_prices()
        print(f"[Scheduler] Aktualizace cen konkurence: {result['message']}")
    except Exception as e:
        print(f"[Scheduler] Chyba při aktualizaci cen konkurence: {e}")


async def sync_baselinker_stock_scheduled():
    """Synchronizuj skladovost z Baselinker (spouštěno schedulérem 1x denně)"""
    from app.models import BaselinkerConfig
    from app.integrations.baselinker_client import BaselinkerClient

    db = SessionLocal()
    try:
        configs = db.query(BaselinkerConfig).filter(BaselinkerConfig.is_active == True).all()
        for config in configs:
            if not config.inventory_id:
                continue

            try:
                from app.models import BaselinkerProductMatch
                client = BaselinkerClient(config.api_token)
                bl_products = await client.get_all_products(config.inventory_id)

                # Vytvoř mapy: bl_id → stock, sku → stock, ean → stock
                bl_id_to_stock: dict = {}
                sku_to_stock: dict = {}
                ean_to_stock: dict = {}
                for p in bl_products:
                    bl_id = str(p.get("baselinker_id", ""))
                    sku = (p.get("sku") or "").strip()
                    ean = (p.get("ean") or "").strip()
                    stock = p.get("stock", {})
                    total_stock = int(sum(v for v in stock.values() if isinstance(v, (int, float))))
                    if bl_id:
                        bl_id_to_stock[bl_id] = total_stock
                    if sku:
                        sku_to_stock[sku] = total_stock
                    if ean:
                        ean_to_stock[ean] = total_stock

                synced = 0
                synced_product_ids: set = set()

                # 1) Přímé propojení přes BaselinkerProductMatch (ruční párování)
                matches = db.query(BaselinkerProductMatch).filter(
                    BaselinkerProductMatch.company_id == config.company_id,
                    BaselinkerProductMatch.product_id.isnot(None),
                ).all()
                for match in matches:
                    bl_id = str(match.bl_product_id)
                    if bl_id in bl_id_to_stock and match.product_id:
                        product = db.query(Product).filter(Product.id == match.product_id).first()
                        if product:
                            product.stock_quantity = bl_id_to_stock[bl_id]
                            synced += 1
                            synced_product_ids.add(str(match.product_id))

                # 2) Záložní párování přes EAN / SKU / product_code
                all_products = db.query(Product).filter(Product.company_id == config.company_id).all()
                for product in all_products:
                    if str(product.id) in synced_product_ids:
                        continue  # už spárováno přes match
                    stock = None
                    if product.ean and product.ean.strip() in ean_to_stock:
                        stock = ean_to_stock[product.ean.strip()]
                    elif product.product_code and product.product_code.strip() in sku_to_stock:
                        stock = sku_to_stock[product.product_code.strip()]
                    elif product.sku and product.sku.strip() in sku_to_stock:
                        stock = sku_to_stock[product.sku.strip()]
                    if stock is not None:
                        product.stock_quantity = stock
                        synced += 1

                from datetime import datetime, timezone
                config.last_sync_at = datetime.now(timezone.utc)
                db.commit()

                print(f"[Scheduler] Baselinker sync: {synced} produktů aktualizováno")
            except Exception as e:
                print(f"[Scheduler] Chyba při synchronizaci Baselinker: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler()
    # Spusť každý den v 02:00 UTC
    scheduler.add_job(run_all_active_feeds, 'cron', hour=2, minute=0)
    # Spusť každý den v 03:00 UTC
    scheduler.add_job(update_competitor_prices_scheduled, 'cron', hour=3, minute=0)
    # Spusť každý den v 04:00 UTC
    scheduler.add_job(sync_baselinker_stock_scheduled, 'cron', hour=4, minute=0)
    scheduler.start()
    print("[Scheduler] Denní načítání feedů aktivováno (02:00 UTC)")
    print("[Scheduler] Denní aktualizace cen konkurence aktivována (03:00 UTC)")
    print("[Scheduler] Denní synchronizace Baselinker skladů aktivována (04:00 UTC)")

    # Načti kurzy ČNB při startu (uloží do cache)
    try:
        from app.utils.exchange_rates import _fetch_cnb_rates, _cache
        from datetime import datetime as _dt
        _rates = await _fetch_cnb_rates()
        if _rates:
            _cache['rates'] = _rates
            _cache['fetched_at'] = _dt.utcnow()
            print(f"[Startup] Kurzy ČNB načteny: EUR={_rates.get('EUR')}, HUF={_rates.get('HUF')}")
        else:
            print("[Startup] Kurzy ČNB nelze načíst, použiji záložní hodnoty")
    except Exception as _e:
        print(f"[Startup] Chyba při načítání kurzů ČNB: {_e}")

    yield
    # Shutdown
    scheduler.shutdown()


# Create all tables
Base.metadata.create_all(bind=engine)

# Ensure performance indexes exist (idempotent — IF NOT EXISTS)
def _ensure_indexes():
    from sqlalchemy import text
    ddl = [
        # Catalog — name/category/manufacturer are unindexed by default but used in ilike search
        "CREATE INDEX IF NOT EXISTS idx_cat_name      ON catalog_products (name)",
        "CREATE INDEX IF NOT EXISTS idx_cat_category  ON catalog_products (category)",
        "CREATE INDEX IF NOT EXISTS idx_cat_mfr       ON catalog_products (manufacturer)",
        # Prices — latest-per-product subquery hits product_id + changed_at
        "CREATE INDEX IF NOT EXISTS idx_prices_product_ts ON prices (product_id, changed_at DESC)",
        # CompetitorProductPrice — bulk filter by product_id
        "CREATE INDEX IF NOT EXISTS idx_cpp_product   ON competitor_product_prices (product_id)",
    ]
    try:
        with engine.connect() as conn:
            for stmt in ddl:
                conn.execute(text(stmt))
            conn.commit()
    except Exception as e:
        print(f"[startup] Index creation warning: {e}")

_ensure_indexes()


# Apply idempotent schema migrations (ADD COLUMN IF NOT EXISTS)
def _ensure_schema():
    from sqlalchemy import text
    stmts = [
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS market_names_json JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS market_attributes_json JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS own_market_urls_json JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS own_market_variant_labels_json JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_divisor INTEGER DEFAULT 1",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_expires_at TIMESTAMP WITH TIME ZONE",
        "ALTER TABLE competitor_product_prices ADD COLUMN IF NOT EXISTS variant_label VARCHAR(200)",
        # Fix FK in competitor_price_history: must reference competitor_product_prices, not competitor_prices
        # Step 1: Delete orphaned history rows that reference non-existent competitor_product_prices
        """DELETE FROM competitor_price_history
           WHERE competitor_price_id NOT IN (
               SELECT id FROM competitor_product_prices
           )""",
        # Step 2: Drop the old/wrong constraint (works even if it doesn't exist)
        "ALTER TABLE competitor_price_history DROP CONSTRAINT IF EXISTS competitor_price_history_competitor_price_id_fkey",
        # Step 3: Recreate constraint pointing to the correct table
        """ALTER TABLE competitor_price_history
               ADD CONSTRAINT competitor_price_history_competitor_price_id_fkey
               FOREIGN KEY (competitor_price_id)
               REFERENCES competitor_product_prices(id)
               ON DELETE CASCADE""",
    ]
    try:
        with engine.connect() as conn:
            for stmt in stmts:
                conn.execute(text(stmt))
            conn.commit()
    except Exception as e:
        print(f"[startup] Schema migration warning: {e}")

_ensure_schema()

app = FastAPI(
    title="Pricing Management Software",
    description="API for pricing product management",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,  # Zabrání 301 redirect při CORS (trailing slash problem)
)

settings = get_settings()

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Ensure CORS headers are present even on unhandled 500 errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in settings.ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Interní chyba serveru"},
        headers=headers,
    )

# Include routers
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(users.router)
app.include_router(audit.router)
app.include_router(analytics.router)
app.include_router(imports.router)
app.include_router(exports.router)
app.include_router(admin.router)
app.include_router(opportunities.router)
app.include_router(simulator.router)
app.include_router(catalog.router)
app.include_router(competitors.router)
app.include_router(competitor_prices.router)
app.include_router(baselinker.router)
app.include_router(recommendations.router)
app.include_router(watchlist.router)
app.include_router(hero.router)
app.include_router(seasonality.router)
app.include_router(alerts.router)
app.include_router(matching.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}

@app.get("/")
def root():
    return {"message": f"Welcome to {settings.APP_NAME} API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
