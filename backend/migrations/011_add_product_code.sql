-- Migration 011: Add product_code column to products table
-- This allows tracking the PRODUCTNO from XML feed for each tracked product

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code VARCHAR NULL;
CREATE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
