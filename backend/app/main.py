from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import get_settings
from app.database import Base, engine, SessionLocal
from app.models import Product
from app.api import auth, products, users, audit, analytics, imports, exports, admin, opportunities, simulator, catalog, competitors, competitor_prices, baselinker, recommendations, watchlist, hero, seasonality, alerts


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
                client = BaselinkerClient(config.api_token)
                bl_products = await client.get_all_products(config.inventory_id)

                # Vytvoř mapu SKU → stock
                sku_to_stock = {}
                for p in bl_products:
                    sku = p.get("sku") or p.get("name", "")
                    stock = p.get("stock", {})
                    total_stock = sum(v for v in stock.values() if isinstance(v, (int, float)))
                    if sku:
                        sku_to_stock[sku.strip()] = int(total_stock)

                # Aktualizuj produkty
                products = db.query(Product).filter(Product.company_id == config.company_id).all()
                synced = 0
                for product in products:
                    key = product.product_code or product.sku
                    if key and key in sku_to_stock:
                        product.stock_quantity = sku_to_stock[key]
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
    yield
    # Shutdown
    scheduler.shutdown()


# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Pricing Management Software",
    description="API for pricing product management",
    version="0.1.0",
    lifespan=lifespan
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

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}

@app.get("/")
def root():
    return {"message": f"Welcome to {settings.APP_NAME} API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
