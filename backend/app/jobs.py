"""
Naplánované úlohy (dříve spouštěné in-process APSchedulerem).

Na Vercelu nemá smysl držet dlouhoběžící scheduler — funkce jsou efemérní.
Tyto funkce proto volají cron endpointy (app.api.cron), které spouští
Vercel Cron podle rozvrhu v `vercel.json`. Lokálně / na klasickém serveru
je lze stále spustit přes in-process scheduler (ENABLE_SCHEDULER=true).
"""

from app.database import SessionLocal
from app.models import Product


async def run_all_active_feeds():
    """Načti všechny aktivní feedy (1x denně)."""
    from app.models import FeedSubscription
    from app.api.catalog import _fetch_and_import_feed

    db = SessionLocal()
    try:
        feeds = db.query(FeedSubscription).filter(FeedSubscription.is_active == True).all()
        for feed in feeds:
            try:
                await _fetch_and_import_feed(feed, db)
            except Exception as e:
                print(f"[Job] Chyba při načítání feedu {feed.name}: {e}")
    finally:
        db.close()


async def update_competitor_prices_scheduled():
    """Aktualizuj ceny konkurence (1x denně)."""
    from app.competitor_scraper import update_all_competitor_prices

    result = await update_all_competitor_prices()
    print(f"[Job] Aktualizace cen konkurence: {result['message']}")
    return result


async def send_daily_price_report_scheduled():
    """Odešli denní cenový report emailem (06:00 UTC = 08:00 Praha)."""
    from app.utils.report_generator import generate_price_change_report
    from app.api.reports import _build_product_rows, _send_report_email
    from datetime import date, timedelta
    from app.models import Company

    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        for company in companies:
            try:
                rows = _build_product_rows(db, company.id, days_back=1)
                if not rows:
                    continue
                today = date.today()
                pdf = generate_price_change_report(
                    products=rows,
                    period_from=today - timedelta(days=1),
                    period_to=today,
                    recipient_email='jak.svo1982@gmail.com',
                    threshold_pct=5.0,
                )
                n_changes = sum(
                    1 for p in rows
                    if p['old_price'] and abs(p['my_price'] - p['old_price']) / p['old_price'] * 100 >= 5.0
                )
                await _send_report_email('jak.svo1982@gmail.com', pdf, today, n_changes)
            except Exception as e:
                print(f"[Job] Chyba při odesílání cenového reportu pro {company.id}: {e}")
    finally:
        db.close()


async def sync_baselinker_stock_scheduled():
    """Synchronizuj skladovost z Baselinker (1x denně)."""
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

                print(f"[Job] Baselinker sync: {synced} produktů aktualizováno")
            except Exception as e:
                print(f"[Job] Chyba při synchronizaci Baselinker: {e}")
    finally:
        db.close()
