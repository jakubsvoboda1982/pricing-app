from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Integer, Numeric, Index
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSON, JSONB
import uuid
from app.database import Base


class Competitor(Base):
    """Sledovaní konkurenti s metadatou a kontaktními informacemi"""
    __tablename__ = "competitors"
    __table_args__ = (
        Index('ix_competitor_url_market_company', 'url', 'market', 'company_id', unique=True),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)

    # Základní informace
    name = Column(String, nullable=False)
    url = Column(String, nullable=False, index=True)
    logo_url = Column(String, nullable=True)
    category = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    # Trh/Region
    market = Column(String(10), default="CZ", nullable=False, index=True)  # CZ, SK

    # Kontaktní informace
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    country = Column(String, nullable=True)

    # Metadata scrapingu
    first_scrape_date = Column(DateTime(timezone=True), nullable=True)
    last_scrape_date = Column(DateTime(timezone=True), nullable=True)
    scrape_data = Column(JSON, nullable=True)  # Surová data z poslední scrapingu
    scrape_error = Column(String, nullable=True)  # Chyba z poslední scrapingu

    # Stav
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)  # Ověřeno uživatelem
    scrape_attempts = Column(Integer, default=0)
    scrape_failures = Column(Integer, default=0)

    # ── Scraping konfigurace ──────────────────────────────────────────────────
    scraping_mode = Column(String(20), default="html")
    # "html" = běžný HTML scraping
    # "feed" = přednost má XML/JSON feed pokud existuje
    # "sitemap" = z sitemap.xml

    listing_patterns_json = Column(JSONB, default=dict, nullable=True)
    # CSS selektory pro listing / kategorie stránky
    # {"product_link": "a.product-title", "next_page": "a.pagination-next"}

    detail_patterns_json = Column(JSONB, default=dict, nullable=True)
    # CSS selektory pro detail stránky (fallback přes generic scraper)
    # {"price": ".price-final", "name": "h1.product-name", "availability": ".stock"}

    default_crawl_delay_s = Column(Numeric(5, 2), default=3.0)  # Min. pauza mezi requesty
    is_scraping_active = Column(Boolean, default=True)           # Zapnout/vypnout scraping

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
