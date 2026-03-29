-- Migration 005: Add product_code to catalog_products + create feed_subscriptions table
-- Run this in Supabase SQL Editor

-- 1. Add product_code column to catalog_products
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS product_code VARCHAR NULL;

CREATE INDEX IF NOT EXISTS ix_catalog_products_product_code ON catalog_products(product_code);

-- 2. Create feed_subscriptions table
CREATE TABLE IF NOT EXISTS feed_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name VARCHAR NOT NULL,
  feed_url VARCHAR(1000) NOT NULL,
  market VARCHAR(10) NOT NULL DEFAULT 'CZ',
  merge_existing BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ NULL,
  last_fetch_status VARCHAR(20) NULL,
  last_fetch_message VARCHAR(500) NULL,
  last_imported_count INTEGER NOT NULL DEFAULT 0,
  last_updated_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_feed_subscriptions_company_id ON feed_subscriptions(company_id);

-- Confirm
SELECT 'Migration 005 applied successfully' AS result;
