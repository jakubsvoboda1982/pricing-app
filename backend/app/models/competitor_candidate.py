from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer, Numeric
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from app.database import Base


class CompetitorCandidate(Base):
    """
    Nalezený produkt u konkurence – surová + normalizovaná data před matchingem.
    Jeden záznam = jedna produktová stránka u konkurenta.
    """
    __tablename__ = "competitor_candidates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_id = Column(
        UUID(as_uuid=True), ForeignKey("competitors.id", ondelete="CASCADE"),
        nullable=False, index=True
    )

    # ── Odkud a co ──────────────────────────────────────────────────────────
    source_url = Column(String(2000), nullable=False)     # URL odkud byl nalezen (listing/search)
    discovered_url = Column(String(2000), nullable=False) # URL produktové stránky

    # ── Surová data ze stránky ───────────────────────────────────────────────
    product_name_raw = Column(String(500), nullable=True)
    brand_raw = Column(String(200), nullable=True)

    price_raw = Column(String(50), nullable=True)
    price_value = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(10), default="CZK", nullable=False)

    weight_raw = Column(String(50), nullable=True)
    weight_g = Column(Integer, nullable=True)          # Normalizovaná gramáž

    unit_price_raw = Column(String(50), nullable=True)
    unit_price_per_kg = Column(Numeric(10, 4), nullable=True)  # Cena za kg

    availability_raw = Column(String(100), nullable=True)
    is_available = Column(Boolean, nullable=True)

    # ── Normalizovaná data ───────────────────────────────────────────────────
    product_name_normalized = Column(String(500), nullable=True)  # lowercase, bez diakritiky
    canonical_attributes_json = Column(JSONB, default=dict, nullable=False)
    # Příklad:
    # {
    #   "ingredient": "cashew",
    #   "processing": ["roasted", "salted"],
    #   "flavor": [],
    #   "coating": [],
    #   "packaging": "bag",
    #   "extras": ["bio"]
    # }

    # ── Strukturovaná data (JSON-LD, microdata) ──────────────────────────────
    scraped_structured_data_json = Column(JSONB, default=dict, nullable=False)

    # ── Metadata scrapingu ───────────────────────────────────────────────────
    scraped_at = Column(DateTime(timezone=True), server_default=func.now())
    content_hash = Column(String(64), nullable=True)  # SHA-256 obsahu pro detekci změn
