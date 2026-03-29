"""
Heureka XML Feed Parser
Parsování Heureka feedu ve formátu XML s ITEM elementy
"""

import xml.etree.ElementTree as ET
from typing import List, Dict, Optional, Tuple
from decimal import Decimal
import re


class HeurekaParsError(Exception):
    """Chyba při parsování Heureka feedu"""
    pass


class HeureaItem:
    """Reprezentace jednoho produktu z Heureka feedu"""

    def __init__(self, item_element: ET.Element):
        self.raw = item_element
        self.errors: List[str] = []

    def get_text(self, tag: str) -> Optional[str]:
        """Bezpečně získej text z XML elementu"""
        elem = self.raw.find(tag)
        if elem is not None and elem.text:
            return elem.text.strip()
        return None

    def get_float(self, tag: str) -> Optional[Decimal]:
        """Bezpečně získej float/decimal z XML elementu"""
        text = self.get_text(tag)
        if not text:
            return None
        try:
            # Nahraď čárku tečkou pro český formát
            text = text.replace(',', '.')
            return Decimal(text)
        except (ValueError, TypeError):
            return None

    def get_param(self, name: str) -> Optional[str]:
        """Získej hodnotu z PARAM elementu podle NAME atributu"""
        for param in self.raw.findall('PARAM'):
            if param.get('NAME') == name:
                return param.text.strip() if param.text else None
        return None

    def parse(self) -> Tuple[Dict, List[str]]:
        """
        Parsuj ITEM element a vrať dict s daty + seznam chyb

        Returns:
            (dict, errors) - dict s extrahovanými daty nebo chybami při parsování
        """
        data = {}
        errors = []

        # Povinné pole: ID (EAN)
        ean = self.get_text('ID')
        if not ean:
            errors.append("Chybí ID (EAN)")
            return data, errors
        data['ean'] = ean

        # Povinné pole: TITLE (název)
        title = self.get_text('TITLE')
        if not title:
            errors.append("Chybí TITLE (název)")
            return data, errors
        data['name'] = title

        # Nepovinné pole: DESCRIPTION
        data['description'] = self.get_text('DESCRIPTION')

        # Kategorie: CATEGORYTEXT (text) nebo CATEGORYID (ID)
        data['category'] = self.get_text('CATEGORYTEXT') or self.get_text('CATEGORYID')

        # Výrobce: MANUFACTURER
        data['manufacturer'] = self.get_text('MANUFACTURER')

        # Cena: PRICE_CZK (pro CZ) nebo PRICE_SKK (pro SK)
        # Uloží se bez DPH, DPH sazba se vezme z PARAM
        price_czk = self.get_float('PRICE_CZK')
        price_skk = self.get_float('PRICE_SKK')

        if price_czk:
            data['price_without_vat'] = price_czk
            data['currency'] = 'CZK'
        elif price_skk:
            data['price_without_vat'] = price_skk
            data['currency'] = 'SKK'
        else:
            errors.append("Chybí cena (PRICE_CZK nebo PRICE_SKK)")

        # DPH sazba: hledej v PARAM NAME="DPH"
        vat_text = self.get_param('DPH')
        if vat_text:
            try:
                # Očekává se format "21" nebo "21%"
                vat_clean = vat_text.replace('%', '').strip()
                data['vat_rate'] = Decimal(vat_clean)
            except (ValueError, TypeError):
                errors.append(f"Neplatná DPH sazba: {vat_text}")

        # Sklad: STOCK (počet) - pokud > 0, znamená skladovost
        stock = self.get_text('STOCK')
        if stock:
            try:
                data['quantity_in_stock'] = int(float(stock))
            except (ValueError, TypeError):
                pass

        # Jednotka měření: UNIT
        data['unit_of_measure'] = self.get_text('UNIT') or 'ks'

        # Obrázek: IMGURL
        data['thumbnail_url'] = self.get_text('IMGURL')

        # Odkaz na produkt: URL
        data['url_reference'] = self.get_text('URL')

        return data, errors


class HeureaFeedParser:
    """Parser pro Heureka XML feed"""

    def __init__(self):
        self.items: List[HeureaItem] = []
        self.errors: List[str] = []

    def parse_file(self, file_path: str, market: str = "CZ") -> Tuple[List[Dict], List[Dict]]:
        """
        Parsuj XML soubor s Heureka feedem

        Args:
            file_path: Cesta k XML souboru
            market: "CZ" nebo "SK"

        Returns:
            (products, errors) - seznam produktů a seznam chyb
        """
        try:
            tree = ET.parse(file_path)
            root = tree.getroot()
        except ET.ParseError as e:
            raise HeurekaParsError(f"Chyba při parsování XML: {e}")
        except FileNotFoundError:
            raise HeurekaParsError(f"Soubor nenalezen: {file_path}")

        # Heureka feed má ITEM elementy v rootu nebo v SHOP elementu
        items_elements = root.findall('.//ITEM')
        if not items_elements:
            raise HeurekaParsError("Nenalezeny žádné ITEM elementy v XML")

        products = []
        errors = []

        for idx, item_elem in enumerate(items_elements, 1):
            heureka_item = HeureaItem(item_elem)
            data, item_errors = heureka_item.parse()

            if item_errors:
                errors.append({
                    'row': idx,
                    'ean': data.get('ean', 'N/A'),
                    'errors': item_errors
                })
                continue

            # Přidej market a source
            data['market'] = market
            data['imported_from'] = f'heureka_{market.lower()}'

            products.append(data)

        return products, errors

    def parse_string(self, xml_string: str, market: str = "CZ") -> Tuple[List[Dict], List[Dict]]:
        """
        Parsuj XML ze stringu

        Args:
            xml_string: XML obsah jako string
            market: "CZ" nebo "SK"

        Returns:
            (products, errors)
        """
        try:
            root = ET.fromstring(xml_string)
        except ET.ParseError as e:
            raise HeurekaParsError(f"Chyba při parsování XML: {e}")

        # Heureka feed má ITEM elementy v rootu nebo v SHOP elementu
        items_elements = root.findall('.//ITEM')
        if not items_elements:
            raise HeurekaParsError("Nenalezeny žádné ITEM elementy v XML")

        products = []
        errors = []

        for idx, item_elem in enumerate(items_elements, 1):
            heureka_item = HeureaItem(item_elem)
            data, item_errors = heureka_item.parse()

            if item_errors:
                errors.append({
                    'row': idx,
                    'ean': data.get('ean', 'N/A'),
                    'errors': item_errors
                })
                continue

            # Přidej market a source
            data['market'] = market
            data['imported_from'] = f'heureka_{market.lower()}'

            products.append(data)

        return products, errors
