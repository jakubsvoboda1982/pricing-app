"""
Scoring Engine – párování srovnatelných produktů.

Logika:
  1. Hard filters – okamžitý reject při zásadním konfliktu
  2. Component scoring (0–100 bodů dle tabulky)
  3. Penalties
  4. Grade A / B / C / X

Vstup:  WatchedProductProfile  (z Product modelu)
        CandidateProfile        (z CompetitorCandidate modelu)

Výstup: ScoringResult s plným breakdownem pro audit a UI.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from app.normalization.synonyms import PROCESSING_CONFLICTS, COATING_CONFLICTS
from app.normalization.normalizer import normalize_text


# ── Profily ────────────────────────────────────────────────────────────────────

@dataclass
class WatchedProductProfile:
    """
    Matching profil sledovaného produktu.
    Načteme z Product modelu:
      canonical_attributes_json, target_weight_g, weight_tolerance_percent,
      compare_by_unit_price, must_have_terms_json, should_have_terms_json,
      must_not_have_terms_json
    """
    product_id: str
    name: str                                        # Původní název

    # Canonical atributy (z canonical_attributes_json)
    ingredient: Optional[str] = None
    processing: list[str] = field(default_factory=list)
    flavors: list[str] = field(default_factory=list)
    coatings: list[str] = field(default_factory=list)
    packaging: Optional[str] = None
    extras: list[str] = field(default_factory=list)

    # Matching pravidla
    target_weight_g: Optional[int] = None
    weight_tolerance_percent: float = 20.0
    compare_by_unit_price: bool = True

    must_have_terms: list[str] = field(default_factory=list)
    should_have_terms: list[str] = field(default_factory=list)
    must_not_have_terms: list[str] = field(default_factory=list)

    # Cenotvorba pro benchmark
    current_price: Optional[float] = None
    unit_price_per_kg: Optional[float] = None


@dataclass
class CandidateProfile:
    """
    Profil kandidátního produktu u konkurence.
    Načteme z CompetitorCandidate modelu.
    """
    candidate_id: str
    competitor_id: str

    name_raw: str = ""
    name_normalized: str = ""

    # Canonical atributy (z canonical_attributes_json)
    ingredient: Optional[str] = None
    processing: list[str] = field(default_factory=list)
    flavors: list[str] = field(default_factory=list)
    coatings: list[str] = field(default_factory=list)
    packaging: Optional[str] = None
    extras: list[str] = field(default_factory=list)

    # Cena a gramáž
    weight_g: Optional[int] = None
    price_value: Optional[float] = None
    unit_price_per_kg: Optional[float] = None
    currency: str = "CZK"
    is_available: Optional[bool] = None

    # Bonus: strukturovaná data dostupná?
    has_structured_data: bool = False


# ── Výsledek scoringu ──────────────────────────────────────────────────────────

@dataclass
class ScoringResult:
    """Plný výsledek scoringu včetně breakdown pro UI a audit."""

    # ── Hard reject ──────────────────────────────────────────────────────────
    is_hard_reject: bool = False
    hard_reject_reason: Optional[str] = None

    # ── Component skóre ──────────────────────────────────────────────────────
    processing_match: float = 0.0       # max 25
    flavor_match: float = 0.0           # max 20
    weight_match: float = 0.0           # max 20
    title_similarity: float = 0.0       # max 10
    brand_relevance: float = 0.0        # max  5
    packaging_similarity: float = 0.0   # max  5
    structured_data_bonus: float = 0.0  # max  5
    unit_price_bonus: float = 0.0       # max  5
    penalties: float = 0.0              # max  0 (záporné)

    # ── Finální skóre a grade ─────────────────────────────────────────────────
    final_score: float = 0.0
    grade: str = "X"                    # A / B / C / X

    # ── Auditovatelný log důvodů ──────────────────────────────────────────────
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "processing_match": self.processing_match,
            "flavor_match": self.flavor_match,
            "weight_match": self.weight_match,
            "title_similarity": self.title_similarity,
            "brand_relevance": self.brand_relevance,
            "packaging_similarity": self.packaging_similarity,
            "structured_data_bonus": self.structured_data_bonus,
            "unit_price_bonus": self.unit_price_bonus,
            "penalties": self.penalties,
            "final_score": self.final_score,
            "grade": self.grade,
            "is_hard_reject": self.is_hard_reject,
            "hard_reject_reason": self.hard_reject_reason,
            "reasons": self.reasons,
        }


# ── Pomocné funkce ─────────────────────────────────────────────────────────────

def _jaccard_similarity(text_a: str, text_b: str) -> float:
    """
    Token-based Jaccard similarity mezi dvěma normalizovanými texty.
    Vrátí float 0.0–1.0.
    """
    tokens_a = set(normalize_text(text_a).split())
    tokens_b = set(normalize_text(text_b).split())
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)


def _weight_deviation_pct(watched_g: int, candidate_g: int) -> float:
    """Procentuální odchylka gramáže kandidáta od target."""
    if watched_g <= 0:
        return 100.0
    return abs(candidate_g - watched_g) / watched_g * 100.0


def _has_term(text: str, term: str) -> bool:
    """Zkontroluje přítomnost termu v normalizovaném textu (word-boundary)."""
    norm = normalize_text(text)
    t = normalize_text(term)
    if " " in t:
        return t in norm
    return bool(re.search(r"\b" + re.escape(t) + r"\b", norm))


def _any_term_in_text(terms: list[str], text: str) -> bool:
    return any(_has_term(text, t) for t in terms)


# ── Hard filters ───────────────────────────────────────────────────────────────

def _apply_hard_filters(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> bool:
    """
    Vrátí True pokud kandidát prošel všemi hard filtry (= není reject).
    Pokud selže, nastaví result.is_hard_reject a .hard_reject_reason.
    """
    candidate_text = f"{candidate.name_normalized} {candidate.name_raw}"

    # ── 1. Ingredient mismatch ───────────────────────────────────────────────
    if watched.ingredient and candidate.ingredient:
        if watched.ingredient != candidate.ingredient:
            # Výjimka: "mixed_nuts" / "trail_mix" může projít review, ne auto-reject
            if watched.ingredient not in ("mixed_nuts", "trail_mix") and \
               candidate.ingredient not in ("mixed_nuts", "trail_mix"):
                result.is_hard_reject = True
                result.hard_reject_reason = (
                    f"ingredient mismatch: watched={watched.ingredient}, "
                    f"candidate={candidate.ingredient}"
                )
                return False

    # ── 2. must_not_have_terms ───────────────────────────────────────────────
    for term in watched.must_not_have_terms:
        if _has_term(candidate_text, term):
            result.is_hard_reject = True
            result.hard_reject_reason = f"must_not_have term found: '{term}'"
            return False

    # ── 3. Processing conflict ───────────────────────────────────────────────
    for w_proc in watched.processing:
        for c_proc in candidate.processing:
            if (w_proc, c_proc) in PROCESSING_CONFLICTS:
                result.is_hard_reject = True
                result.hard_reject_reason = (
                    f"processing conflict: watched={w_proc}, candidate={c_proc}"
                )
                return False

    # ── 4. Coating conflict ──────────────────────────────────────────────────
    for w_coat in watched.coatings:
        for c_coat in candidate.coatings:
            if (w_coat, c_coat) in COATING_CONFLICTS:
                result.is_hard_reject = True
                result.hard_reject_reason = (
                    f"coating conflict: watched={w_coat}, candidate={c_coat}"
                )
                return False

    # ── 5. Weight hard reject (pouze pokud compare_by_unit_price = False) ────
    if (
        not watched.compare_by_unit_price
        and watched.target_weight_g
        and candidate.weight_g
    ):
        dev = _weight_deviation_pct(watched.target_weight_g, candidate.weight_g)
        if dev > watched.weight_tolerance_percent + 10:  # +10% grace
            result.is_hard_reject = True
            result.hard_reject_reason = (
                f"weight hard reject: watched={watched.target_weight_g}g, "
                f"candidate={candidate.weight_g}g, deviation={dev:.1f}%"
            )
            return False

    return True


# ── Component scoring ──────────────────────────────────────────────────────────

def _score_processing(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> None:
    """max 25 bodů"""
    w_proc = set(watched.processing)
    c_proc = set(candidate.processing)

    if not w_proc and not c_proc:
        # Oba nemají processing info → neutrální, 12 bodů
        result.processing_match = 12.0
        result.reasons.append("processing: both undefined, neutral score")
        return

    if not w_proc or not c_proc:
        # Jeden má, druhý ne → slabá shoda
        result.processing_match = 6.0
        result.reasons.append("processing: one side undefined")
        return

    intersection = w_proc & c_proc
    if intersection == w_proc:
        # Plná shoda (candidate může mít více, ale má vše co watched)
        result.processing_match = 25.0
        result.reasons.append(f"processing: full match {intersection}")
    elif intersection:
        # Částečná shoda – podle poměru
        ratio = len(intersection) / len(w_proc)
        pts = round(5 + ratio * 15, 1)  # 5–20
        result.processing_match = pts
        result.reasons.append(f"processing: partial match {intersection} ({ratio:.0%})")
    else:
        # Žádná shoda v processing (ale ne hard-conflict, to by bylo zachyceno dříve)
        result.processing_match = 2.0
        result.reasons.append("processing: no overlap")


def _score_flavor(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> None:
    """max 20 bodů – chuť + coating dohromady"""
    w_flavor_set = set(watched.flavors + watched.coatings)
    c_flavor_set = set(candidate.flavors + candidate.coatings)

    if not w_flavor_set and not c_flavor_set:
        # Oba plain → perfektní shoda v této kategorii = 20 bodů
        result.flavor_match = 20.0
        result.reasons.append("flavor/coating: both plain, perfect match")
        return

    if not w_flavor_set:
        # Watched je plain, candidate má flavor/coating → slight mismatch
        result.flavor_match = 5.0
        result.reasons.append("flavor/coating: watched is plain, candidate has coating/flavor")
        return

    if not c_flavor_set:
        # Watched má flavor/coating, candidate je plain
        result.flavor_match = 3.0
        result.reasons.append("flavor/coating: watched has coating, candidate is plain")
        return

    intersection = w_flavor_set & c_flavor_set
    if intersection == w_flavor_set:
        result.flavor_match = 20.0
        result.reasons.append(f"flavor/coating: full match {intersection}")
    elif intersection:
        ratio = len(intersection) / len(w_flavor_set)
        pts = round(8 + ratio * 10, 1)
        result.flavor_match = pts
        result.reasons.append(f"flavor/coating: partial {intersection}")
    else:
        result.flavor_match = 2.0
        result.reasons.append("flavor/coating: no overlap (but no hard conflict)")


def _score_weight(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> None:
    """max 20 bodů"""
    if not watched.target_weight_g or not candidate.weight_g:
        # Neznámá gramáž → neutrální
        result.weight_match = 8.0
        result.reasons.append("weight: unknown, neutral score")
        return

    dev = _weight_deviation_pct(watched.target_weight_g, candidate.weight_g)

    if dev <= 5:
        pts = 20.0
        label = "≤5%"
    elif dev <= 10:
        pts = 16.0
        label = "≤10%"
    elif dev <= 20:
        pts = 12.0
        label = "≤20%"
    elif dev <= 30:
        pts = 8.0
        label = "≤30%"
    else:
        # >30 % – pokud compare_by_unit_price, dáme 5 místo reject
        if watched.compare_by_unit_price:
            pts = 5.0
            label = f">30% but unit price enabled (dev={dev:.0f}%)"
        else:
            pts = 0.0
            label = f">30%, no unit price fallback (dev={dev:.0f}%)"

    result.weight_match = pts
    result.reasons.append(
        f"weight: watched={watched.target_weight_g}g, "
        f"candidate={candidate.weight_g}g, deviation={dev:.1f}% → {label}"
    )


def _score_title(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> None:
    """max 10 bodů – Jaccard similarity normalizovaných názvů"""
    sim = _jaccard_similarity(watched.name, candidate.name_normalized or candidate.name_raw)

    if sim >= 0.6:
        pts = round(8 + (sim - 0.6) / 0.4 * 2, 1)   # 8–10
    elif sim >= 0.35:
        pts = round(4 + (sim - 0.35) / 0.25 * 4, 1)  # 4–8
    else:
        pts = round(sim / 0.35 * 4, 1)               # 0–4

    result.title_similarity = min(pts, 10.0)
    result.reasons.append(
        f"title similarity: {sim:.2f} → {result.title_similarity:.1f} pts"
    )


def _score_brand(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> None:
    """max 5 bodů – brand / positioning relevance"""
    # Pokud sledovaný produkt je private label a kandidát taky → dobrá shoda
    # Prozatím: neutrální skóre 3 (nemáme brand data na obou stranách spolehlivě)
    # V budoucnu: rozšíř o brand databázi a positioning score
    result.brand_relevance = 3.0
    result.reasons.append("brand: neutral (no brand conflict detected)")


def _score_packaging(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> None:
    """max 5 bodů"""
    if not watched.packaging and not candidate.packaging:
        result.packaging_similarity = 3.0
        result.reasons.append("packaging: both unknown, neutral")
        return

    if watched.packaging == candidate.packaging:
        result.packaging_similarity = 5.0
        result.reasons.append(f"packaging: exact match ({watched.packaging})")
    elif watched.packaging and candidate.packaging:
        # Podobné obaly (bag ≈ doypack ≈ pouch)
        bag_like = {"bag", "doypack", "resealable"}
        if watched.packaging in bag_like and candidate.packaging in bag_like:
            result.packaging_similarity = 4.0
            result.reasons.append("packaging: both bag-type, close match")
        else:
            result.packaging_similarity = 2.0
            result.reasons.append(
                f"packaging: mismatch ({watched.packaging} vs {candidate.packaging})"
            )
    else:
        result.packaging_similarity = 2.0
        result.reasons.append("packaging: one side unknown")


def _score_bonuses(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> None:
    """Strukturovaná data bonus (max 5) + unit price bonus (max 5)"""
    # Structured data
    if candidate.has_structured_data:
        result.structured_data_bonus = 5.0
        result.reasons.append("bonus: structured data (JSON-LD/microdata) available")
    else:
        result.structured_data_bonus = 0.0

    # Unit price
    if candidate.unit_price_per_kg is not None:
        result.unit_price_bonus = 5.0
        result.reasons.append(
            f"bonus: unit price available ({candidate.unit_price_per_kg:.2f} CZK/kg)"
        )
    elif candidate.weight_g and candidate.price_value:
        # Dopočítatelná
        result.unit_price_bonus = 3.0
        result.reasons.append("bonus: unit price computable from price+weight")
    else:
        result.unit_price_bonus = 0.0


def _apply_penalties(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
    result: ScoringResult,
) -> None:
    """Penalizace – záporné body"""
    penalty = 0.0
    candidate_text = f"{candidate.name_normalized} {candidate.name_raw}".lower()

    # Multipack conflict: watched je single, candidate vypadá jako multipack
    multipack_signals = ["multipack", "sada", "set", r"\d+\s*ks\b", r"\d+\s*x\s*\d+"]
    watched_is_single = "multipack" not in (watched.packaging or "")
    if watched_is_single and any(re.search(sig, candidate_text) for sig in multipack_signals):
        penalty -= 10.0
        result.reasons.append("penalty: candidate appears to be multipack (-10)")

    # Gift package conflict
    gift_signals = ["darkove", "gift", "darkovka", "prezent"]
    if any(sig in candidate_text for sig in gift_signals):
        penalty -= 8.0
        result.reasons.append("penalty: candidate appears to be gift pack (-8)")

    # Nedostupný produkt
    if candidate.is_available is False:
        penalty -= 3.0
        result.reasons.append("penalty: product marked unavailable (-3)")

    # Missing must_have terms – kontrolujeme vůči canonical atributům kandidáta,
    # ne vůči surové textu (must_have jsou canonical EN termy, název může být CZ)
    candidate_canonical_terms: set[str] = set()
    if candidate.ingredient:
        candidate_canonical_terms.add(candidate.ingredient)
    candidate_canonical_terms.update(candidate.processing)
    candidate_canonical_terms.update(candidate.flavors)
    candidate_canonical_terms.update(candidate.coatings)
    candidate_canonical_terms.update(candidate.extras)
    # Přidej gramážové varianty pro should/must_have jako "1kg", "1000g"
    if candidate.weight_g:
        g = candidate.weight_g
        candidate_canonical_terms.add(f"{g}g")
        if g >= 1000 and g % 1000 == 0:
            candidate_canonical_terms.add(f"{g // 1000}kg")

    candidate_text = f"{candidate.name_normalized} {candidate.name_raw}".lower()

    missing_must_have = [
        t for t in watched.must_have_terms
        if t not in candidate_canonical_terms and not _has_term(candidate_text, t)
    ]
    if missing_must_have:
        pts = min(len(missing_must_have) * 4, 15)
        penalty -= pts
        result.reasons.append(
            f"penalty: must_have terms not in candidate profile: {missing_must_have} (-{pts})"
        )

    result.penalties = penalty


# ── Grade thresholds ───────────────────────────────────────────────────────────

def _assign_grade(score: float) -> str:
    if score >= 85:
        return "A"
    if score >= 70:
        return "B"
    if score >= 55:
        return "C"
    return "X"


# ── Hlavní scoring funkce ──────────────────────────────────────────────────────

def score_candidate(
    watched: WatchedProductProfile,
    candidate: CandidateProfile,
) -> ScoringResult:
    """
    Hlavní entry point scoringu.

    1. Hard filters – okamžitý reject při konfliktu
    2. Component scoring (max 100 bodů)
    3. Penalties
    4. Grade A/B/C/X

    Vždy vrátí ScoringResult s plným breakdownem.
    """
    result = ScoringResult()

    # ── Hard filters ─────────────────────────────────────────────────────────
    passed = _apply_hard_filters(watched, candidate, result)
    if not passed:
        result.grade = "X"
        result.final_score = 0.0
        result.reasons.insert(0, f"HARD REJECT: {result.hard_reject_reason}")
        return result

    # ── Component scoring ─────────────────────────────────────────────────────
    _score_processing(watched, candidate, result)
    _score_flavor(watched, candidate, result)
    _score_weight(watched, candidate, result)
    _score_title(watched, candidate, result)
    _score_brand(watched, candidate, result)
    _score_packaging(watched, candidate, result)
    _score_bonuses(watched, candidate, result)
    _apply_penalties(watched, candidate, result)

    # ── Finální skóre ─────────────────────────────────────────────────────────
    raw = (
        result.processing_match
        + result.flavor_match
        + result.weight_match
        + result.title_similarity
        + result.brand_relevance
        + result.packaging_similarity
        + result.structured_data_bonus
        + result.unit_price_bonus
        + result.penalties
    )
    result.final_score = max(0.0, min(100.0, round(raw, 1)))
    result.grade = _assign_grade(result.final_score)

    result.reasons.insert(0, f"final_score={result.final_score}, grade={result.grade}")

    return result


# ── Batch scoring ──────────────────────────────────────────────────────────────

def score_all_candidates(
    watched: WatchedProductProfile,
    candidates: list[CandidateProfile],
    top_n: int = 5,
) -> list[tuple[CandidateProfile, ScoringResult]]:
    """
    Ohodnotí všechny kandidáty pro jeden watched product.
    Vrátí top_n párů (candidate, result) seřazených dle final_score DESC.
    Hard-reject kandidáti jsou zahrnuti pouze pokud je top_n velké (pro debug).
    """
    scored = [(c, score_candidate(watched, c)) for c in candidates]

    # Odděl reject a non-reject
    non_reject = [(c, r) for c, r in scored if not r.is_hard_reject]
    non_reject.sort(key=lambda x: x[1].final_score, reverse=True)

    return non_reject[:top_n]


# ── Factory: načtení profilů z DB modelů ──────────────────────────────────────

def watched_product_to_profile(product) -> WatchedProductProfile:
    """
    Převede SQLAlchemy Product model na WatchedProductProfile pro scoring.
    """
    attrs = product.canonical_attributes_json or {}
    return WatchedProductProfile(
        product_id=str(product.id),
        name=product.name,
        ingredient=attrs.get("ingredient"),
        processing=attrs.get("processing", []),
        flavors=attrs.get("flavors", []),
        coatings=attrs.get("coatings", []),
        packaging=attrs.get("packaging"),
        extras=attrs.get("extras", []),
        target_weight_g=product.target_weight_g,
        weight_tolerance_percent=float(product.weight_tolerance_percent or 20.0),
        compare_by_unit_price=bool(product.compare_by_unit_price),
        must_have_terms=list(product.must_have_terms_json or []),
        should_have_terms=list(product.should_have_terms_json or []),
        must_not_have_terms=list(product.must_not_have_terms_json or []),
    )


def candidate_to_profile(candidate) -> CandidateProfile:
    """
    Převede SQLAlchemy CompetitorCandidate model na CandidateProfile pro scoring.
    """
    attrs = candidate.canonical_attributes_json or {}
    has_struct = bool(
        candidate.scraped_structured_data_json and
        len(candidate.scraped_structured_data_json) > 0
    )
    return CandidateProfile(
        candidate_id=str(candidate.id),
        competitor_id=str(candidate.competitor_id),
        name_raw=candidate.product_name_raw or "",
        name_normalized=candidate.product_name_normalized or "",
        ingredient=attrs.get("ingredient"),
        processing=attrs.get("processing", []),
        flavors=attrs.get("flavors", []),
        coatings=attrs.get("coatings", []),
        packaging=attrs.get("packaging"),
        extras=attrs.get("extras", []),
        weight_g=candidate.weight_g,
        price_value=float(candidate.price_value) if candidate.price_value else None,
        unit_price_per_kg=float(candidate.unit_price_per_kg) if candidate.unit_price_per_kg else None,
        currency=candidate.currency or "CZK",
        is_available=candidate.is_available,
        has_structured_data=has_struct,
    )
