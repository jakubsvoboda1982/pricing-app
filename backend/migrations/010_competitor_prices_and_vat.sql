-- Migration 010: Add competitor price tracking and refactor purchase_price with VAT
-- This migration:
-- 1. Renames purchase_price to purchase_price_without_vat
-- 2. Adds purchase_vat_rate to products (default 12 for CZ food items)
-- 3. Creates competitor_product_prices table for tracking competitor prices by URL
-- 4. Creates competitor_price_history table for historical tracking

-- Rename purchase_price to purchase_price_without_vat (if migration 009 already created it)
ALTER TABLE products RENAME COLUMN IF EXISTS purchase_price TO purchase_price_without_vat;

-- Add VAT rate column for purchase price (default 12% for Czech food items)
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_vat_rate NUMERIC(5, 2) DEFAULT 12.00 NULL;

-- Create table for tracking competitor prices per product URL
CREATE TABLE IF NOT EXISTS competitor_product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    competitor_url VARCHAR NOT NULL,
    price NUMERIC(12, 2),
    currency VARCHAR DEFAULT 'CZK',
    market VARCHAR(10) DEFAULT 'CZ',
    last_fetched_at TIMESTAMPTZ,
    next_update_at TIMESTAMPTZ,
    fetch_status VARCHAR,  -- 'success' | 'error' | 'pending'
    fetch_error VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_product_url UNIQUE(product_id, competitor_url)
);

CREATE INDEX IF NOT EXISTS idx_competitor_product_prices_product_id ON competitor_product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_competitor_product_prices_next_update ON competitor_product_prices(next_update_at) WHERE next_update_at IS NOT NULL;

-- Create historical table for competitor price changes
CREATE TABLE IF NOT EXISTS competitor_price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_price_id UUID NOT NULL REFERENCES competitor_product_prices(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitor_price_history_price_id ON competitor_price_history(competitor_price_id);
CREATE INDEX IF NOT EXISTS idx_competitor_price_history_recorded ON competitor_price_history(recorded_at);
