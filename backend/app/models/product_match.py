from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Numeric, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from app.database import Base


class ProductMatch(Base):
    """
    Párování: sledovaný produkt ↔ kandidát u konkurence.

    match_status životní cyklus:
      proposed        – automaticky navrženo, čeká na review
      auto_approved   – automaticky schváleno (grade A + no conflicts)
      manually_approved – ručně schváleno uživatelem
      rejected        – zamítnuto (manuálně nebo automaticky)
      inactive        – byl aktivní, ale kandidát přestal existovat / failuje
    """
    __tablename__ = "product_matches"
    __table_args__ = (
        UniqueConstraint("product_id", "competitor_id", "candidate_id", name="uq_match_product_competitor_candidate"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    product_id = Column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    competitor_id = Column(
        UUID(as_uuid=True), ForeignKey("competitors.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    candidate_id = Column(
        UUID(as_uuid=True), ForeignKey("competitor_candidates.id", ondelete="SET NULL"),
        nullable=True
    )

    # ── Stav a skóre ────────────────────────────────────────────────────────
    match_status = Column(String(30), default="proposed", nullable=False, index=True)
    match_confidence_score = Column(Numeric(5, 2), nullable=True)   # 0–100
    match_grade = Column(String(2), nullable=True)                  # A, B, C, X

    scoring_breakdown_json = Column(JSONB, default=dict, nullable=False)
    # Příklad:
    # {
    #   "processing_match": 25, "flavor_match": 20, "weight_match": 16,
    #   "title_similarity": 8, "brand_relevance": 3, "packaging_similarity": 2,
    #   "structured_data_bonus": 5, "unit_price_bonus": 5, "penalties": -5,
    #   "final_score": 79, "grade": "B",
    #   "reasons": ["main ingredient matches", "roasted+salted matches", ...]
    # }

    # ── Schválení / zamítnutí ────────────────────────────────────────────────
    approved_by = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # ── Provozní stav ────────────────────────────────────────────────────────
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    last_price_check_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
