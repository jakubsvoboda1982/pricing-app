from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, Price
from app.middleware.auth import verify_token
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
import io
import csv
from datetime import datetime
from typing import Optional
from collections import defaultdict

router = APIRouter(prefix="/api/export", tags=["export"])

# Všechna exportovatelná pole
ALL_FIELDS = ['id', 'sku', 'name', 'category', 'description', 'current_price', 'old_price', 'created_at', 'updated_at']

FIELD_LABELS = {
    'id': 'Product ID',
    'sku': 'SKU',
    'name': 'Název',
    'category': 'Kategorie',
    'description': 'Popis',
    'current_price': 'Aktuální cena',
    'old_price': 'Stará cena',
    'created_at': 'Vytvořeno',
    'updated_at': 'Upraveno',
}


def _get_product_prices(db: Session, product_ids: list) -> dict:
    """Načti poslední ceny pro všechny produkty (batch)."""
    from sqlalchemy import func
    prices = {}
    if not product_ids:
        return prices
    # Latest price per product
    latest = (
        db.query(Price)
        .filter(Price.product_id.in_(product_ids))
        .order_by(Price.product_id, Price.created_at.desc())
        .all()
    )
    seen = set()
    for p in latest:
        pid = str(p.product_id)
        if pid not in seen:
            prices[pid] = p
            seen.add(pid)
    return prices


def _build_row(product, price_record, fields: list) -> list:
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
            row.append(float(price_record.current_price) if price_record and price_record.current_price else '')
        elif f == 'old_price':
            row.append(float(price_record.old_price) if price_record and price_record.old_price else '')
        elif f == 'created_at':
            row.append(product.created_at.strftime('%Y-%m-%d %H:%M') if product.created_at else '')
        elif f == 'updated_at':
            row.append(product.updated_at.strftime('%Y-%m-%d %H:%M') if product.updated_at else '')
        else:
            row.append('')
    return row


@router.get("/products/xlsx")
def export_products_xlsx(
    fields: Optional[str] = Query(None, description="Comma-separated field names"),
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Export produktů do XLSX — podporuje výběr sloupců."""
    # Zparsuj vybraná pole
    selected = [f for f in (fields.split(',') if fields else ALL_FIELDS) if f in ALL_FIELDS]
    if not selected:
        selected = ALL_FIELDS

    products = db.query(Product).all()
    price_map = _get_product_prices(db, [p.id for p in products])

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Produkty"

    # Záhlaví
    headers = [FIELD_LABELS.get(f, f) for f in selected]
    sheet.append(headers)

    # Styly záhlaví
    header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    for cell in sheet[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center', vertical='center')

    # Data
    for product in products:
        price_rec = price_map.get(str(product.id))
        row = _build_row(product, price_rec, selected)
        sheet.append(row)

    # Šířky sloupců
    for col_idx, field in enumerate(selected, start=1):
        col_letter = openpyxl.utils.get_column_letter(col_idx)
        if field == 'id':
            sheet.column_dimensions[col_letter].width = 38
        elif field in ('name', 'description'):
            sheet.column_dimensions[col_letter].width = 30
        else:
            sheet.column_dimensions[col_letter].width = 18

    # Uložit do paměti
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)

    filename = f"products-{datetime.now().strftime('%Y-%m-%d')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/products/csv")
def export_products_csv(
    fields: Optional[str] = Query(None, description="Comma-separated field names"),
    token_payload: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Export produktů do CSV — podporuje výběr sloupců."""
    selected = [f for f in (fields.split(',') if fields else ALL_FIELDS) if f in ALL_FIELDS]
    if not selected:
        selected = ALL_FIELDS

    products = db.query(Product).all()
    price_map = _get_product_prices(db, [p.id for p in products])

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_ALL)

    # Záhlaví
    writer.writerow([FIELD_LABELS.get(f, f) for f in selected])

    # Data
    for product in products:
        price_rec = price_map.get(str(product.id))
        row = _build_row(product, price_rec, selected)
        writer.writerow(row)

    content = output.getvalue().encode('utf-8-sig')  # BOM pro Excel UTF-8
    filename = f"products-{datetime.now().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
