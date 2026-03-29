from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base


class CompetitorRank(Base):
    """Tržní pozice a ranking konkurentů - sledování vývoje pozice v čase"""
    __tablename__ = "competitor_ranks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_id = Column(UUID(as_uuid=True), ForeignKey("competitors.id"), nullable=False, index=True)

    # Ranking
    rank = Column(Integer, nullable=False)  # 1-100 bodů
    positioning = Column(String, nullable=False)  # "Low", "Medium", "High"
    category_rank = Column(Integer, nullable=True)  # Rank v kategorii
    score_reason = Column(String, nullable=True)  # Důvod skóre (např. cena, kvalita, značka)

    # Metadata
    evaluated_at = Column(DateTime(timezone=True), server_default=func.now())  # Kdy bylo vyhodnoceno
    created_at = Column(DateTime(timezone=True), server_default=func.now())
