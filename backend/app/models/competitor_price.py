from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.database import Base


class CompetitorPrice(Base):
    """Historické ceny konkurentů - sledování vývoje cen v čase"""
    __tablename__ = "competitor_prices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competitor_id = Column(UUID(as_uuid=True), ForeignKey("competitors.id"), nullable=False, index=True)

    # Informace o ceně
    product_name = Column(String, nullable=False)  # Název produktu konkurenta
    ean = Column(String, nullable=True)  # EAN kód produktu (pokud je k dispozici)
    price = Column(Numeric(10, 2), nullable=False)  # Cena
    currency = Column(String, default="CZK", nullable=False)  # Měna
    market = Column(String, default="CZ", nullable=False)  # Trh (CZ, SK, atd.)

    # Metadata
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())  # Kdy byla cena zaznamenána
    last_checked = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Index pro rychlejší dotazy
    __table_args__ = (
        ("competitor_id", "recorded_at"),  # Compound index
    )
