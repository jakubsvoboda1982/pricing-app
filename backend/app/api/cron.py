"""
Cron endpointy spouštěné Vercel Cronem (rozvrh v `vercel.json`).

Vercel u cron invokace posílá hlavičku `Authorization: Bearer $CRON_SECRET`.
Endpointy ověří tento token a spustí příslušnou naplánovanou úlohu.
Ručně je lze spustit také se stejným Bearer tokenem.
"""

import os

from fastapi import APIRouter, Header, HTTPException

from app.jobs import (
    run_all_active_feeds,
    update_competitor_prices_scheduled,
    sync_baselinker_stock_scheduled,
    send_daily_price_report_scheduled,
)

router = APIRouter(prefix="/api/cron", tags=["cron"])


def _verify(authorization: str | None) -> None:
    secret = os.getenv("CRON_SECRET")
    if not secret:
        # Bez nastaveného tajemství cron neběží (fail-closed)
        raise HTTPException(status_code=503, detail="CRON_SECRET není nastaven")
    if authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Neautorizováno")


@router.get("/import-feeds")
async def cron_import_feeds(authorization: str | None = Header(default=None)):
    _verify(authorization)
    await run_all_active_feeds()
    return {"status": "ok", "job": "import-feeds"}


@router.get("/competitor-prices")
async def cron_competitor_prices(authorization: str | None = Header(default=None)):
    _verify(authorization)
    result = await update_competitor_prices_scheduled()
    return {"status": "ok", "job": "competitor-prices", "detail": result}


@router.get("/baselinker-stock")
async def cron_baselinker_stock(authorization: str | None = Header(default=None)):
    _verify(authorization)
    await sync_baselinker_stock_scheduled()
    return {"status": "ok", "job": "baselinker-stock"}


@router.get("/daily-report")
async def cron_daily_report(authorization: str | None = Header(default=None)):
    _verify(authorization)
    await send_daily_price_report_scheduled()
    return {"status": "ok", "job": "daily-report"}
