from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, Price
import openpyxl
from openpyxl.styles import Font, PatternFill
import io
from datetime import datetime

router = APIRouter(prefix="/api/export", tags=["export"])

@router.get("/products/xlsx")
def export_products_xlsx(db: Session = Depends(get_db)):
    """Export all products to XLSX"""
    products = db.query(Product).all()

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Products"

    # Headers
    headers = ["Product ID", "SKU", "Name", "Category", "Description", "Created At", "Updated At"]
    sheet.append(headers)

    # Style headers
    header_fill = PatternFill(start_color="3F51B5", end_color="3F51B5", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")

    for cell in sheet[1]:
        cell.fill = header_fill
        cell.font = header_font

    # Data
    for product in products:
        sheet.append([
            str(product.id),
            product.sku,
            product.name,
            product.category or "",
            product.description or "",
            product.created_at.isoformat() if product.created_at else "",
            product.updated_at.isoformat() if product.updated_at else "",
        ])

    # Save to bytes
    output = io.BytesIO()
    workbook.save(output)
    output.seek(0)

    return FileResponse(
        io.BytesIO(output.getvalue()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"products-{datetime.now().strftime('%Y%m%d-%H%M%S')}.xlsx"
    )

@router.get("/products/csv")
def export_products_csv(db: Session = Depends(get_db)):
    """Export all products to CSV"""
    import csv

    products = db.query(Product).all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Headers
    writer.writerow(["Product ID", "SKU", "Name", "Category", "Description", "Created At", "Updated At"])

    # Data
    for product in products:
        writer.writerow([
            str(product.id),
            product.sku,
            product.name,
            product.category or "",
            product.description or "",
            product.created_at.isoformat() if product.created_at else "",
            product.updated_at.isoformat() if product.updated_at else "",
        ])

    return FileResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        filename=f"products-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    )
