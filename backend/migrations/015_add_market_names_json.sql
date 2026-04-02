-- Migration 015: Add market_names_json to products
-- Stores product names from XML feeds per market: {"SK": "Kešu ořechy 1kg SK", "HU": "..."}

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS market_names_json JSONB DEFAULT '{}'::jsonb;
