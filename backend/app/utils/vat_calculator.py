"""
VAT Calculator - utility pro výpočet cen s DPH
"""

from decimal import Decimal
from typing import Optional, Tuple


def calculate_price_with_vat(
    price_without_vat: Decimal,
    vat_rate: Optional[Decimal] = None
) -> Decimal:
    """
    Vypočítej cenu s DPH

    Args:
        price_without_vat: Cena bez DPH
        vat_rate: Sazba DPH v % (např. 21 pro 21%)

    Returns:
        Cena s DPH zaokrouhlená na 2 desetinná místa
    """
    if not vat_rate or vat_rate <= 0:
        return price_without_vat

    vat_multiplier = 1 + (vat_rate / 100)
    price_with_vat = price_without_vat * vat_multiplier

    # Zaokrouhli na 2 desetinná místa
    return Decimal(str(round(float(price_with_vat), 2)))


def get_vat_amount(
    price_without_vat: Decimal,
    vat_rate: Optional[Decimal] = None
) -> Decimal:
    """
    Vrať samotnou DPH (bez ceny)

    Args:
        price_without_vat: Cena bez DPH
        vat_rate: Sazba DPH v % (např. 21 pro 21%)

    Returns:
        Výše DPH zaokrouhlená na 2 desetinná místa
    """
    if not vat_rate or vat_rate <= 0:
        return Decimal('0.00')

    vat_amount = price_without_vat * (vat_rate / 100)

    # Zaokrouhli na 2 desetinná místa
    return Decimal(str(round(float(vat_amount), 2)))


def get_price_breakdown(
    price_without_vat: Decimal,
    vat_rate: Optional[Decimal] = None
) -> Tuple[Decimal, Decimal, Decimal]:
    """
    Vrať rozpad ceny: cena bez DPH, DPH, cena s DPH

    Args:
        price_without_vat: Cena bez DPH
        vat_rate: Sazba DPH v % (např. 21 pro 21%)

    Returns:
        (cena_bez_dph, vat_amount, cena_s_dph)
    """
    vat_amount = get_vat_amount(price_without_vat, vat_rate)
    price_with_vat = calculate_price_with_vat(price_without_vat, vat_rate)

    return price_without_vat, vat_amount, price_with_vat


def reverse_calculate_price_without_vat(
    price_with_vat: Decimal,
    vat_rate: Optional[Decimal] = None
) -> Decimal:
    """
    Inverzní výpočet - ze ceny s DPH vrátí cenu bez DPH

    Args:
        price_with_vat: Cena s DPH
        vat_rate: Sazba DPH v % (např. 21 pro 21%)

    Returns:
        Cena bez DPH zaokrouhlená na 2 desetinná místa
    """
    if not vat_rate or vat_rate <= 0:
        return price_with_vat

    vat_multiplier = 1 + (vat_rate / 100)
    price_without_vat = price_with_vat / vat_multiplier

    # Zaokrouhli na 2 desetinná místa
    return Decimal(str(round(float(price_without_vat), 2)))
