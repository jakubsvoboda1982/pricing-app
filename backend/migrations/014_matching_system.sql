-- ============================================================
-- 014: Matching system – canonical profiles + candidates + matches
-- ============================================================

-- ── Rozšíření tabulky products o canonical matching profil ──────────────────
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS canonical_attributes_json  JSONB         DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS target_weight_g            INTEGER,
    ADD COLUMN IF NOT EXISTS weight_tolerance_percent   NUMERIC(5,2)  DEFAULT 20.0,
    ADD COLUMN IF NOT EXISTS compare_by_unit_price      BOOLEAN       DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS must_have_terms_json       JSONB         DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS should_have_terms_json     JSONB         DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS must_not_have_terms_json   JSONB         DEFAULT '[]';

-- ── Rozšíření tabulky competitors o scraping konfiguraci ───────────────────
ALTER TABLE competitors
    ADD COLUMN IF NOT EXISTS scraping_mode          VARCHAR(20)   DEFAULT 'html',
    ADD COLUMN IF NOT EXISTS listing_patterns_json  JSONB         DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS detail_patterns_json   JSONB         DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS default_crawl_delay_s  NUMERIC(5,2)  DEFAULT 3.0,
    ADD COLUMN IF NOT EXISTS is_scraping_active     BOOLEAN       DEFAULT TRUE;

-- ── Per-domain anti-ban stav ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domain_crawl_states (
    id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    domain                   VARCHAR(255)  NOT NULL UNIQUE,

    -- Robots a timing
    robots_txt_snapshot      TEXT,
    last_request_at          TIMESTAMP WITH TIME ZONE,
    current_cooldown_until   TIMESTAMP WITH TIME ZONE,

    -- Čítače chyb
    consecutive_errors       INTEGER       DEFAULT 0,
    consecutive_403          INTEGER       DEFAULT 0,
    consecutive_429          INTEGER       DEFAULT 0,
    suspicious_response_count INTEGER      DEFAULT 0,
    total_requests           INTEGER       DEFAULT 0,
    total_errors             INTEGER       DEFAULT 0,

    -- Stav blokace
    last_block_reason        VARCHAR(200),
    is_blocked               BOOLEAN       DEFAULT FALSE,

    created_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Kandidátní produkty nalezené u konkurence ───────────────────────────────
CREATE TABLE IF NOT EXISTS competitor_candidates (
    id                           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id                UUID          REFERENCES competitors(id) ON DELETE CASCADE,

    -- Odkud byl kandidát nalezen a jaká je jeho URL
    source_url                   VARCHAR(2000) NOT NULL,
    discovered_url               VARCHAR(2000) NOT NULL,

    -- Surová data ze stránky
    product_name_raw             VARCHAR(500),
    brand_raw                    VARCHAR(200),
    price_raw                    VARCHAR(50),
    price_value                  NUMERIC(10,2),
    currency                     VARCHAR(10)   DEFAULT 'CZK',
    weight_raw                   VARCHAR(50),
    weight_g                     INTEGER,
    unit_price_raw               VARCHAR(50),
    unit_price_per_kg            NUMERIC(10,4),
    availability_raw             VARCHAR(100),
    is_available                 BOOLEAN,

    -- Normalizovaná a extrahovaná data
    product_name_normalized      VARCHAR(500),
    canonical_attributes_json    JSONB         DEFAULT '{}',

    -- Strukturovaná data (JSON-LD, microdata)
    scraped_structured_data_json JSONB         DEFAULT '{}',

    -- Metadata scrapingu
    scraped_at                   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    content_hash                 VARCHAR(64),   -- SHA-256 obsahu pro detekci změn

    UNIQUE (competitor_id, discovered_url)
);

CREATE INDEX IF NOT EXISTS ix_candidates_competitor ON competitor_candidates(competitor_id);
CREATE INDEX IF NOT EXISTS ix_candidates_scraped_at ON competitor_candidates(scraped_at DESC);

-- ── Schválené / navrhované páry: sledovaný produkt ↔ kandidát ───────────────
CREATE TABLE IF NOT EXISTS product_matches (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id              UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    competitor_id           UUID         NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    candidate_id            UUID         REFERENCES competitor_candidates(id) ON DELETE SET NULL,

    -- Stav matchingu
    match_status            VARCHAR(30)  NOT NULL DEFAULT 'proposed',
    -- proposed | auto_approved | manually_approved | rejected | inactive

    -- Skóre a grade
    match_confidence_score  NUMERIC(5,2),   -- 0–100
    match_grade             VARCHAR(2),     -- A, B, C, X (reject)
    scoring_breakdown_json  JSONB           DEFAULT '{}',

    -- Schválení / zamítnutí
    approved_by             UUID         REFERENCES users(id) ON DELETE SET NULL,
    approved_at             TIMESTAMP WITH TIME ZONE,
    rejection_reason        TEXT,
    notes                   TEXT,

    is_active               BOOLEAN      DEFAULT TRUE,
    last_price_check_at     TIMESTAMP WITH TIME ZONE,

    created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE (product_id, competitor_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS ix_matches_product    ON product_matches(product_id);
CREATE INDEX IF NOT EXISTS ix_matches_competitor ON product_matches(competitor_id);
CREATE INDEX IF NOT EXISTS ix_matches_status     ON product_matches(match_status);
CREATE INDEX IF NOT EXISTS ix_matches_active     ON product_matches(is_active, match_status);
