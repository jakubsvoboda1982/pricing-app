from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import CatalogProduct, Company
from app.schemas.catalog_product import CatalogProductResponse, CatalogProductCreate
from uuid import UUID
import openpyxl
from io import BytesIO
from decimal import Decimal

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/products", response_model=list[CatalogProductResponse])
def get_catalog_products(
    db: Session = Depends(get_db),
    category: str = None,
    search: str = None,
    skip: int = 0,
    limit: int = 100
):
    """Získej produkty z katalogu s filtrem"""
    query = db.query(CatalogProduct)

    if category:
        query = query.filter(CatalogProduct.category == category)

    if search:
        query = query.filter(
            CatalogProduct.name.ilike(f"%{search}%") |
            CatalogProduct.ean.ilike(f"%{search}%") |
            CatalogProduct.category.ilike(f"%{search}%")
        )

    return query.offset(skip).limit(limit).all()


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """Získej seznam všech kategorií v katalogu"""
    categories = db.query(CatalogProduct.category).distinct().filter(
        CatalogProduct.category.isnot(None)
    ).all()
    return [cat[0] for cat in categories]


@router.post("/import")
def import_catalog_from_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Importuj produkty z Excel souboru do katalogu"""
    try:
        # Načti Excel soubor
        contents = file.file.read()
        wb = openpyxl.load_workbook(BytesIO(contents))
        ws = wb.active

        # Najdi company pro přihlášeného uživatele - zatím použij první
        company = db.query(Company).first()
        if not company:
            raise HTTPException(status_code=400, detail="Žádná společnost v systému")

        # Parsuj řádky
        imported_count = 0
        skipped_count = 0
        errors = []

        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), 2):
            try:
                # Načti hodnoty ze sloupců
                # A: Kód, B: EAN, C: ISBN, D: Výrobce, E: Kategorie, G: Název, H: Aktivní, I: DPH, J: Cena, K: Nákupní cena, L: Počet skladem, M: M.j.
                code = row[0].value if row[0] else None  # A
                ean = str(row[1].value).strip() if row[1] and row[1].value else None  # B - konvertuj na string ihned
                isbn = str(row[2].value).strip() if row[2] and row[2].value else None  # C
                manufacturer = str(row[3].value).strip() if row[3] and row[3].value else None  # D
                category = str(row[4].value).strip() if row[4] and row[4].value else None  # E
                # F je skipped
                name = str(row[6].value).strip() if row[6] and row[6].value else None  # G
                is_active_str = str(row[7].value).strip() if row[7] and row[7].value else "Ano"  # H

                if not name:
                    skipped_count += 1
                    continue

                vat_rate = row[8].value if row[8] else None  # I
                price_without_vat = row[9].value if row[9] else None  # J
                purchase_price = row[10].value if row[10] else None  # K
                quantity_in_stock = row[11].value if row[11] else None  # L
                unit_of_measure = str(row[12].value).strip() if row[12] and row[12].value else "ks"  # M

                # Konvertuj aktivní status
                is_active = is_active_str.lower() in ["ano", "yes", "true", "1", "y"]

                # Zkontroluj duplikát - s konvertovaným EAN na string
                existing = db.query(CatalogProduct).filter_by(ean=ean, company_id=company.id).first() if ean else None
                if existing and ean:
                    # Aktualizuj existující produkt
                    existing.name = name
                    existing.category = category
                    existing.manufacturer = manufacturer
                    existing.vat_rate = Decimal(str(vat_rate)) if vat_rate else None
                    existing.price_without_vat = Decimal(str(price_without_vat)) if price_without_vat else None
                    existing.purchase_price = Decimal(str(purchase_price)) if purchase_price else None
                    existing.quantity_in_stock = int(quantity_in_stock) if quantity_in_stock else None
                    existing.unit_of_measure = unit_of_measure
                    existing.is_active = is_active
                    db.commit()
                else:
                    # Vytvoř nový produkt
                    catalog_product = CatalogProduct(
                        company_id=company.id,
                        ean=ean,  # Už je string
                        isbn=isbn,  # Už je string nebo None
                        name=name,  # Už je string
                        category=category,  # Už je string nebo None
                        manufacturer=manufacturer,  # Už je string nebo None
                        vat_rate=Decimal(str(vat_rate)) if vat_rate else None,
                        price_without_vat=Decimal(str(price_without_vat)) if price_without_vat else None,
                        purchase_price=Decimal(str(purchase_price)) if purchase_price else None,
                        quantity_in_stock=int(quantity_in_stock) if quantity_in_stock else None,
                        unit_of_measure=unit_of_measure,
                        is_active=is_active,
                        catalog_identifier=f"{company.id}_{ean}" if ean else None
                    )
                    db.add(catalog_product)
                    db.commit()

                imported_count += 1

            except Exception as e:
                skipped_count += 1
                errors.append(f"Řádek {row_idx}: {str(e)}")
                continue

        return {
            "status": "success",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": errors[:10]  # Vrať prvních 10 chyb
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
