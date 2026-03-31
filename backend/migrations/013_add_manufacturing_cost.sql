-- Add manufacturing_cost column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturing_cost NUMERIC(12, 2);
