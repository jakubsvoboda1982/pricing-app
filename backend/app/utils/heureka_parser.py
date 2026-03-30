"""
Heureka XML Feed Parser
Supports both SHOPITEM (real Heureka CZ/SK format) and legacy ITEM format.
Extracts PRICE_VAT as the selling price (price with VAT).
"""

import xml.etree.ElementTree as ET
from typing import List, Dict, Optional, Tuple
from decimal import Decimal, InvalidOperation
import re


class HeurekaParsError(Exception):
    """Chyba při parsování Heureka feedu"""
    pass


def _get_text(elem: ET.Element, *tags: str) -> Optional[str]:
    """Try multiple tag names and return text of the first found, or None."""
    for tag in tags:
        child = elem.find(tag)
        if child is not None and child.text and child.text.strip():
            return child.text.strip()
    return None


def _get_decimal(elem: ET.Element, *tags: str) -> Optional[Decimal]:
    """Try multiple tag names and return Decimal value, or None."""
    text = _get_text(elem, *tags)
    if not text:
        return None
    # Strip any units/currency (e.g. "12 %" → "12", "266.96 CZK" → "266.96")
    text = re.sub(r'[^\d.,\-]', '', text).replace(',', '.')
    if not text:
        return None
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return None


def _parse_item(item_elem: ET.Element, market: str) -> Tuple[Optional[Dict], List[str]]:
    """
    Parse a single SHOPITEM or ITEM element into a product dict.

    Heureka CZ SHOPITEM fields:
      EAN, PRODUCTNO, PRODUCTNAME, PRODUCT, CATEGORYTEXT, DESCRIPTION,
      URL, IMGURL, PRICE (bez DPH), PRICE_VAT (s DPH), VAT, QUANTITY_UNIT,
      MANUFACTURER, ITEM_ID

    Legacy ITEM fields:
      ID (EAN), PRODUCTNO, TITLE, DESCRIPTION, CATEGORYTEXT/CATEGORYID,
      MANUFACTURER, PRICE_CZK, PRICE_SKK, UNIT, IMGURL, URL,
      STOCK, PARAM[DPH]

    Returns (data_dict, errors).
    """
    errors = []
    data = {}

    # ---- EAN / ID ----
    ean = _get_text(item_elem, 'EAN', 'ID')
    if not ean:
        errors.append("Chybí EAN nebo ID")
    else:
        data['ean'] = ean

    # ---- Product code (PRODUCTNO) ----
    data['product_code'] = _get_text(item_elem, 'PRODUCTNO')

    # ---- Name ----
    name = _get_text(item_elem, 'PRODUCTNAME', 'PRODUCT', 'TITLE')
    if not name:
        errors.append("Chybí název produktu (PRODUCTNAME / TITLE)")
        return None, errors
    data['name'] = name

    # ---- Description ----
    data['description'] = _get_text(item_elem, 'DESCRIPTION')

    # ---- Category ----
    data['category'] = _get_text(item_elem, 'CATEGORYTEXT', 'CATEGORYID')

    # ---- Manufacturer ----
    data['manufacturer'] = _get_text(item_elem, 'MANUFACTURER')

    # ---- Prices ----
    # PRICE_VAT = selling price WITH VAT (user-facing price, what Heureka shows)
    # PRICE     = price WITHOUT VAT
    price_vat = _get_decimal(item_elem, 'PRICE_VAT')
    price_without_vat = _get_decimal(item_elem, 'PRICE', 'PRICE_CZK', 'PRICE_SKK')

    data['price_vat'] = price_vat          # Selling price with VAT (stored for use)
    data['price_without_vat'] = price_without_vat

    if price_vat is None and price_without_vat is None:
        errors.append("Chybí cena (PRICE_VAT nebo PRICE)")
        # Don't abort – price isn't strictly required for catalog import

    # ---- VAT rate ----
    # SHOPITEM format: <VAT>12%</VAT>
    # Legacy format: <PARAM NAME="DPH">21</PARAM>
    vat_text = _get_text(item_elem, 'VAT')
    if not vat_text:
        # Try PARAM elements
        for param in item_elem.findall('PARAM'):
            pname = _get_text(param, 'PARAM_NAME')
            if pname and pname.upper() in ('DPH', 'VAT'):
                vat_text = _get_text(param, 'VAL')
                break
    if vat_text:
        vat_clean = re.sub(r'[^\d.,]', '', vat_text).replace(',', '.')
        try:
            data['vat_rate'] = Decimal(vat_clean)
        except (InvalidOperation, ValueError):
            pass

    # ---- Stock ----
    stock_text = _get_text(item_elem, 'STOCK')
    if stock_text:
        try:
            data['quantity_in_stock'] = int(float(stock_text))
        except (ValueError, TypeError):
            pass

    # ---- Unit ----
    # QUANTITY_UNIT in SHOPITEM can be e.g. "1xks" – normalise to "ks"
    raw_unit = _get_text(item_elem, 'QUANTITY_UNIT', 'UNIT') or 'ks'
    # Strip leading numbers: "1xks" → "ks", "2xpcs" → "pcs"
    unit_match = re.sub(r'^\d+x', '', raw_unit.strip().lower())
    data['unit_of_measure'] = unit_match or 'ks'

    # ---- Media ----
    data['thumbnail_url'] = _get_text(item_elem, 'IMGURL')
    data['url_reference'] = _get_text(item_elem, 'URL')

    return data, errors


