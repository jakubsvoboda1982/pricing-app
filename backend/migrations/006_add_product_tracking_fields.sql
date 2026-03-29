-- Migration 006: Add tracking fields to products table
-- Run this in Supabase SQL Editor

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS catalog_product_id UUID REFERENCES catalog_products(id) NULL,
  ADD COLUMN IF NOT EXISTS ean VARCHAR NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS url_reference VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS competitor_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS ix_products_catalog_product_id ON products(catalog_product_id);
CREATE INDEX IF NOT EXISTS ix_products_ean ON products(ean);

SELECT 'Migration 006 applied successfully' AS result;
