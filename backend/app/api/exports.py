from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, Price
from app.models.recommendation import PriceRecommendation
from app.middleware.auth import verify_token
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
import io
import csv
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/api/export", tags=["export"])

ALL_FIELDS = [
    'id', 'sku', 'name', 'category', 'description',
    'current_price', 'old_price',
    'recommended_price', 'recommended_price_source',
    'created_at', 'updated_at',
]

FIELD_LABELS = {
    'id':                        'Product ID',
    'sku':                       'SKU',
    'name':                      'Název',
    'category':                  'Kategorie',
    'description':               'Popis',
    'current_price':             'Aktuální cena',
    'old_price':                 'Stará cena',
    'recommended_price':         'Doporučená cena',
    'recommended_price_source':  'Zdroj doporučení',
    'created_at':                'Vytvořeno',
    'updated_at':                'Upraveno',
}


def _get_price_map(db: Session, product_ids: list) -> dict:
    """Načti poslední cenu per produkt (batch) — seřazeno dle changed_at DESC."""
    if not product_ids:
        return {}
    prices = (
        db.query(Price)
        .filter(Price.product_id.in_(product_ids))
        .order_by(Price.product_id, Price.changed_at.desc())
        .all()
    )
    seen: dict = {}
    for p in prices:
        pid = str(p.product_id)
        if pid not in seen:
            seen[pid] = p
    return seen


def _get_products(
    db: Session,
    category: Optional[str],
    market: Optional[str],
    min_price: Optional[float],
    max_price: Optional[float],
    search: Optional[str],
) -> list:
    """Vrať filtrované produkty."""
    q = db.query(Product)
    if category:
        q = q.filter(Product.category == category)
    if search:
        q = q.filter(Product.name.ilike(f"%{search}%"))

    products = q.all()

    # Cenové filtry — načti ceny jednou
    if min_price is not None or max_price is not None or market:
        price_map = _get_price_map(db, [p.id for p in products])
        filtered = []
        for p in products:
            pr = price_map.get(str(p.id))
            if market and pr and pr.market != market:
                continue
            if pr and pr.current_price is not None:
                val = float(pr.current_price)
                if min_price is not None and val < min_price:
                    continue
                if max_price is not None and val > max_price:
                    continue
            filtered.append(p)
        return filtered

    return products


def _get_recommendation_map(db: Session, product_ids: list) -> dict:
    """Načti nejnovější doporučení per produkt (pending nebo approved)."""
    if not product_ids:
        return {}
    recs = (
        db.query(PriceRecommendation)
        .filter(
            PriceRecommendation.product_id.in_(product_ids),
            PriceRecommendation.status.in_(["pending", "approved"]),
        )
        .order_by(PriceRecommendation.product_id, PriceRecommendation.created_at.desc())
        .all()
    )
    seen: dict = {}
    for r in recs:
        pid = str(r.product_id)
        if pid not in seen:
            seen[pid] = r
    return seen


def _build_row(product, price_rec, fields: list, rec=None) -> list:
    row = []
    for f in fields:
        if f == 'id':
            row.append(str(product.id))
        elif f == 'sku':
            row.append(product.sku or '')
        elif f == 'name':
            row.append(product.name or '')
        elif f == 'category':
            row.append(product.category or '')
        elif f == 'description':
            row.append(product.description or '')
        elif f == 'current_price':
            row.append(float(price_rec.current_price) if price_rec and price_rec.current_price else '')
        elif f == 'old_price':
            row.append(float(price_rec.old_price) if price_rec and price_rec.old_price else '')
        elif f == 'recommended_price':
            row.append(float(rec.recommended_price_with_vat) if rec else '')
        elif f == 'recommended_price_source':
            if rec:
                reasoning = rec.reasoning or {}
                src = reasoning.get('source', '')
                label = 'Simulátor' if src == 'simulator' else 'Doporučení cen'
                row.append(f"{label} ({rec.status})")
            else:
                row.append('')
        elif f == 'created_at':
            row.append(product.created_at.strftime('%Y-%m-%d %H:%M') if getattr(product, 'created_at', None) else '')
        elif f == 'updated_at':
            row.append(product.updated_at.strftime('%Y-%m-%d %H:%M') if getattr(product, 'updated_at', None) else '')
        else:
            row.append('')
    return row


# ── Sdílené query params ──────────────────────────────────────────────────────

def _parse_params(
    fields: Optional[str],
    category: Optional[str],
    market: Optional[str],
    min_price: Optional[float],
    max_price: Optional[float],
    search: Optional[str],
    db: Session,
):
    selected = [f for f in (fields.split(',') if fields else ALL_FIELDS) if f in ALL_FIELDS] or ALL_FIELDS
    products = _get_products(db, category, market, min_price, max_price, search)
    product_ids = [p.id for p in products]
    price_map = _get_price_map(db, product_ids)
    rec_map = _get_recommendation_map(db, product_ids)
    return selected, products, price_map, rec_map


# ── XLSX ─────────────────────────────────────────────────────────────────────

@router.get("/products/xlsx")
def export_products_xlsx(
    fields:    Optional[str]   = Query(None),
    category:  Optional[str]   = Query(None),
    market:    Optional[str]   = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    search:    Optional[str]   = Query(None),
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    selected, products, price_map, rec_map = _parse_params(fields, category, market, min_price, max_price, search, db)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Produkty"

    # Záhlaví
    ws.append([FIELD_LABELS.get(f, f) for f in selected])
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center', vertical='center')

    # Data
    for product in products:
        ws.append(_build_row(product, price_map.get(str(product.id)), selected, rec_map.get(str(product.id))))

    # Šířky sloupců
    widths = {'id': 38, 'name': 30, 'description': 30}
    for i, f in enumerate(selected, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = widths.get(f, 18)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="products-{datetime.now().strftime("%Y-%m-%d")}.xlsx"'},
    )


# ── CSV ──────────────────────────────────────────────────────────────────────

@router.get("/products/csv")
def export_products_csv(
    fields:    Optional[str]   = Query(None),
    category:  Optional[str]   = Query(None),
    market:    Optional[str]   = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    search:    Optional[str]   = Query(None),
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    selected, products, price_map, rec_map = _parse_params(fields, category, market, min_price, max_price, search, db)

    buf = io.StringIO()
    w = csv.writer(buf, quoting=csv.QUOTE_ALL)
    w.writerow([FIELD_LABELS.get(f, f) for f in selected])
    for product in products:
        w.writerow(_build_row(product, price_map.get(str(product.id)), selected, rec_map.get(str(product.id))))

    content = buf.getvalue().encode('utf-8-sig')  # BOM pro Excel
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="products-{datetime.now().strftime("%Y-%m-%d")}.csv"'},
    )


# ── Meta: dostupné kategorie pro filtr UI ────────────────────────────────────

@router.get("/products/meta")
def export_meta(
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Vrátí seznam kategorií a trhů pro filter UI."""
    from sqlalchemy import distinct
    cats = [r[0] for r in db.query(distinct(Product.category)).filter(Product.category.isnot(None)).all()]
    markets = [r[0] for r in db.query(distinct(Price.market)).all()]
    total = db.query(Product).count()
    return {"categories": sorted(cats), "markets": sorted(markets), "total": total}
