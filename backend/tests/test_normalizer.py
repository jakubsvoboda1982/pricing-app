"""
Unit testy pro normalizační vrstvu.
Spuštění: pytest backend/tests/test_normalizer.py -v
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.normalization.normalizer import (
    normalize_text,
    extract_weight_g,
    extract_canonical,
    derive_matching_profile,
    build_product_profile,
)


# ── normalize_text ─────────────────────────────────────────────────────────────

class TestNormalizeText:
    def test_lowercase(self):
        assert normalize_text("KEŠU") == "kesu"

    def test_removes_diacritics(self):
        assert normalize_text("kešu") == "kesu"
        assert normalize_text("pražené") == "prazene"
        assert normalize_text("solené") == "solene"
        assert normalize_text("lyofilizované") == "lyofilizovane"

    def test_cleans_whitespace(self):
        assert normalize_text("kešu  ořechy   500g") == "kesu orechy 500g"

    def test_slovak_diacritics(self):
        assert normalize_text("lieskovce") == "lieskovce"
        assert normalize_text("slivky") == "slivky"


# ── extract_weight_g ───────────────────────────────────────────────────────────

class TestExtractWeightG:
    def test_grams(self):
        assert extract_weight_g("Kešu 500 g") == 500
        assert extract_weight_g("Mandle 250g") == 250
        assert extract_weight_g("Pistácie 100g") == 100

    def test_kilograms(self):
        assert extract_weight_g("Kešu pražené 1 kg") == 1000
        assert extract_weight_g("Mandle 1,5 kg") == 1500
        assert extract_weight_g("Vlašské ořechy 0.5kg") == 500
        assert extract_weight_g("Arašídy 2 kg") == 2000

    def test_multipack(self):
        assert extract_weight_g("Kešu 3x200g") == 600
        assert extract_weight_g("Mandle 6 x 50 g") == 300
        assert extract_weight_g("Lyofilizované jahody 2×100g") == 200

    def test_no_weight(self):
        assert extract_weight_g("Kešu ořechy natural") is None
        assert extract_weight_g("Mix ořechů") is None

    def test_kg_variants(self):
        assert extract_weight_g("Kešu W320 1kg") == 1000
        assert extract_weight_g("Kešu solené 1,5kg") == 1500


# ── extract_canonical ──────────────────────────────────────────────────────────

class TestExtractCanonical:

    def test_cashew_roasted_salted(self):
        attrs = extract_canonical("Kešu pražené solené 1 kg")
        assert attrs.ingredient == "cashew"
        assert "roasted" in attrs.processing
        assert "salted" in attrs.processing
        assert attrs.target_weight_g == 1000

    def test_almonds_natural(self):
        attrs = extract_canonical("Mandle natural 500 g")
        assert attrs.ingredient == "almonds"
        assert "natural" in attrs.processing
        assert attrs.target_weight_g == 500

    def test_dark_chocolate(self):
        attrs = extract_canonical("Kešu v hořké čokoládě 500 g")
        assert attrs.ingredient == "cashew"
        assert "dark_chocolate" in attrs.coatings
        assert attrs.target_weight_g == 500

    def test_freeze_dried_strawberries(self):
        attrs = extract_canonical("Lyofilizované jahody 100 g")
        assert attrs.ingredient == "strawberries"
        assert "freeze_dried" in attrs.processing
        assert attrs.target_weight_g == 100

    def test_pistachios_roasted_salted(self):
        attrs = extract_canonical("Pistácie pražené solené 250 g")
        assert attrs.ingredient == "pistachios"
        assert "roasted" in attrs.processing
        assert "salted" in attrs.processing

    def test_walnuts(self):
        attrs = extract_canonical("Vlašské ořechy 500 g Natural Pack")
        assert attrs.ingredient == "walnuts"

    def test_cashew_no_weight(self):
        attrs = extract_canonical("Kešu natural")
        assert attrs.ingredient == "cashew"
        assert attrs.target_weight_g is None

    def test_slovak_cashew(self):
        """SK varianta – normalize_text odstraní diakritiku"""
        attrs = extract_canonical("Kešu oriešky pražené solené 1 kg")
        assert attrs.ingredient == "cashew"
        assert "roasted" in attrs.processing

    def test_bio(self):
        attrs = extract_canonical("Mandle BIO 500 g")
        assert attrs.ingredient == "almonds"
        assert "bio" in attrs.extras

    def test_mango_dried(self):
        attrs = extract_canonical("Mango sušené plátky 500 g")
        assert attrs.ingredient == "mango"
        assert "dried" in attrs.processing


# ── derive_matching_profile ────────────────────────────────────────────────────

class TestMatchingProfile:

    def test_cashew_roasted_salted_profile(self):
        attrs = extract_canonical("Kešu pražené solené 1 kg")
        profile = derive_matching_profile(attrs)
        assert "cashew" in profile.must_have_terms
        assert "roasted" in profile.must_have_terms
        assert "salted" in profile.must_have_terms
        # must_not: solené → unsalted musí být v must_not
        assert "unsalted" in profile.must_not_have_terms
        # should_have: gramáž
        assert any("1kg" in t or "1000g" in t for t in profile.should_have_terms)

    def test_dark_chocolate_profile(self):
        attrs = extract_canonical("Kešu v hořké čokoládě 500 g")
        profile = derive_matching_profile(attrs)
        assert "dark_chocolate" in profile.must_have_terms
        # Ostatní čokolády musí být v must_not
        assert "milk_chocolate" in profile.must_not_have_terms
        assert "white_chocolate" in profile.must_not_have_terms

    def test_natural_profile(self):
        attrs = extract_canonical("Mandle natural 500 g")
        profile = derive_matching_profile(attrs)
        assert "almonds" in profile.must_have_terms
        # Natural se nedává do must_have (je to default)
        assert "natural" not in profile.must_have_terms
        # roasted musí být v must_not
        assert "roasted" in profile.must_not_have_terms

    def test_freeze_dried_profile(self):
        attrs = extract_canonical("Lyofilizované jahody 100 g")
        profile = derive_matching_profile(attrs)
        assert "strawberries" in profile.must_have_terms
        assert "freeze_dried" in profile.must_have_terms
        # Sušené vs lyofilizované jsou konflikt
        assert "dried" in profile.must_not_have_terms


# ── build_product_profile (integration) ──────────────────────────────────────

class TestBuildProductProfile:

    def test_full_pipeline(self):
        attrs, profile = build_product_profile(
            name="Kešu pražené solené W320 1 kg",
            category="Ořechy a semínka | Kešu",
            manufacturer="Natural Pack",
        )
        assert attrs.ingredient == "cashew"
        assert "roasted" in attrs.processing
        assert "salted" in attrs.processing
        assert attrs.target_weight_g == 1000
        assert "cashew" in profile.must_have_terms
        assert "unsalted" in profile.must_not_have_terms

    def test_serialization(self):
        attrs, profile = build_product_profile("Mandle uzené 500 g")
        d = attrs.to_dict()
        assert "ingredient" in d
        assert "processing" in d
        assert d["ingredient"] == "almonds"
        assert "smoked" in d["processing"]
