"""
Normalizační vrstva pro produkty ořechy / sušené ovoce / čokolády.

Hlavní funkce:
  normalize_text()        – lowercase, bez diakritiky, clean whitespace
  extract_weight_g()      – gramáž z textu → int gramů
  extract_canonical()     – plná extrakce atributů z názvu/kategorie/popisu
  derive_matching_profile()  – odvození must_have / must_not / should_have termů

Používá slovník synonym z synonyms.py.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

from app.normalization.synonyms import (
    INGREDIENTS, PROCESSING, FLAVORS, COATINGS, PACKAGING, EXTRAS,
    MARKETING_NOISE, PROCESSING_CONFLICTS, COATING_CONFLICTS,
)


# ── Textová normalizace ────────────────────────────────────────────────────────

def _strip_diacritics(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalize_text(text: str) -> str:
    """
    Základní normalizace: lowercase, bez diakritiky, sjednocení whitespace.
    Zachovává číslice, písmena, pomlčky a tečky – vše ostatní → mezera.
    """
    t = text.lower()
    t = _strip_diacritics(t)
    t = re.sub(r"[^\w\s\-.,×x]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def tokenize(text: str) -> list[str]:
    """Normalizuj a rozdělj na tokeny."""
    return normalize_text(text).split()


# ── Extrakce gramáže ───────────────────────────────────────────────────────────

_MULTI_RE = re.compile(
    r"(\d+)\s*[x×]\s*(\d+[.,]?\d*)\s*(kg|g)\b",
    re.IGNORECASE
)
_SINGLE_KG_RE = re.compile(
    r"(\d+[.,]?\d*)\s*kg\b",
    re.IGNORECASE
)
_SINGLE_G_RE = re.compile(
    r"(\d+[.,]?\d*)\s*g\b(?!r)",  # ne "gr." (grains apod.)
    re.IGNORECASE
)


def extract_weight_g(text: str) -> Optional[int]:
    """
    Extrahuje gramáž z textu a vrátí int gramů.

    Podporované formáty:
      3x200g   → 600
      6 x 50 g → 300
      2×250g   → 500
      1 kg     → 1000
      1,5 kg   → 1500
      500 g    → 500
      0.5kg    → 500
    """
    t = normalize_text(text)

    # Vícenásobné balení: NxMkg / NxMg
    m = _MULTI_RE.search(t)
    if m:
        count = int(m.group(1))
        qty = float(m.group(2).replace(",", "."))
        unit = m.group(3).lower()
        grams = qty * 1000 if unit == "kg" else qty
        return round(count * grams)

    # Kilogramy
    m = _SINGLE_KG_RE.search(t)
    if m:
        val = float(m.group(1).replace(",", "."))
        return round(val * 1000)

    # Gramy
    m = _SINGLE_G_RE.search(t)
    if m:
        val = float(m.group(1).replace(",", "."))
        return round(val)

    return None


# ── Extrakce tokenů oproti slovníkům ──────────────────────────────────────────

def _match_dict(normalized_text: str, mapping: dict[str, str]) -> list[str]:
    """
    Najde všechny hodnoty ze slovníku mapping, jejichž klíč se vyskytuje
    v normalized_text jako podřetězec (whole-word nebo phrase match).
    Vrátí deduplikovaný seznam canonical hodnot, seřazený od nejdelšího klíče.
    """
    found: list[str] = []
    seen: set[str] = set()

    # Seřadit klíče od nejdelšího (multi-word fraze mají přednost)
    sorted_keys = sorted(mapping.keys(), key=len, reverse=True)

    for key in sorted_keys:
        # Word-boundary match pro jednoslovné klíče; pro víceslovné stačí podřetězec
        if " " in key:
            if key in normalized_text:
                val = mapping[key]
                if val not in seen:
                    found.append(val)
                    seen.add(val)
        else:
            pattern = r"\b" + re.escape(key) + r"\b"
            if re.search(pattern, normalized_text):
                val = mapping[key]
                if val not in seen:
                    found.append(val)
                    seen.add(val)

    return found


# ── Canonical atributy ─────────────────────────────────────────────────────────

@dataclass
class CanonicalAttributes:
    ingredient: Optional[str] = None        # Hlavní surovina (jedna)
    processing: list[str] = field(default_factory=list)   # Zpracování (může být více)
    flavors: list[str] = field(default_factory=list)       # Chutě / koření
    coatings: list[str] = field(default_factory=list)      # Povlak
    packaging: Optional[str] = None         # Typ balení
    extras: list[str] = field(default_factory=list)        # Bio, vegan, …
    target_weight_g: Optional[int] = None   # Odvozená gramáž
    normalized_name: str = ""               # Čistý název po normalizaci

    def to_dict(self) -> dict:
        return {
            "ingredient": self.ingredient,
            "processing": self.processing,
            "flavors": self.flavors,
            "coatings": self.coatings,
            "packaging": self.packaging,
            "extras": self.extras,
            "target_weight_g": self.target_weight_g,
            "normalized_name": self.normalized_name,
        }


def extract_canonical(
    name: str,
    category: Optional[str] = None,
    manufacturer: Optional[str] = None,
    description: Optional[str] = None,
) -> CanonicalAttributes:
    """
    Hlavní funkce: z názvu (+ volitelně kategorie/popisu) extrahuje
    canonical atributy produktu.

    Priority:
      - název produktu má nejvyšší prioritu
      - kategorie pomáhá potvrdit ingredient
      - popis se použije jako záloha pro processing/extras
    """
    attrs = CanonicalAttributes()

    # Normalizuj všechny vstupní texty
    norm_name = normalize_text(name)
    norm_cat = normalize_text(category) if category else ""
    norm_desc = normalize_text(description[:300]) if description else ""  # prvních 300 znaků

    # Kombinovaný text pro hledání (název má větší váhu – opakujeme ho)
    combined = f"{norm_name} {norm_name} {norm_cat} {norm_desc}".strip()

    # ── Gramáž ───────────────────────────────────────────────────────────────
    attrs.target_weight_g = extract_weight_g(name) or extract_weight_g(norm_cat or "")

    # ── Hlavní surovina ───────────────────────────────────────────────────────
    candidates = _match_dict(combined, INGREDIENTS)
    if candidates:
        # Preferuj výskyt v názvu produktu
        name_candidates = _match_dict(norm_name, INGREDIENTS)
        attrs.ingredient = name_candidates[0] if name_candidates else candidates[0]

    # ── Zpracování ────────────────────────────────────────────────────────────
    attrs.processing = _match_dict(combined, PROCESSING)

    # ── Chutě ─────────────────────────────────────────────────────────────────
    attrs.flavors = _match_dict(combined, FLAVORS)

    # ── Povlak ────────────────────────────────────────────────────────────────
    # Speciální logika: "čokoláda" v textu → nutno rozlišit typ
    coating_raw = _match_dict(combined, COATINGS)
    # Pokud máme specifický typ (dark/milk/white) + generic "chocolate", zachej specifický
    specific_coatings = [c for c in coating_raw if c != "chocolate"]
    if specific_coatings:
        attrs.coatings = specific_coatings
    elif coating_raw:
        attrs.coatings = coating_raw

    # ── Balení ────────────────────────────────────────────────────────────────
    pkgs = _match_dict(combined, PACKAGING)
    attrs.packaging = pkgs[0] if pkgs else None

    # ── Extras ────────────────────────────────────────────────────────────────
    attrs.extras = _match_dict(combined, EXTRAS)

    # ── Normalized name (bez noise slov, bez gramáže) ─────────────────────────
    tokens = norm_name.split()
    clean_tokens = [t for t in tokens if t not in MARKETING_NOISE and len(t) > 1]
    attrs.normalized_name = " ".join(clean_tokens)

    return attrs


# ── Matching profil ────────────────────────────────────────────────────────────

@dataclass
class MatchingProfile:
    """
    Odvozený matching profil pro watched product.
    Ukládá se do polí must_have_terms_json, should_have_terms_json,
    must_not_have_terms_json na modelu Product.
    """
    must_have_terms: list[str] = field(default_factory=list)
    should_have_terms: list[str] = field(default_factory=list)
    must_not_have_terms: list[str] = field(default_factory=list)


def derive_matching_profile(attrs: CanonicalAttributes) -> MatchingProfile:
    """
    Z canonical atributů odvozí must_have / should_have / must_not_have termy.

    Logika:
      must_have:
        - ingredient (pokud znám)
        - všechna processing s výjimkou "natural" (to je default)
        - všechna coatings

      should_have:
        - alternativní zápisy gramáže
        - flavors (jsou přidatelné, ale ne required)

      must_not_have:
        - protiklady processing (salted → unsalted, roasted → natural/raw)
        - protiklady coating (dark_chocolate → milk_chocolate, white_chocolate)
    """
    profile = MatchingProfile()

    # must_have: ingredient
    if attrs.ingredient and attrs.ingredient not in ("mixed_nuts", "trail_mix"):
        profile.must_have_terms.append(attrs.ingredient)

    # must_have: processing (kromě "natural" - to je default když nic není)
    for proc in attrs.processing:
        if proc not in ("natural",):
            profile.must_have_terms.append(proc)

    # must_have: coatings
    for coat in attrs.coatings:
        profile.must_have_terms.append(coat)

    # should_have: gramáž varianty
    if attrs.target_weight_g:
        g = attrs.target_weight_g
        if g >= 1000 and g % 1000 == 0:
            kg = g // 1000
            profile.should_have_terms.append(f"{kg}kg")
            profile.should_have_terms.append(f"{g}g")
        elif g >= 1000:
            profile.should_have_terms.append(f"{g}g")
            profile.should_have_terms.append(f"{g/1000:.1f}kg".replace(".0", ""))
        else:
            profile.should_have_terms.append(f"{g}g")

    # should_have: flavors
    profile.should_have_terms.extend(attrs.flavors)

    # must_not_have: processing konflikty
    for proc in attrs.processing:
        for (a, b) in PROCESSING_CONFLICTS:
            if a == proc and b not in attrs.processing:
                profile.must_not_have_terms.append(b)

    # must_not_have: coating konflikty
    for coat in attrs.coatings:
        for (a, b) in COATING_CONFLICTS:
            if a == coat and b not in attrs.coatings:
                if b not in profile.must_not_have_terms:
                    profile.must_not_have_terms.append(b)

    # Deduplikace
    profile.must_have_terms = list(dict.fromkeys(profile.must_have_terms))
    profile.should_have_terms = list(dict.fromkeys(profile.should_have_terms))
    profile.must_not_have_terms = list(dict.fromkeys(profile.must_not_have_terms))

    return profile


# ── Hlavní entry point ─────────────────────────────────────────────────────────

def build_product_profile(
    name: str,
    category: Optional[str] = None,
    manufacturer: Optional[str] = None,
    description: Optional[str] = None,
) -> tuple[CanonicalAttributes, MatchingProfile]:
    """
    Kompletní pipeline: vstupní data → canonical attrs + matching profile.
    Vrátí tuple (CanonicalAttributes, MatchingProfile).

    Použití v catalog.py při importu feedu nebo v products.py při přidání produktu.
    """
    attrs = extract_canonical(name, category, manufacturer, description)
    profile = derive_matching_profile(attrs)
    return attrs, profile


# ── Unit price výpočet ─────────────────────────────────────────────────────────

def compute_unit_price_per_kg(price: float, weight_g: int) -> Optional[float]:
    """Vypočítá cenu za kg (pro benchmarking). Vrátí None pokud nelze."""
    if not price or not weight_g or weight_g <= 0:
        return None
    return round(price / weight_g * 1000, 2)