class HeureaFeedParser:
    """Parser pro Heureka XML feed – podporuje SHOPITEM i ITEM elementy."""

    def _find_items(self, root: ET.Element) -> List[ET.Element]:
        """Find all product elements regardless of whether they're SHOPITEM or ITEM."""
        # Try SHOPITEM first (real Heureka CZ/SK format)
        items = root.findall('.//SHOPITEM')
        if items:
            return items
        # Fall back to ITEM (legacy / other formats)
        return root.findall('.//ITEM')

    def parse_string(self, xml_string: str, market: str = "CZ") -> Tuple[List[Dict], List[Dict]]:
        """
        Parse XML string and return (products, errors).

        Args:
            xml_string: Raw XML content
            market:     "CZ" or "SK"

        Returns:
            (list[dict], list[error_dicts])
        """
        try:
            root = ET.fromstring(xml_string)
        except ET.ParseError as e:
            raise HeurekaParsError(f"Chyba při parsování XML: {e}")

        item_elements = self._find_items(root)
        if not item_elements:
            raise HeurekaParsError(
                "Nenalezeny žádné produkty v XML. "
                "Očekávány elementy <SHOPITEM> nebo <ITEM>."
            )

        products = []
        errors = []

        for idx, item_elem in enumerate(item_elements, 1):
            data, item_errors = _parse_item(item_elem, market)
            if item_errors and not data:
                errors.append({'row': idx, 'ean': 'N/A', 'errors': item_errors})
                continue
            if data:
                data['market'] = market
                data['imported_from'] = f'heureka_{market.lower()}'
                products.append(data)
            if item_errors:
                errors.append({'row': idx, 'ean': data.get('ean', 'N/A'), 'errors': item_errors})

        return products, errors

    def parse_file(self, file_path: str, market: str = "CZ") -> Tuple[List[Dict], List[Dict]]:
        """Parse XML file."""
        try:
            tree = ET.parse(file_path)
            root = tree.getroot()
        except ET.ParseError as e:
            raise HeurekaParsError(f"Chyba při parsování XML: {e}")
        except FileNotFoundError:
            raise HeurekaParsError(f"Soubor nenalezen: {file_path}")

        item_elements = self._find_items(root)
        if not item_elements:
            raise HeurekaParsError(
                "Nenalezeny žádné produkty v XML. "
                "Očekávány elementy <SHOPITEM> nebo <ITEM>."
            )

        products = []
        errors = []

        for idx, item_elem in enumerate(item_elements, 1):
            data, item_errors = _parse_item(item_elem, market)
            if item_errors and not data:
                errors.append({'row': idx, 'ean': 'N/A', 'errors': item_errors})
                continue
            if data:
                data['market'] = market
                data['imported_from'] = f'heureka_{market.lower()}'
                products.append(data)
            if item_errors:
                errors.append({'row': idx, 'ean': data.get('ean', 'N/A'), 'errors': item_errors})

        return products, errors
