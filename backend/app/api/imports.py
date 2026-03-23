from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product
import openpyxl
import csv
import io

router = APIRouter(prefix="/api/import", tags=["import"])

@router.post("/products")
async def import_products(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Import products from XLSX or CSV file"""

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename")

    contents = await file.read()

    try:
        if file.filename.endswith('.xlsx'):
            workbook = openpyxl.load_workbook(io.BytesIO(contents))
            sheet = workbook.active
            rows = list(sheet.iter_rows(values_only=True))

            # First row is header
            headers = rows[0]
            products = []

            for row in rows[1:]:
                if not row[0]:  # Skip empty rows
                    continue

                product = Product(
                    name=row[0],
                    sku=row[1] if len(row) > 1 else "",
                    category=row[2] if len(row) > 2 else None,
                    description=row[3] if len(row) > 3 else None,
                )
                products.append(product)

            db.add_all(products)
            db.commit()

            return {"message": f"Imported {len(products)} products", "count": len(products)}

        elif file.filename.endswith('.csv'):
            text_data = contents.decode('utf-8')
            reader = csv.reader(io.StringIO(text_data))

            headers = next(reader)
            products = []

            for row in reader:
                if not row[0]:
                    continue

                product = Product(
                    name=row[0],
                    sku=row[1] if len(row) > 1 else "",
                    category=row[2] if len(row) > 2 else None,
                    description=row[3] if len(row) > 3 else None,
                )
                products.append(product)

            db.add_all(products)
            db.commit()

            return {"message": f"Imported {len(products)} products", "count": len(products)}

        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file format")

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
