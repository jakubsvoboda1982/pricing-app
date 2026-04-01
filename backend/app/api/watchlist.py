from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.models import WatchedProduct, Product
from app.middleware.auth import verify_token

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class WatchedProductResponse(BaseModel):
    id: str
    product_id: str
    product_name: str
    product_sku: str
    is_price_alert_enabled: bool
    is_stock_alert_enabled: bool
    added_at: datetime

    model_config = {"from_attributes": True}


@router.post("/add/{product_id}")
def add_to_watchlist(
    product_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Přidej produkt na watchlist"""
    try:
        pid = UUID(product_id)
        uid = UUID(payload.get("sub"))
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produkt nenalezen")

    # Zkontroluj, zda už není na watchlistu
    existing = db.query(WatchedProduct).filter(
        WatchedProduct.product_id == pid,
        WatchedProduct.company_id == product.company_id
    ).first()

    if existing:
        return {
            "message": "Produkt je již na watchlistu",
            "id": str(existing.id)
        }

    watched = WatchedProduct(
        company_id=product.company_id,
        product_id=pid,
        user_id=uid,
        is_price_alert_enabled=True,
        is_stock_alert_enabled=True,
    )
    db.add(watched)
    db.commit()
    db.refresh(watched)

    return {
        "message": "Produkt přidán na watchlist",
        "id": str(watched.id)
    }


@router.delete("/remove/{product_id}")
def remove_from_watchlist(
    product_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Odeber produkt z watchlistu"""
    try:
        pid = UUID(product_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    watched = db.query(WatchedProduct).filter(WatchedProduct.product_id == pid).first()
    if not watched:
        raise HTTPException(status_code=404, detail="Produkt není na watchlistu")

    db.delete(watched)
    db.commit()

    return {"message": "Produkt odstraněn z watchlistu"}


@router.get("")
def list_watchlist(
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vypiš watchlist aktuálního uživatele"""
    try:
        uid = UUID(payload.get("sub"))
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID uživatele")

    watched = db.query(WatchedProduct).filter(WatchedProduct.user_id == uid).order_by(desc(WatchedProduct.added_at)).all()

    result = []
    for w in watched:
        product = db.query(Product).filter(Product.id == w.product_id).first()
        if product:
            result.append({
                "id": str(w.id),
                "product_id": str(w.product_id),
                "product_name": product.name,
                "product_sku": product.sku,
                "is_price_alert_enabled": w.is_price_alert_enabled,
                "is_stock_alert_enabled": w.is_stock_alert_enabled,
                "added_at": w.added_at,
            })

    return result


@router.post("/{watched_id}/toggle-price-alert")
def toggle_price_alert(
    watched_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Přepnutí cennového upozornění"""
    try:
        wid = UUID(watched_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    watched = db.query(WatchedProduct).filter(WatchedProduct.id == wid).first()
    if not watched:
        raise HTTPException(status_code=404, detail="Položka na watchlistu nenalezena")

    watched.is_price_alert_enabled = not watched.is_price_alert_enabled
    db.commit()

    return {
        "message": "Upozornění aktualizováno",
        "is_price_alert_enabled": watched.is_price_alert_enabled
    }


@router.post("/{watched_id}/toggle-stock-alert")
def toggle_stock_alert(
    watched_id: str,
    payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Přepnutí skladového upozornění"""
    try:
        wid = UUID(watched_id)
    except:
        raise HTTPException(status_code=400, detail="Neplatné ID")

    watched = db.query(WatchedProduct).filter(WatchedProduct.id == wid).first()
    if not watched:
        raise HTTPException(status_code=404, detail="Položka na watchlistu nenalezena")

    watched.is_stock_alert_enabled = not watched.is_stock_alert_enabled
    db.commit()

    return {
        "message": "Upozornění aktualizováno",
        "is_stock_alert_enabled": watched.is_stock_alert_enabled
    }
