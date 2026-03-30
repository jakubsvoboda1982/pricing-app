-- Migration 007: Fix product columns individually (safe fallback if 006 failed)
-- Run this if /api/products/ still returns 500 after migration 006

-- Add each column individually so FK failure doesn't block others
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_product_id UUID NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ean VARCHAR NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500) NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS url_reference VARCHAR(500) NULL;

-- competitor_urls needs special handling (NOT NULL with default)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'competitor_urls'
  ) THEN
    ALTER TABLE products ADD COLUMN competitor_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END$$;

-- Ensure existing NULL values get default
UPDATE products SET competitor_urls = '[]'::jsonb WHERE competitor_urls IS NULL;

CREATE INDEX IF NOT EXISTS ix_products_catalog_product_id ON products(catalog_product_id);
CREATE INDEX IF NOT EXISTS ix_products_ean ON products(ean);

SELECT 'Migration 007 applied successfully' AS result;
