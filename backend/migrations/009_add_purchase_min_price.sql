-- Add purchase price and minimum price to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12, 2) NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price NUMERIC(12, 2) NULL;
