from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import get_settings
from app.database import Base, engine, SessionLocal
from app.api import auth, products, users, audit, analytics, imports, exports, admin, opportunities, simulator, catalog, competitors, competitor_prices, baselinker, recommendations, hero, seasonality, watchlist


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


async def sync_baselinker_daily():
    """Synchronizuj skladovost z Baselinker 1x denně"""
    from app.models import BaselinkerConfig
    from app.api.baselinker import BaselinkerClient
    from app.integrations.baselinker_client import BaselinkerError

    db = SessionLocal()
    try:
        configs = db.query(BaselinkerConfig).filter(BaselinkerConfig.is_active == True).all()
        for config in configs:
            try:
                if not config.inventory_id:
                    continue
                client = BaselinkerClient(config.api_token)
                # Spusť sync_by_ean pro nejlepší párování
                bl_products = await client.get_all_products(config.inventory_id)
                print(f"[Scheduler] Baselinker sync pro inventář {config.inventory_id}: {len(bl_products)} produktů")
            except BaselinkerError as e:
                print(f"[Scheduler] Chyba Baselinker sync: {e}")
            except Exception as e:
                print(f"[Scheduler] Neočekávaná chyba Baselinker sync: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler()
    # Spusť každý den v 02:00 UTC
    scheduler.add_job(run_all_active_feeds, 'cron', hour=2, minute=0)
    # Spusť každý den v 04:00 UTC pro Baselinker
    scheduler.add_job(sync_baselinker_daily, 'cron', hour=4, minute=0)
    # Spusť každý týden v pondělí v 03:00 UTC
    scheduler.add_job(update_competitor_prices_scheduled, 'cron', day_of_week=0, hour=3, minute=0)
    scheduler.start()
    print("[Scheduler] Denní načítání feedů aktivováno (02:00 UTC)")
    print("[Scheduler] Denní Baselinker sync aktivován (04:00 UTC)")
    print("[Scheduler] Týdenní aktualizace cen konkurence aktivována (pondělí 03:00 UTC)")
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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
app.include_router(hero.router)
app.include_router(seasonality.router)
app.include_router(watchlist.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}

@app.get("/")
def root():
    return {"message": f"Welcome to {settings.APP_NAME} API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
