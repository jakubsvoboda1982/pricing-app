"""
Unit testy pro scoring engine.
Spuštění: pytest backend/tests/test_scoring.py -v
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.scoring.engine import (
    WatchedProductProfile,
    CandidateProfile,
    ScoringResult,
    score_candidate,
    score_all_candidates,
    _jaccard_similarity,
    _weight_deviation_pct,
)


# ── Helpers pro tvorbu profilů ────────────────────────────────────────────────

def make_watched(
    name="Kešu pražené solené 1 kg",
    ingredient="cashew",
    processing=None,
    coatings=None,
    flavors=None,
    target_weight_g=1000,
    compare_by_unit_price=True,
    weight_tolerance_percent=20.0,
    must_have_terms=None,
    must_not_have_terms=None,
    should_have_terms=None,
) -> WatchedProductProfile:
    return WatchedProductProfile(
        product_id="test-watched",
        name=name,
        ingredient=ingredient,
        processing=processing or ["roasted", "salted"],
        coatings=coatings or [],
        flavors=flavors or [],
        target_weight_g=target_weight_g,
        compare_by_unit_price=compare_by_unit_price,
        weight_tolerance_percent=weight_tolerance_percent,
        must_have_terms=must_have_terms or ["cashew", "roasted", "salted"],
        must_not_have_terms=must_not_have_terms or ["unsalted", "natural"],
        should_have_terms=should_have_terms or ["1kg", "1000g"],
    )


def make_candidate(
    name_raw="Kešu ořechy pražené solené 1 kg Grizly",
    ingredient="cashew",
    processing=None,
    coatings=None,
    flavors=None,
    weight_g=1000,
    price_value=299.0,
    unit_price_per_kg=299.0,
    has_structured_data=True,
    is_available=True,
    candidate_id="test-candidate",
    name_normalized=None,
) -> CandidateProfile:
    return CandidateProfile(
        candidate_id=candidate_id,
        competitor_id="test-competitor",
        name_raw=name_raw,
        name_normalized=name_normalized if name_normalized is not None else name_raw.lower(),
        ingredient=ingredient,
        processing=processing or ["roasted", "salted"],
        coatings=coatings or [],
        flavors=flavors or [],
        weight_g=weight_g,
        price_value=price_value,
        unit_price_per_kg=unit_price_per_kg,
        has_structured_data=has_structured_data,
        is_available=is_available,
    )


# ── Pomocné funkce ─────────────────────────────────────────────────────────────

class TestHelpers:
    def test_jaccard_same(self):
        sim = _jaccard_similarity("kešu pražené solené", "kešu pražené solené")
        assert sim == 1.0

    def test_jaccard_partial(self):
        sim = _jaccard_similarity("kešu pražené solené 1kg", "kešu pražené 1kg")
        assert 0.5 < sim < 1.0

    def test_jaccard_different(self):
        sim = _jaccard_similarity("kešu pražené", "mandle natural")
        assert sim < 0.3

    def test_weight_deviation_exact(self):
        assert _weight_deviation_pct(1000, 1000) == 0.0

    def test_weight_deviation_10pct(self):
        assert abs(_weight_deviation_pct(1000, 900) - 10.0) < 0.01

    def test_weight_deviation_50pct(self):
        assert _weight_deviation_pct(1000, 500) == 50.0


# ── Hard filters ───────────────────────────────────────────────────────────────

class TestHardFilters:

    def test_ingredient_mismatch_is_reject(self):
        watched = make_watched(ingredient="cashew")
        candidate = make_candidate(ingredient="almonds")
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is True
        assert "ingredient mismatch" in result.hard_reject_reason

    def test_must_not_have_term_reject(self):
        watched = make_watched(must_not_have_terms=["unsalted"])
        candidate = make_candidate(name_raw="Kešu unsalted 1 kg")
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is True
        assert "must_not_have" in result.hard_reject_reason

    def test_processing_conflict_salted_vs_unsalted(self):
        watched = make_watched(processing=["salted"])
        candidate = make_candidate(processing=["unsalted"])
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is True

    def test_processing_conflict_roasted_vs_natural(self):
        watched = make_watched(processing=["roasted"])
        candidate = make_candidate(processing=["natural"])
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is True

    def test_coating_conflict_dark_vs_white(self):
        watched = make_watched(
            processing=[], coatings=["dark_chocolate"],
            must_not_have_terms=["white_chocolate"],
        )
        candidate = make_candidate(processing=[], coatings=["white_chocolate"])
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is True

    def test_freeze_dried_vs_dried_is_reject(self):
        watched = make_watched(
            ingredient="strawberries",
            processing=["freeze_dried"],
            must_have_terms=["strawberries", "freeze_dried"],
            must_not_have_terms=["dried"],
        )
        candidate = make_candidate(ingredient="strawberries", processing=["dried"])
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is True

    def test_weight_hard_reject_no_unit_price(self):
        watched = make_watched(
            target_weight_g=500,
            compare_by_unit_price=False,
            weight_tolerance_percent=20.0,
        )
        # Kandidát má 100g – 80% odchylka, bez unit price fallback → reject
        candidate = make_candidate(weight_g=100)
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is True


# ── Grade thresholds ───────────────────────────────────────────────────────────

class TestGrades:

    def test_grade_a_perfect_match(self):
        """Přesný match → grade A"""
        watched = make_watched()
        candidate = make_candidate()
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is False
        assert result.grade == "A"
        assert result.final_score >= 85

    def test_good_match_with_weight_diff(self):
        """10% odchylka gramáže → stále dobrý výsledek"""
        watched = make_watched(target_weight_g=1000)
        candidate = make_candidate(weight_g=900, unit_price_per_kg=333.0)
        result = score_candidate(watched, candidate)
        assert result.is_hard_reject is False
        assert result.grade in ("A", "B", "C")
        assert result.final_score >= 55

    def test_grade_x_for_hard_reject(self):
        watched = make_watched(ingredient="cashew")
        candidate = make_candidate(ingredient="almonds")
        result = score_candidate(watched, candidate)
        assert result.grade == "X"
        assert result.final_score == 0.0


# ── Component scoring ──────────────────────────────────────────────────────────

class TestComponentScoring:

    def test_processing_full_match_gives_25(self):
        watched = make_watched(processing=["roasted", "salted"])
        candidate = make_candidate(processing=["roasted", "salted"])
        result = score_candidate(watched, candidate)
        assert result.processing_match == 25.0

    def test_processing_partial_match(self):
        watched = make_watched(processing=["roasted", "salted"])
        candidate = make_candidate(processing=["roasted"])
        result = score_candidate(watched, candidate)
        assert 5.0 <= result.processing_match < 25.0

    def test_weight_exact_gives_20(self):
        watched = make_watched(target_weight_g=1000)
        candidate = make_candidate(weight_g=1000)
        result = score_candidate(watched, candidate)
        assert result.weight_match == 20.0

    def test_weight_within_5pct(self):
        watched = make_watched(target_weight_g=1000)
        candidate = make_candidate(weight_g=980)  # 2% odchylka
        result = score_candidate(watched, candidate)
        assert result.weight_match == 20.0

    def test_weight_within_10pct(self):
        watched = make_watched(target_weight_g=1000)
        candidate = make_candidate(weight_g=950)  # 5% odchylka
        result = score_candidate(watched, candidate)
        assert result.weight_match == 20.0

    def test_weight_within_20pct(self):
        watched = make_watched(target_weight_g=1000)
        candidate = make_candidate(weight_g=850)  # 15% odchylka
        result = score_candidate(watched, candidate)
        assert result.weight_match == 12.0

    def test_structured_data_bonus(self):
        watched = make_watched()
        candidate_with = make_candidate(has_structured_data=True)
        candidate_without = make_candidate(has_structured_data=False)
        result_with = score_candidate(watched, candidate_with)
        result_without = score_candidate(watched, candidate_without)
        assert result_with.structured_data_bonus == 5.0
        assert result_without.structured_data_bonus == 0.0

    def test_unit_price_bonus(self):
        watched = make_watched()
        candidate = make_candidate(unit_price_per_kg=299.0)
        result = score_candidate(watched, candidate)
        assert result.unit_price_bonus == 5.0


# ── Penalties ──────────────────────────────────────────────────────────────────

class TestPenalties:

    def test_multipack_penalty(self):
        watched = make_watched()
        candidate = make_candidate(name_raw="Kešu pražené solené multipack 3x1kg")
        result = score_candidate(watched, candidate)
        assert result.penalties <= -5.0

    def test_unavailable_penalty(self):
        watched = make_watched()
        candidate = make_candidate(is_available=False)
        result = score_candidate(watched, candidate)
        assert result.penalties <= -3.0

    def test_missing_must_have_penalty(self):
        watched = make_watched(must_have_terms=["cashew", "roasted", "salted"])
        # Kandidát nemá "salted" ani v canonical atributech, ani v názvu
        candidate = make_candidate(
            name_raw="Kešu pražené 1 kg",
            name_normalized="kesu prazene 1 kg",
            processing=["roasted"],  # chybí "salted" v canonical
        )
        result = score_candidate(watched, candidate)
        # Penalizace za chybějící must_have term "salted"
        assert result.penalties < 0


# ── Batch scoring ──────────────────────────────────────────────────────────────

class TestBatchScoring:

    def test_returns_top_n(self):
        watched = make_watched()
        candidates = [
            make_candidate(
                name_raw=f"Kešu varianta {i}",
                candidate_id=f"c{i}",
                weight_g=900 + i * 20,
            )
            for i in range(10)
        ]
        top = score_all_candidates(watched, candidates, top_n=3)
        assert len(top) <= 3

    def test_sorted_by_score(self):
        watched = make_watched()
        c1 = make_candidate(weight_g=1000)  # přesná shoda
        c2 = make_candidate(weight_g=700)   # větší odchylka
        c1.candidate_id = "c1"
        c2.candidate_id = "c2"
        top = score_all_candidates(watched, [c1, c2], top_n=5)
        scores = [r.final_score for _, r in top]
        assert scores == sorted(scores, reverse=True)

    def test_hard_rejects_excluded(self):
        watched = make_watched(ingredient="cashew")
        good = make_candidate(ingredient="cashew")
        bad = make_candidate(ingredient="almonds")
        good.candidate_id = "good"
        bad.candidate_id = "bad"
        top = score_all_candidates(watched, [good, bad], top_n=5)
        candidate_ids = [c.candidate_id for c, _ in top]
        assert "good" in candidate_ids
        assert "bad" not in candidate_ids


# ── Scoring breakdown ──────────────────────────────────────────────────────────

class TestScoringBreakdown:

    def test_to_dict_has_all_fields(self):
        watched = make_watched()
        candidate = make_candidate()
        result = score_candidate(watched, candidate)
        d = result.to_dict()
        required_keys = [
            "processing_match", "flavor_match", "weight_match",
            "title_similarity", "brand_relevance", "packaging_similarity",
            "structured_data_bonus", "unit_price_bonus", "penalties",
            "final_score", "grade", "is_hard_reject", "reasons",
        ]
        for key in required_keys:
            assert key in d, f"Missing key: {key}"

    def test_reasons_are_populated(self):
        watched = make_watched()
        candidate = make_candidate()
        result = score_candidate(watched, candidate)
        assert len(result.reasons) > 0

    def test_hard_reject_has_reason(self):
        watched = make_watched(ingredient="cashew")
        candidate = make_candidate(ingredient="almonds")
        result = score_candidate(watched, candidate)
        assert result.hard_reject_reason is not None
        assert len(result.reasons) > 0
