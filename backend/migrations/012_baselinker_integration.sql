-- Migrace 012: Baselinker integrace
-- Tabulka pro uložení Baselinker API konfigurace per firma
-- Přidání sloupce stock_quantity do products

CREATE TABLE IF NOT EXISTS baselinker_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    api_token TEXT NOT NULL,
    inventory_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id)
);

-- Skladovost v products
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'stock_quantity'
    ) THEN
        ALTER TABLE products ADD COLUMN stock_quantity INTEGER;
    END IF;
END $$;
