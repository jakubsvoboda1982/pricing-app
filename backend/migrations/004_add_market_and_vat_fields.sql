-- Add market separation and media fields to catalog_products
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS market VARCHAR(10) DEFAULT 'CZ' NOT NULL;
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500);
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS url_reference VARCHAR(500);
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS imported_from VARCHAR(50);

-- Add index for market filtering
CREATE INDEX IF NOT EXISTS idx_catalog_market ON catalog_products(market);

-- Add market field to competitors (drop old unique constraint on url and create new one with market)
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS market VARCHAR(10) DEFAULT 'CZ' NOT NULL;

-- Drop old unique index on url if it exists and create new one with market
DROP INDEX IF EXISTS competitors_url_key;
CREATE UNIQUE INDEX IF NOT EXISTS ix_competitor_url_market_company ON competitors(url, market, company_id);
CREATE INDEX IF NOT EXISTS idx_competitor_market ON competitors(market);

-- Add default_market to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_market VARCHAR(10) DEFAULT 'CZ' NOT NULL;
