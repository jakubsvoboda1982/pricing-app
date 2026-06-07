import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.config import get_settings
from app.database import Base, engine
from app.api import auth, products, users, audit, analytics, imports, exports, admin, opportunities, simulator, catalog, competitors, competitor_prices, baselinker, recommendations, watchlist, hero, seasonality, alerts, matching, reports, cron


@asynccontextmanager
async def lifespan(app: FastAPI):
    # In-process scheduler je výchozí VYPNUTÝ — na Vercelu by stejně neběžel
    # (efemérní funkce). Naplánované úlohy spouští Vercel Cron přes app.api.cron.
    # Pro klasický dlouhoběžící server lze scheduler zapnout ENABLE_SCHEDULER=true.
    scheduler = None
    if os.getenv("ENABLE_SCHEDULER", "false").lower() == "true":
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from app.jobs import (
            run_all_active_feeds,
            update_competitor_prices_scheduled,
            sync_baselinker_stock_scheduled,
            send_daily_price_report_scheduled,
        )
        scheduler = AsyncIOScheduler()
        scheduler.add_job(run_all_active_feeds, 'cron', hour=2, minute=0)
        scheduler.add_job(update_competitor_prices_scheduled, 'cron', hour=3, minute=0)
        scheduler.add_job(sync_baselinker_stock_scheduled, 'cron', hour=4, minute=0)
        scheduler.add_job(send_daily_price_report_scheduled, 'cron', hour=6, minute=0)
        scheduler.start()
        print("[Scheduler] In-process scheduler aktivován (feedy 02:00, ceny 03:00, sklad 04:00, report 06:00 UTC)")

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
    if scheduler is not None:
        scheduler.shutdown()


# Inicializace schématu (tabulky, indexy, idempotentní migrace).
# Na Vercelu běží při importu = při každém cold startu funkce, proto je VÝCHOZÍ
# VYPNUTO (RUN_DB_INIT=false) — schéma se spravuje migracemi mimo request path.
# Pro lokální vývoj / klasický server nech RUN_DB_INIT=true.
_RUN_DB_INIT = os.getenv("RUN_DB_INIT", "true").lower() == "true"


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
    ]
    try:
        with engine.connect() as conn:
            # Nastav krátký lock timeout aby ALTER TABLE nezablokoval startup
            conn.execute(text("SET lock_timeout = '5s'"))
            for stmt in stmts:
                conn.execute(text(stmt))
            conn.commit()
    except Exception as e:
        print(f"[startup] Schema migration warning: {e}")


if _RUN_DB_INIT:
    Base.metadata.create_all(bind=engine)
    _ensure_indexes()
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
app.include_router(reports.router)
app.include_router(cron.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}

@app.get("/")
def root():
    return {"message": f"Welcome to {settings.APP_NAME} API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
