# Nuties Pricing Monitor / Nuties Growth Copilot
## Technická specifikace projektu

**Verze:** 1.0
**Datum:** 30. března 2026
**Jazyk:** Czech / Slovak e-commerce trh
**Účel dokumentu:** Kompletní technická specifikace umožňující plnou rekonstrukci projektu od základu

---

## Obsah

1. [Přehled projektu](#1-přehled-projektu)
2. [Technický stack](#2-technický-stack)
3. [Architektura systému](#3-architektura-systému)
4. [Databázové schéma](#4-databázové-schéma)
5. [Backend API](#5-backend-api)
6. [Business logika](#6-business-logika)
7. [Frontend — stránky a komponenty](#7-frontend--stránky-a-komponenty)
8. [Správa stavu (State Management)](#8-správa-stavu-state-management)
9. [Autentizace a autorizace](#9-autentizace-a-autorizace)
10. [Email workflow](#10-email-workflow)
11. [Plánované úlohy (APScheduler)](#11-plánované-úlohy-apscheduler)
12. [Import a parsování dat](#12-import-a-parsování-dat)
13. [Web scraper](#13-web-scraper)
14. [Proměnné prostředí](#14-proměnné-prostředí)
15. [Deployment](#15-deployment)
16. [Databázové migrace](#16-databázové-migrace)
17. [Známé patterny a úskalí](#17-známé-patterny-a-úskalí)

---

## 1. Přehled projektu

### 1.1 Identita projektu

| Atribut | Hodnota |
|---|---|
| **Primární název** | Nuties Pricing Monitor |
| **Alternativní název** | Nuties Growth Copilot |
| **Účel** | Nástroj pro správu a monitoring cen v e-commerce |
| **Cílový trh** | Česká republika a Slovensko |
| **Frontend doména** | pricing.jacobsvoboda.cz |
| **Backend doména** | api.jacobsvoboda.cz |

### 1.2 Popis systému

Nuties Pricing Monitor je webová aplikace pro e-commerce firmy, která umožňuje:

- **Monitoring vlastních cen** — sledování vývoje prodejních cen vlastních produktů v čase
- **Sledování konkurence** — přidávání konkurenčních URL, automatické scrapování metadat a cen
- **Import katalogů** — import produktů z Heureka XML feedů, Excel souborů nebo URL
- **Automatické synchronizace** — pravidelné aktualizace cen z XML feedů (denně ve 02:00 UTC)
- **Hero Score** — skóre připravenosti produktu na optimální cenotvorbu (0–100 bodů)
- **Správa uživatelů** — víceúrovňové role, registrace s email verifikací a admin schválením
- **Audit log** — sledování všech změn cen a metadat produktů
- **Simulátor cen** — simulace dopadu změny ceny s elasticitou poptávky
- **Export dat** — export sledovaných produktů do XLSX nebo CSV

### 1.3 Uživatelské role

| Role | Popis |
|---|---|
| `admin` | Plný přístup včetně správy uživatelů a admin sekce |
| `pricing_manager` | Správa cen a produktů |
| `category_manager` | Správa kategorií a katalogů |
| `read_only` | Pouze čtení dat |

---

## 2. Technický stack

### 2.1 Backend

| Technologie | Verze | Účel |
|---|---|---|
| Python | 3.11+ | Programovací jazyk |
| FastAPI | 0.104.1 | Web framework, REST API |
| SQLAlchemy | 2.0.23 | ORM pro databázi |
| Pydantic | v2 | Validace dat, serializace |
| psycopg2-binary | latest | PostgreSQL driver |
| python-jose | latest | JWT tokeny |
| bcrypt | latest | Hashování hesel a tokenů |
| APScheduler | 3.10.4 | Plánované úlohy (cron jobs) |
| aiohttp | latest | Asynchronní HTTP klient (scraping) |
| aiosmtplib | latest | Asynchronní odesílání emailů |
| openpyxl | latest | Import/export Excel souborů |
| uvicorn | latest | ASGI server |

### 2.2 Frontend

| Technologie | Verze | Účel |
|---|---|---|
| React | 18 | UI framework |
| TypeScript | latest | Typovaný JavaScript |
| Vite | latest | Build nástroj a dev server |
| React Router | v6 | Klientské routování |
| TanStack Query | v5 | Data fetching, caching, synchronizace |
| Zustand | latest | Globální stav (auth, market) |
| Tailwind CSS | latest | Utility-first CSS framework |
| Lucide React | latest | Ikony |

### 2.3 Infrastruktura

| Služba | Účel |
|---|---|
| Railway | Hosting backendu (Python/FastAPI) |
| Vercel | Hosting frontendu (React/Vite) |
| Supabase | PostgreSQL databáze |
| SendGrid | SMTP odesílání emailů |

---

## 3. Architektura systému

### 3.1 Celková architektura

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                        │
│              pricing.jacobsvoboda.cz                        │
│         React 18 + TypeScript + Vite + Tailwind             │
│    TanStack Query (cache) + Zustand (global state)          │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS REST API
                        │ (VITE_API_URL = https://api.jacobsvoboda.cz/api)
┌───────────────────────▼─────────────────────────────────────┐
│                    BACKEND (Railway)                         │
│               api.jacobsvoboda.cz                           │
│              FastAPI 0.104.1 + uvicorn                      │
│         SQLAlchemy 2.0 ORM + APScheduler                    │
└───────────────────────┬─────────────────────────────────────┘
                        │ psycopg2 / PostgreSQL
┌───────────────────────▼─────────────────────────────────────┐
│                  DATABÁZE (Supabase)                         │
│                     PostgreSQL                              │
│            15 tabulek (schéma viz sekce 4)                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Struktura adresářů — Backend

```
backend/
├── app/
│   ├── main.py              # FastAPI app, lifespan, CORS, routery
│   ├── database.py          # SQLAlchemy engine, session, Base
│   ├── models.py            # SQLAlchemy ORM modely
│   ├── schemas.py           # Pydantic v2 request/response schemas
│   ├── auth.py              # JWT utilities, verify_token dependency
│   ├── scraper.py           # Async web scraper (aiohttp)
│   ├── heureka_parser.py    # Heureka XML parser (SHOPITEM + ITEM)
│   ├── scheduler.py         # APScheduler setup a cron jobs
│   ├── email_utils.py       # Async email (aiosmtplib)
│   └── routers/
│       ├── auth.py          # /api/auth/*
│       ├── products.py      # /api/products/*
│       ├── catalog.py       # /api/catalog/*
│       ├── competitors.py   # /api/competitors/*
│       ├── users.py         # /api/users/*
│       ├── admin.py         # /api/admin/*
│       ├── audit_logs.py    # /api/audit-logs/*
│       ├── analytics.py     # /api/analytics/*
│       ├── simulator.py     # /api/simulator/*
│       ├── opportunities.py # /api/opportunities/*
│       └── export.py        # /api/export/*
├── migrations/
│   ├── 001_initial.sql
│   ├── 002_...sql
│   └── ... (001–009)
├── requirements.txt
├── Dockerfile
└── Procfile
```

### 3.3 Struktura adresářů — Frontend

```
frontend/
├── src/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Router setup, ProtectedRoute
│   ├── api/
│   │   └── client.ts        # Axios/fetch wrapper (auto https konverze)
│   ├── store/
│   │   ├── auth.ts          # Zustand auth store
│   │   └── market.ts        # Zustand market store
│   ├── components/
│   │   ├── Layout.tsx        # Sidebar + top bar layout
│   │   ├── Sidebar.tsx       # Collapsible sidebar (64px/256px)
│   │   ├── TopBar.tsx        # Breadcrumbs + market selector + avatar
│   │   ├── ProtectedRoute.tsx
│   │   └── MarketSelector.tsx
│   └── pages/
│       ├── LoginPage.tsx
│       ├── RegisterPage.tsx
│       ├── VerifyEmailPage.tsx
│       ├── DashboardPage.tsx
│       ├── ProductsPage.tsx
│       ├── ProductDetailPage.tsx
│       ├── CatalogPage.tsx
│       ├── CompetitorsPage.tsx
│       ├── CompetitorDetailPage.tsx
│       ├── ImportPage.tsx
│       ├── UsersPage.tsx
│       ├── AuditPage.tsx
│       ├── SimulatorPage.tsx
│       ├── SeasonalityPage.tsx
│       ├── OpportunitiesPage.tsx
│       ├── ExportPage.tsx
│       ├── AdminPage.tsx
│       ├── LoginAttemptsPage.tsx
│       └── UsersManagementPage.tsx
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 4. Databázové schéma

### 4.1 Přehled tabulek

| Tabulka | Popis |
|---|---|
| `companies` | Firmy (tenanti systému) |
| `users` | Uživatelé s rolemi a verifikačním workflow |
| `catalog_products` | Katalog importovaných produktů |
| `feed_subscriptions` | Sledované XML feedy |
| `products` | Sledované produkty (pro cenotvorbu) |
| `prices` | Historie cen sledovaných produktů |
| `competitors` | Sledovaní konkurenti |
| `competitor_prices` | Ceny konkurentů |
| `competitor_ranks` | Ranking skóre konkurentů |
| `competitor_alerts` | Upozornění na změny u konkurence |
| `audit_logs` | Audit trail všech změn |
| `login_attempts` | Záznamy pokusů o přihlášení |
| `analytics` | Analytická data produktů (hero_score, margin_risk) |

### 4.2 Tabulka: `companies`

```sql
CREATE TABLE companies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 Tabulka: `users`

```sql
CREATE TABLE users (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                           VARCHAR UNIQUE NOT NULL,
    hashed_password                 VARCHAR NOT NULL,
    full_name                       VARCHAR NOT NULL,
    role                            VARCHAR(50) DEFAULT 'read_only',
    -- Povolené hodnoty role: admin, pricing_manager, category_manager, read_only
    company_id                      UUID REFERENCES companies(id),
    is_active                       BOOLEAN DEFAULT true,
    is_verified                     BOOLEAN DEFAULT false,
    is_approved                     BOOLEAN DEFAULT false,
    email_verified_at               TIMESTAMPTZ,
    approved_at                     TIMESTAMPTZ,
    verification_token_hash         VARCHAR,
    verification_token_expires_at   TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ DEFAULT now(),
    updated_at                      TIMESTAMPTZ DEFAULT now()
);
```

**Poznámky:**
- První registrovaný uživatel automaticky dostane roli `admin`
- Nový uživatel začíná jako `is_verified=false, is_approved=false`
- Verifikační token se hashuje přes bcrypt a ukládá jako `verification_token_hash`

### 4.4 Tabulka: `catalog_products`

```sql
CREATE TABLE catalog_products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID REFERENCES companies(id),
    ean                 VARCHAR,                    -- index
    isbn                VARCHAR,
    product_code        VARCHAR,                    -- index (PRODUCTNO z Heureka XML)
    name                VARCHAR NOT NULL,
    category            VARCHAR,
    manufacturer        VARCHAR,
    description         TEXT,
    price_without_vat   NUMERIC(10,2),
    purchase_price      NUMERIC(10,2),
    vat_rate            NUMERIC(5,2),
    quantity_in_stock   INTEGER,
    unit_of_measure     VARCHAR DEFAULT 'ks',
    market              VARCHAR(10) DEFAULT 'CZ',   -- index
    thumbnail_url       VARCHAR(500),
    url_reference       VARCHAR(500),
    is_active           BOOLEAN DEFAULT true,
    imported_from       VARCHAR(50),
    -- Povolené hodnoty: heureka_cz, heureka_sk, excel, url
    catalog_identifier  VARCHAR UNIQUE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    imported_at         TIMESTAMPTZ
);
```

### 4.5 Tabulka: `feed_subscriptions`

```sql
CREATE TABLE feed_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID REFERENCES companies(id),
    name                    VARCHAR NOT NULL,
    feed_url                VARCHAR NOT NULL,
    market                  VARCHAR(10) DEFAULT 'CZ',
    merge_existing          BOOLEAN DEFAULT true,
    is_active               BOOLEAN DEFAULT true,
    last_fetched_at         TIMESTAMPTZ,
    last_fetch_status       VARCHAR,        -- 'success' | 'error'
    last_fetch_message      VARCHAR(500),
    last_imported_count     INTEGER DEFAULT 0,
    last_updated_count      INTEGER DEFAULT 0,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);
```

### 4.6 Tabulka: `products` (sledované produkty)

```sql
CREATE TABLE products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID REFERENCES companies(id),
    name                VARCHAR NOT NULL,
    sku                 VARCHAR NOT NULL,
    UNIQUE(sku, company_id),
    category            VARCHAR,
    description         TEXT,
    catalog_product_id  UUID REFERENCES catalog_products(id),  -- index, nullable
    ean                 VARCHAR,                                -- index
    thumbnail_url       VARCHAR(500),
    url_reference       VARCHAR(500),
    competitor_urls     JSON DEFAULT '[]',
    -- Formát: array of {url: string, name: string, market: string}
    purchase_price      NUMERIC(12,2),
    min_price           NUMERIC(12,2),
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
```

**Poznámka:** Při přidání produktu se zadáním `catalog_product_id` se automaticky převezmou: EAN, thumbnail_url, url_reference, category z katalogového produktu.

### 4.7 Tabulka: `prices`

```sql
CREATE TABLE prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID REFERENCES products(id),   -- index
    market          VARCHAR DEFAULT 'CZ',
    currency        VARCHAR DEFAULT 'CZK',
    current_price   NUMERIC(12,2) NOT NULL,
    old_price       NUMERIC(12,2),
    changed_at      TIMESTAMPTZ DEFAULT now(),
    changed_by      UUID REFERENCES users(id)        -- nullable
);
```

### 4.8 Tabulka: `competitors`

```sql
CREATE TABLE competitors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID REFERENCES companies(id),          -- index
    name                VARCHAR NOT NULL,
    url                 VARCHAR NOT NULL,                       -- index
    UNIQUE(url, market, company_id),
    logo_url            VARCHAR,
    category            VARCHAR,
    description         TEXT,
    market              VARCHAR(10) DEFAULT 'CZ',               -- index
    email               VARCHAR,
    phone               VARCHAR,
    address             VARCHAR,
    country             VARCHAR,
    first_scrape_date   TIMESTAMPTZ,
    last_scrape_date    TIMESTAMPTZ,
    scrape_data         JSON,
    scrape_error        VARCHAR,
    is_active           BOOLEAN DEFAULT true,
    is_verified         BOOLEAN DEFAULT false,
    scrape_attempts     INTEGER DEFAULT 0,
    scrape_failures     INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
```

**Poznámka:** Logo konkurenta se generuje dynamicky jako:
`https://www.google.com/s2/favicons?sz=64&domain_url=https://{doména}`

### 4.9 Tabulka: `competitor_prices`

```sql
CREATE TABLE competitor_prices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id   UUID REFERENCES competitors(id),
    product_name    VARCHAR,
    price           NUMERIC(10,2),
    currency        VARCHAR,
    market          VARCHAR,
    recorded_at     TIMESTAMPTZ
);
```

### 4.10 Tabulka: `competitor_ranks`

```sql
CREATE TABLE competitor_ranks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id   UUID REFERENCES competitors(id),
    rank            INTEGER,        -- rozsah 0–100
    positioning     VARCHAR,
    score_reason    VARCHAR,
    evaluated_at    TIMESTAMPTZ
);
```

### 4.11 Tabulka: `competitor_alerts`

```sql
CREATE TABLE competitor_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id   UUID REFERENCES competitors(id),
    message         VARCHAR,
    is_read         BOOLEAN DEFAULT false,
    dismissed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 4.12 Tabulka: `audit_logs`

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID,                           -- nullable
    field_changed   VARCHAR,
    old_value       VARCHAR,
    new_value       VARCHAR,
    action          VARCHAR,    -- create | update | delete
    user_id         UUID REFERENCES users(id),
    timestamp       TIMESTAMPTZ DEFAULT now()
);
```

### 4.13 Tabulka: `login_attempts`

```sql
CREATE TABLE login_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR,
    ip_address      VARCHAR,
    user_agent      VARCHAR,
    success         BOOLEAN,
    error_message   VARCHAR,
    timestamp       TIMESTAMPTZ DEFAULT now()
);
```

### 4.14 Tabulka: `analytics`

```sql
CREATE TABLE analytics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID REFERENCES products(id),
    hero_score      INTEGER,
    margin_risk     VARCHAR,    -- Low | Medium | High
    positioning     VARCHAR,
    category_rank   INTEGER,
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. Backend API

### 5.1 Konfigurace FastAPI aplikace

```python
# app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.scheduler import start_scheduler, shutdown_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()      # Spustí APScheduler při startu
    yield
    shutdown_scheduler()   # Zastaví APScheduler při vypnutí

app = FastAPI(title="Nuties Pricing Monitor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://pricing.jacobsvoboda.cz"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrace routerů
app.include_router(auth_router, prefix="/api/auth")
app.include_router(products_router, prefix="/api/products")
app.include_router(catalog_router, prefix="/api/catalog")
app.include_router(competitors_router, prefix="/api/competitors")
app.include_router(users_router, prefix="/api/users")
app.include_router(admin_router, prefix="/api/admin")
app.include_router(audit_logs_router, prefix="/api/audit-logs")
app.include_router(analytics_router, prefix="/api/analytics")
app.include_router(simulator_router, prefix="/api/simulator")
app.include_router(opportunities_router, prefix="/api/opportunities")
app.include_router(export_router, prefix="/api/export")
```

### 5.2 Endpointy: `/api/auth`

| Metoda | Cesta | Popis |
|---|---|---|
| POST | `/register` | Registrace nového uživatele |
| POST | `/verify-email` | Ověření emailu tokenem |
| POST | `/login` | Přihlášení, vrátí JWT |
| GET | `/me` | Aktuálně přihlášený uživatel |

#### POST /api/auth/register

**Request body:**
```json
{
  "email": "user@example.com",
  "full_name": "Jan Novák",
  "company_name": "Firma s.r.o.",
  "password": "SecurePassword123!"
}
```

**Logika:**
1. Zkontroluje, zda email již neexistuje
2. Vytvoří záznam v `companies` (pokud firma s tímto názvem neexistuje)
3. Hashuje heslo přes bcrypt
4. Vygeneruje verifikační token: `secrets.token_urlsafe(32)` (32 char URL-safe)
5. Hashuje token přes bcrypt a uloží jako `verification_token_hash`
6. Nastaví `verification_token_expires_at` = now() + 24 hodin
7. Uloží uživatele: `is_verified=false, is_approved=false`
8. Role: pokud je první uživatel firmy → `admin`, jinak `read_only`
9. Odešle verifikační email (viz sekce 10)

#### POST /api/auth/verify-email

**Request body:**
```json
{
  "token": "url-safe-token-32-chars",
  "email": "user@example.com"
}
```

**Logika:**
1. Najde uživatele podle emailu
2. Porovná token s `verification_token_hash` přes `bcrypt.checkpw()`
3. Zkontroluje `verification_token_expires_at` (nepřekročen)
4. Nastaví `is_verified=true`, `email_verified_at=now()`
5. Vymaže `verification_token_hash` a `verification_token_expires_at`

#### POST /api/auth/login

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Logika:**
1. Najde uživatele, ověří heslo bcryptem
2. Zkontroluje `is_verified` → pokud false, vrátí 401 s `"Email not verified"`
3. Zkontroluje `is_approved` → pokud false, vrátí 401 s `"Awaiting admin approval"`
4. Zkontroluje `is_active` → pokud false, vrátí 403
5. Vytvoří JWT token (HS256, expiry 30 minut)
6. Zaznamená `LoginAttempt` (success=true)
7. Vrátí `{access_token, token_type: "bearer"}`

Při neúspěchu zaznamená `LoginAttempt` (success=false, error_message) a vrátí 401.

#### GET /api/auth/me

Vyžaduje Bearer token. Vrátí objekt přihlášeného uživatele.

### 5.3 Endpointy: `/api/products`

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/` | Seznam sledovaných produktů |
| POST | `/` | Přidá produkt ke sledování |
| GET | `/{id}` | Detail produktu |
| PUT | `/{id}` | Aktualizace metadat |
| PATCH | `/{id}/pricing` | Nastavení nákupní/minimální ceny |
| DELETE | `/{id}` | Odebere ze sledování |
| GET | `/{id}/prices` | Historie cen (max 30 záznamů) |
| POST | `/{id}/prices` | Ruční nastavení ceny |
| POST | `/{id}/competitor-urls` | Přidá URL konkurenta |
| DELETE | `/{id}/competitor-urls?url=...` | Odebere URL konkurenta |

**GET `/api/products/`** vrací každý produkt obohacený o:
- Poslední cenu z tabulky `prices` (nejnovější podle `changed_at`)
- Marži: `(current_price - purchase_price) / current_price * 100`
- `hero_score` z tabulky `analytics`

**POST `/api/products/`** — Request body:
```json
{
  "name": "Produkt XYZ",
  "sku": "PRD-001",
  "category": "Elektronika",
  "catalog_product_id": "uuid-optional",
  "ean": "1234567890123",
  "purchase_price": 150.00,
  "min_price": 199.00
}
```

Při zadání `catalog_product_id` se z katalogového produktu automaticky převezmou: `ean`, `thumbnail_url`, `url_reference`, `category`.

**DELETE `/api/products/{id}`** — Smaže produkt ze sledování a všechny záznamy v `prices`. Katalogový produkt v `catalog_products` se NEMAŽE (zůstane zachován).

**PATCH `/api/products/{id}/pricing`** — Request body:
```json
{
  "purchase_price": 150.00,
  "min_price": 199.00
}
```

**POST `/api/products/{id}/prices`** — Request body:
```json
{
  "current_price": 299.00,
  "old_price": 349.00,
  "market": "CZ",
  "currency": "CZK"
}
```

**POST `/api/products/{id}/competitor-urls`** — Request body:
```json
{
  "url": "https://competitor.cz/produkt/xyz",
  "name": "Competitor Shop",
  "market": "CZ"
}
```

### 5.4 Endpointy: `/api/catalog`

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/products` | Katalog produktů s filtry |
| GET | `/categories` | Unikátní kategorie |
| POST | `/import` | Import z Excel (.xlsx) |
| POST | `/import-heureka` | Import z Heureka XML souboru |
| POST | `/import-url` | Import z URL |
| GET | `/feeds` | Seznam feed subscriptions |
| POST | `/feeds` | Přidá nový XML feed |
| PUT | `/feeds/{id}` | Upraví feed subscription |
| DELETE | `/feeds/{id}` | Smaže feed subscription |
| POST | `/feeds/{id}/fetch` | Ručně spustí načtení feedu |

**GET `/api/catalog/products`** — Query parametry:
- `market` (CZ|SK)
- `category` (string)
- `search` (fulltext přes name, ean, product_code)
- `skip` (integer, default 0)
- `limit` (integer, default 50)

**POST `/api/catalog/import`** — Multipart upload `.xlsx` souboru. Parsuje pomocí `openpyxl`. Vytvoří nebo aktualizuje záznamy v `catalog_products`.

**POST `/api/catalog/import-heureka`** — Multipart upload XML souboru:
- `market`: CZ nebo SK
- `merge_existing`: boolean (sloučit s existujícími záznamy dle EAN/product_code)

**POST `/api/catalog/import-url`** — Request body:
```json
{
  "url": "https://eshop.cz/produkt/xyz",
  "product_type": "own"
}
```
`product_type`: `"own"` (vlastní produkt) nebo `"competitor"` (konkurenční produkt). Automaticky stáhne název stránky.

**POST `/api/catalog/feeds/{id}/fetch`** — Ručně spustí načtení feedu:
1. Stáhne XML z `feed_url`
2. Parsuje přes `heureka_parser`
3. Importuje/aktualizuje produkty v `catalog_products`
4. Pro každý katalogový produkt propojený se sledovaným produktem (`catalog_product_id`) automaticky aktualizuje cenu v tabulce `prices` (viz `_sync_tracked_price`)
5. Aktualizuje `last_fetched_at`, `last_fetch_status`, `last_imported_count`, `last_updated_count`

### 5.5 Endpointy: `/api/competitors`

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/` | Seznam konkurentů s filtry |
| POST | `/` | Přidá nového konkurenta |
| GET | `/{id}` | Detail konkurenta |
| PUT | `/{id}` | Aktualizace informací |
| DELETE | `/{id}` | Soft delete (is_active=false) |
| POST | `/{id}/rescrape` | Znovu stáhne metadata z webu |
| GET | `/{id}/prices` | Historie cen (max 200, days_back=30) |
| GET | `/alerts` | Upozornění |
| PUT | `/alerts/{id}/dismiss` | Označí upozornění jako přečtené |

**GET `/api/competitors/`** — Query parametry: `category`, `market`, `is_active`. Každý konkurent je obohacen o: `latest_price` (z competitor_prices), `latest_rank` (z competitor_ranks), `unread_alerts_count`.

**POST `/api/competitors/`** — Request body:
```json
{
  "url": "https://competitor.cz",
  "market": "CZ"
}
```
Systém automaticky extrahuje doménové jméno jako `name`. Unikátnost dle kombinace `url + market + company_id`.

**POST `/api/competitors/{id}/rescrape`** — Volá `scraper.py` s timeoutem 8 sekund (`asyncio.wait_for`). Aktualizuje: `name`, `logo_url`, `description`, `email`, `phone`, `address`, `last_scrape_date`, `scrape_attempts`.

### 5.6 Endpointy: `/api/users`

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/` | Seznam aktivních uživatelů |
| POST | `/` | Vytvoří nového uživatele |
| GET | `/pending` | Čekající na schválení (**MUSÍ být PŘED `/{id}`**) |
| PUT | `/{id}` | Změní roli uživatele |
| DELETE | `/{id}` | Smaže uživatele |
| POST | `/{id}/approve` | Schválí uživatele |
| POST | `/{id}/reject` | Zamítne uživatele |

**KRITICKÉ:** Route `/pending` MUSÍ být definována PŘED `/{id}`, jinak FastAPI zachytí `pending` jako `{id}` parametr. Viz sekce 17.

**POST `/api/users/`** — Vytvoří uživatele s dočasným heslem `"TempPassword123!"`. Nastaví `is_verified=true, is_approved=true`.

**GET `/api/users/pending`** — Query parametr `status_filter`:
- `all` — všichni neaktivní/neschválení
- `pending_verification` — `is_verified=false`
- `pending_approval` — `is_verified=true, is_approved=false`

**POST `/api/users/{id}/approve`** — Nastaví `is_approved=true, approved_at=now()`. Odešle notifikační email uživateli.

**POST `/api/users/{id}/reject`** — Nastaví `is_active=false`.

### 5.7 Endpointy: `/api/admin`

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/login-attempts` | Historie pokusů o přihlášení |
| DELETE | `/login-attempts/{id}` | Smaže záznam pokusu |
| GET | `/users` | Seznam všech uživatelů (admin only) |
| POST | `/users` | Vytvoří uživatele |
| PUT | `/users/{id}` | Aktualizuje roli, is_active, full_name |
| DELETE | `/users/{id}` | Smaže uživatele |

**GET `/api/admin/login-attempts`** — Query parametry: `email` (filtr), `days` (počet dní zpět), `page`, `per_page`.

**POST `/api/admin/users`** — `company_id` je volitelný; pokud není zadán, použije se `company_id` aktuálního admin uživatele. `is_verified=true, is_approved=true`.

### 5.8 Ostatní endpointy

#### /api/audit-logs

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/` | Auditní záznamy |

#### /api/analytics/{product_id}

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/` | Hero score, margin_risk, positioning, category_rank |

#### /api/simulator

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/products` | Produkty pro simulaci |
| POST | `/calculate` | Simulace změny ceny s elasticitou poptávky |

#### /api/opportunities

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/` | Produktové příležitosti (top produkty s priority skóre) |

#### /api/export

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/products/xlsx` | Export sledovaných produktů do Excel |
| GET | `/products/csv` | Export sledovaných produktů do CSV |

---

## 6. Business logika

### 6.1 Hero Score (0–100 bodů)

Hero Score měří připravenost produktu na optimální cenotvorbu. Počítá se dynamicky z aktuálních dat produktu.

| Kritérium | Max bodů | Podmínka |
|---|---|---|
| Aktuální prodejní cena nastavena | 25 | `current_price` není null |
| Nákupní cena nastavena | 15 | `purchase_price` není null |
| Kvalita marže | 35 | Viz tabulka níže |
| Minimální cena nastavena | 10 | `min_price` není null |
| Sleduje alespoň 1 URL konkurenta | 15 | `len(competitor_urls) >= 1` |

**Bodování kvality marže:**

| Hrubá marže | Body |
|---|---|
| ≤ 0 % | 0 |
| > 0 % | 5 |
| ≥ 5 % | 10 |
| ≥ 10 % | 18 |
| ≥ 20 % | 28 |
| ≥ 30 % | 35 |

```python
def calculate_hero_score(product, current_price, purchase_price) -> int:
    score = 0

    # Aktuální cena (25 bodů)
    if current_price is not None:
        score += 25

    # Nákupní cena (15 bodů)
    if purchase_price is not None:
        score += 15

    # Kvalita marže (35 bodů)
    if current_price and purchase_price and current_price > 0:
        margin = (current_price - purchase_price) / current_price * 100
        if margin >= 30:
            score += 35
        elif margin >= 20:
            score += 28
        elif margin >= 10:
            score += 18
        elif margin >= 5:
            score += 10
        elif margin > 0:
            score += 5
        # else: 0 bodů

    # Minimální cena (10 bodů)
    if product.min_price is not None:
        score += 10

    # URL konkurenta (15 bodů)
    competitor_urls = product.competitor_urls or []
    if len(competitor_urls) >= 1:
        score += 15

    return score
```

### 6.2 Výpočet marže

```python
def calculate_margin(current_price: float, purchase_price: float) -> float:
    """
    Hrubá marže v procentech.
    Příklad: prodejní 299 Kč, nákupní 200 Kč → marže = (299-200)/299*100 = 33.1 %
    """
    if current_price and purchase_price and current_price > 0:
        return (current_price - purchase_price) / current_price * 100
    return 0.0
```

**Barevné kódování marže (frontend):**

| Marže | Barva badge |
|---|---|
| ≥ 20 % | Zelená |
| ≥ 10 % | Žlutá |
| > 0 % | Oranžová |
| ≤ 0 % | Červená |

### 6.3 Automatická synchronizace cen z feedu (`_sync_tracked_price`)

Po každém importu/aktualizaci katalogového produktu z XML feedu:

```python
def _sync_tracked_price(db, catalog_product_id: UUID, price_with_vat: float, market: str):
    """
    Pokud je katalogový produkt propojen se sledovaným produktem
    (products.catalog_product_id = catalog_product_id),
    automaticky vytvoří nebo aktualizuje záznam v tabulce prices
    s hodnotou PRICE_VAT z XML feedu.
    """
    tracked = db.query(Product).filter(
        Product.catalog_product_id == catalog_product_id
    ).first()

    if tracked:
        price_record = db.query(Price).filter(
            Price.product_id == tracked.id,
            Price.market == market
        ).order_by(Price.changed_at.desc()).first()

        if price_record is None or price_record.current_price != price_with_vat:
            new_price = Price(
                product_id=tracked.id,
                market=market,
                currency="CZK" if market == "CZ" else "EUR",
                current_price=price_with_vat,
                changed_at=datetime.utcnow()
            )
            db.add(new_price)
```

### 6.4 Margin Risk klasifikace

| Hodnota | Podmínka |
|---|---|
| `High` | Marže < 5 % |
| `Medium` | 5 % ≤ Marže < 15 % |
| `Low` | Marže ≥ 15 % |

---

## 7. Frontend — stránky a komponenty

### 7.1 Routování

```tsx
// App.tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />
  <Route path="/verify-email" element={<VerifyEmailPage />} />

  <Route element={<ProtectedRoute />}>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/products" element={<ProductsPage />} />
    <Route path="/products/:id" element={<ProductDetailPage />} />
    <Route path="/catalog" element={<CatalogPage />} />
    <Route path="/competitors" element={<CompetitorsPage />} />
    <Route path="/competitors/:id" element={<CompetitorDetailPage />} />
    <Route path="/import" element={<ImportPage />} />
    <Route path="/users" element={<UsersPage />} />
    <Route path="/audit" element={<AuditPage />} />
    <Route path="/simulator" element={<SimulatorPage />} />
    <Route path="/seasonality" element={<SeasonalityPage />} />
    <Route path="/opportunities" element={<OpportunitiesPage />} />
    <Route path="/export" element={<ExportPage />} />
    <Route path="/admin" element={<ProtectedRoute adminOnly />} />
    <Route path="/admin/login-attempts" element={<ProtectedRoute adminOnly><LoginAttemptsPage /></ProtectedRoute>} />
    <Route path="/admin/users" element={<ProtectedRoute adminOnly><UsersManagementPage /></ProtectedRoute>} />
  </Route>

  <Route path="/" element={<Navigate to="/dashboard" />} />
</Routes>
```

### 7.2 Stránka: `/login` — LoginPage

**Layout:** Split-screen — vlevo branding (logo Nuties, popis), vpravo přihlašovací formulář.

**Formulář:** Email + heslo. Submit tlačítko.

**Chybové hlášky:**
- HTTP 401 + `"Email not verified"` → "Email nebyl ověřen. Zkontrolujte svou schránku."
- HTTP 401 + `"Awaiting admin approval"` → "Váš účet čeká na schválení administrátorem."
- HTTP 403 → "Váš účet byl deaktivován."
- Jiné → "Neplatné přihlašovací údaje."

**Po úspěšném přihlášení:** Přesměruje na `/dashboard`.

### 7.3 Stránka: `/register` — RegisterPage

**Formulář:** Email, celé jméno, název firmy, heslo, potvrzení hesla.

**Validace (frontend):**
- Email: regex validace formátu
- Heslo: minimálně 8 znaků
- Heslo a potvrzení hesla se musí shodovat

**Po odeslání:** Přesměruje na `/verify-email`.

### 7.4 Stránka: `/verify-email` — VerifyEmailPage

**Funkce:**
1. Při načtení stránky přečte `?token=...&email=...` z URL
2. Email jako záloha: pokud chybí v URL, přečte z `localStorage` (uloženo při registraci)
3. Automaticky zavolá `POST /api/auth/verify-email`

**Stavy:**
- `loading` — spinner
- `success` — potvrzení úspěšného ověření, odkaz na přihlášení
- `error` — chybová zpráva, tlačítko "Zkusit znovu" (znovu spustí verifikaci)

### 7.5 Stránka: `/products` — ProductsPage

**Funkce:**
- Tabulka sledovaných produktů načtená přes `useQuery`
- Vyhledávací pole (fulltext přes název, EAN)
- Filtr trhu (CZ/SK)
- Checkboxy pro hromadný výběr
- **Bulk selection bar** zobrazený dole při výběru více produktů

**Sloupce tabulky:**
- Checkbox
- Thumbnail (obrázek produktu, placeholder pokud chybí)
- Název produktu
- EAN
- Kategorie
- Aktuální cena (s přeškrtnutou cenou pokud existuje `old_price`)
- Marže badge (barevné kódování viz sekce 6.2)

**Klik na řádek** → přejde na `/products/:id`

**Mazání produktu** — Potvrzovací dialog:
> "Odebrat [název produktu] ze sledování? Produkt zůstane v katalogu produktů."

### 7.6 Stránka: `/products/:id` — ProductDetailPage

**Layout:** 3 sloupce

#### Levý sloupec: Cenotvorba
- Tlačítko "Upravit ručně" — otevře formulář pro editaci ceny
- Tlačítko "Na e-shopu" — otevře `url_reference` v novém tabu

**Formulář prodejní ceny** (zobrazí se po kliknutí "Upravit ručně"):
- `current_price` — prodejní cena
- `old_price` — přeškrtnutá cena (volitelná)
- `market` — selector CZ/SK
- Uložit / Zrušit

**Formulář nákupní ceny** (zobrazí se po hover na řádek "Nákupní cena"):
- `purchase_price` — nákupní cena
- `min_price` — minimální prodejní cena
- Uložit / Zrušit

**Barevné boxíky:**
- Modrý box: AKTUÁLNÍ CENA
- Oranžový box: PŘEŠKRTNUTÁ CENA

**Datové řádky:**
- Nákupní cena
- Minimální cena
- Aktuální marže (barevný badge)
- Trh

#### Střední sloupec: Ceny konkurentů
- Vstupní pole pro URL konkurenčního produktu + tlačítko Přidat
- Seznam přidaných URL:
  - Favicon (Google Favicons API)
  - Doménové jméno
  - Ikona externího odkazu
  - Market badge (CZ/SK)
  - Tlačítko smazání
- Prázdný stav: výzva k přidání první URL konkurenta

#### Pravý sloupec: Vývoj cen + Hero skóre
**Historie cen:**
- Tabulka: datum + čas, cena, přeškrtnutá cena

**Hero Score gauge:**
- SVG semi-kruhový gauge (polooblouk)
- Stupnice 0–100, zobrazuje aktuální skóre
- Barva: zelená (≥70), žlutá (40–69), červená (<40)

**Breakdown Hero Score:**
| Položka | Max |
|---|---|
| Aktuální cena | 25 |
| Nákupní cena | 15 |
| Kvalita marže | 35 |
| Minimální cena | 10 |
| Sleduje konkurenty | 15 |

Každá položka zobrazena jako progress bar (dosažené body / maximum).

**Nápověda:** Pokud score < 60, zobrazí se tip, co doplnit pro zlepšení skóre.

### 7.7 Stránka: `/catalog` — CatalogPage

**Funkce:**
- Tabulka všech produktů z `catalog_products`
- Vyhledávání (fulltext)
- Filtr trhu (CZ/SK)
- Filtr kategorie (dropdown z `/api/catalog/categories`)
- Zobrazuje: název, EAN, kategorie, cena bez DPH + DPH sazba, zdroj importu
- Tlačítko "Přidat do sledování" → POST `/api/products/` s `catalog_product_id`

### 7.8 Stránka: `/competitors` — CompetitorsPage

**Layout:** Grid karet

**Karta konkurenta obsahuje:**
- Favicon (Google Favicons API: `https://www.google.com/s2/favicons?sz=64&domain_url=...`)
- Doménové jméno
- Market badge (CZ/SK)
- Status posledního scrapingu (success/error s ikonou)
- Datum posledního scrapingu

**Klik na kartu** → přejde na `/competitors/:id`

**Přidat konkurenta:** Formulář s URL + market selector.

### 7.9 Stránka: `/competitors/:id` — CompetitorDetailPage

**Hlavička:**
- Favicon (velký, 64×64)
- Název (doménové jméno)
- Market badge

**Inline editační formulář:**
- `description` — textarea
- `category` — text input
- `email`, `phone`, `address` — text inputs
- Tlačítko "Uložit" → PUT `/api/competitors/{id}`

**Tlačítko "Načíst info z webu":** Volá POST `/api/competitors/{id}/rescrape`. Max 8s odezva, zobrazí spinner. Po dokončení obnoví data.

**Grid statistik:**
- Počet pokusů o scraping (`scrape_attempts`)
- Počet selhání (`scrape_failures`)
- Datum prvního scrapingu (`first_scrape_date`)
- Datum posledního scrapingu (`last_scrape_date`)
- Chybová zpráva (`scrape_error`) pokud existuje

### 7.10 Stránka: `/import` — ImportPage

**3 záložky:**

#### Záložka 1: Soubor
- Drag & drop zóna pro upload souboru
- Podporované formáty: `.xml` (Heureka), `.xlsx` (Excel)
- Volba trhu: CZ / SK
- Checkbox "Sloučit s existujícími produkty" (`merge_existing`)
- Po výběru souboru se automaticky detekuje formát a zavolá správný endpoint

#### Záložka 2: URL
- Textové pole pro URL
- Radio: "Vlastní produkt" (`own`) / "Konkurenční produkt" (`competitor`)
- Tlačítko Import
- Systém automaticky stáhne název stránky z URL

#### Záložka 3: Aktivní feedy
- Formulář pro přidání nového feedu:
  - URL feedu
  - Název feedu
  - Trh (CZ/SK)
  - Checkbox "Sloučit s existujícími"
- Seznam aktivních feed subscriptions:
  - Název + URL
  - Trh badge
  - Status posledního načtení (success ✓ / error ✗)
  - Čas posledního načtení
  - Chybová zpráva při posledním načtení (pokud existuje)
  - Počty: nově importovaných / aktualizovaných produktů
  - Tlačítko obnovit ↻ (ikona) → POST `/api/catalog/feeds/{id}/fetch`
  - Tlačítko smazání

### 7.11 Stránka: `/users` — UsersPage

**Sekce 1: Aktivní uživatelé**

Formulář pro pozvání nového uživatele: email, celé jméno, role.

Tabulka uživatelů:
| Sloupec | Obsah |
|---|---|
| Jméno | `full_name` |
| Email | `email` |
| Role | Badge (admin/pricing_manager/category_manager/read_only) |
| Status | Badge (aktivní/neaktivní) |
| Akce | Smazat |

**Sekce 2: Čekající schválení**

Filtry:
- Všichni čekající
- Čekají na ověření emailu
- Čekají na schválení

Tlačítka u každého čekajícího uživatele:
- "Schválit" → POST `/api/users/{id}/approve`
- "Zamítnout" → POST `/api/users/{id}/reject`

### 7.12 Stránka: `/admin/login-attempts` — LoginAttemptsPage

**Filtry:** Email (text), počet dní zpět (select).

**Tabulka:**
| Sloupec | Obsah |
|---|---|
| Čas | `timestamp` |
| Email | `email` |
| IP adresa | `ip_address` |
| User-Agent | `user_agent` (zkráceno) |
| Výsledek | Úspěch (zelená) / Neúspěch (červená) |
| Chyba | `error_message` |
| Akce | Smazat záznam |

### 7.13 Stránka: `/simulator` — SimulatorPage

**Formulář:**
- Výběr produktu (dropdown ze `/api/simulator/products`)
- Nová cena nebo procentuální změna
- Cílová marže
- Elasticita poptávky (koeficient)

**Výsledky po výpočtu (POST `/api/simulator/calculate`):**
- Nová cena
- Nová marže
- Odhadované prodeje
- Odhadované tržby
- Doporučení (text)

### 7.14 Stránka: `/opportunities` — OpportunitiesPage

Produktové příležitosti seřazené dle priority skóre z `/api/opportunities`.

Každá příležitost:
- Priority badge: `high` (červená), `medium` (žlutá), `low` (šedá)
- Název produktu
- Cenový rozsah
- Popis příležitosti
- Tagy (kategorie, trh, atd.)

### 7.15 Ostatní stránky

- **`/seasonality`** — Sezónní engine (placeholder UI, funkce bude doplněna)
- **`/export`** — Dvě tlačítka: "Exportovat XLSX" a "Exportovat CSV" → GET endpointy
- **`/audit`** — Tabulka audit_logs (datum, akce, pole, stará hodnota, nová hodnota)
- **`/dashboard`** — Přehledový dashboard s klíčovými metrikami a statistikami

---

## 8. Správa stavu (State Management)

### 8.1 Auth Store (Zustand)

**Soubor:** `src/store/auth.ts`

```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setToken: (token: string) => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { access_token } = response.data;
    localStorage.setItem('access_token', access_token);
    set({ token: access_token, isAuthenticated: true });
    // Načti user data
    const user = await api.get('/auth/me');
    set({ user: user.data });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      set({ token });
      try {
        const user = await api.get('/auth/me');
        set({ user: user.data, isAuthenticated: true });
      } catch {
        localStorage.removeItem('access_token');
        set({ token: null, isAuthenticated: false });
      }
    }
  },

  setToken: (token) => {
    localStorage.setItem('access_token', token);
    set({ token });
  },
}));
```

**Důležité:** Token se čte vždy čerstvě z localStorage i ze state:
```typescript
const token = this.token || localStorage.getItem('access_token');
```

### 8.2 Market Store (Zustand)

**Soubor:** `src/store/market.ts`

```typescript
interface MarketState {
  selectedMarket: 'CZ' | 'SK';
  setMarket: (market: 'CZ' | 'SK') => void;
}

const useMarketStore = create<MarketState>((set) => ({
  selectedMarket: 'CZ',
  setMarket: (market) => set({ selectedMarket: market }),
}));
```

Změna trhu se propaguje do všech komponent používajících `useMarketStore`.

### 8.3 API Client

**Soubor:** `src/api/client.ts`

```typescript
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL;

// Automatická konverze http → https při HTTPS frontendu
const safeBaseURL = window.location.protocol === 'https:' && baseURL.startsWith('http:')
  ? baseURL.replace('http:', 'https:')
  : baseURL;

const apiClient = axios.create({ baseURL: safeBaseURL });

// Request interceptor — přidá Bearer token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token || localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — 401 → logout
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## 9. Autentizace a autorizace

### 9.1 JWT

```python
# app/auth.py

from jose import JWTError, jwt
from datetime import datetime, timedelta

SECRET_KEY = os.environ["SECRET_KEY"]
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

**FastAPI dependency pro chráněné endpointy:**
```python
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    payload = verify_token(token)
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

async def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
```

### 9.2 Middleware pro multi-tenancy

Každý endpoint přistupuje pouze k datům vlastní firmy:
```python
# Filtrování dle company_id
products = db.query(Product).filter(
    Product.company_id == current_user.company_id
).all()
```

### 9.3 Frontend ProtectedRoute

```tsx
// components/ProtectedRoute.tsx
interface Props {
  adminOnly?: boolean;
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<Props> = ({ adminOnly = false, children }) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
```

---

## 10. Email workflow

### 10.1 Registrace a ověření emailu

```
Registrace → Generuj token → Odešli email s odkazem → Uživatel klikne → is_verified=true
```

**Odkaz v emailu:**
```
https://pricing.jacobsvoboda.cz/verify-email?token=<URL-SAFE-TOKEN>&email=<EMAIL>
```

### 10.2 Schválení uživatelem

```
Admin klikne "Schválit" → is_approved=true → Odešli notifikační email uživateli
```

### 10.3 Implementace asynchronního emailu

```python
# app/email_utils.py
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

async def send_email(to: str, subject: str, html_body: str):
    try:
        message = MIMEMultipart("alternative")
        message["From"] = SMTP_FROM_EMAIL
        message["To"] = to
        message["Subject"] = subject
        message.attach(MIMEText(html_body, "html"))

        smtp_params = {
            "hostname": SMTP_HOST,
            "port": SMTP_PORT,
            "username": SMTP_USER,
            "password": SMTP_PASSWORD,
        }

        if SMTP_PORT == 465:
            # SSL/TLS od začátku
            await aiosmtplib.send(message, use_tls=True, **smtp_params)
        else:
            # STARTTLS (port 587)
            await aiosmtplib.send(message, start_tls=True, **smtp_params)

    except Exception as e:
        # Email selhání NESMÍ shodit aplikaci
        print(f"Email sending failed: {e}")
```

**Klíčové pravidlo:** Odesílání emailů je vždy v `try/except`. Selhání emailu nesmí způsobit HTTP error.

---

## 11. Plánované úlohy (APScheduler)

### 11.1 Konfigurace

```python
# app/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

def start_scheduler():
    scheduler.add_job(
        refresh_all_feeds,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="daily_feed_refresh",
        replace_existing=True
    )
    scheduler.start()

def shutdown_scheduler():
    scheduler.shutdown()
```

### 11.2 Cron job: Denní refresh feedů

**Spouštěn:** Každý den v 02:00 UTC

```python
async def refresh_all_feeds():
    """
    Načte všechny aktivní FeedSubscriptions a pro každý
    spustí _fetch_and_import_feed.
    """
    db = SessionLocal()
    try:
        active_feeds = db.query(FeedSubscription).filter(
            FeedSubscription.is_active == True
        ).all()

        for feed in active_feeds:
            try:
                await _fetch_and_import_feed(db, feed)
            except Exception as e:
                feed.last_fetch_status = "error"
                feed.last_fetch_message = str(e)[:500]
                db.commit()
    finally:
        db.close()
```

### 11.3 Feed import logika (`_fetch_and_import_feed`)

```python
async def _fetch_and_import_feed(db: Session, feed: FeedSubscription):
    # 1. Stáhnout XML obsah
    async with aiohttp.ClientSession() as session:
        async with session.get(feed.feed_url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            xml_content = await resp.text()

    # 2. Parsovat XML (viz sekce 12)
    products = parse_heureka_xml(xml_content, market=feed.market)

    imported = 0
    updated = 0

    for p in products:
        # 3. Najít existující produkt dle EAN nebo product_code
        existing = None
        if p.get('ean'):
            existing = db.query(CatalogProduct).filter(
                CatalogProduct.ean == p['ean'],
                CatalogProduct.company_id == feed.company_id
            ).first()
        if not existing and p.get('product_code'):
            existing = db.query(CatalogProduct).filter(
                CatalogProduct.product_code == p['product_code'],
                CatalogProduct.company_id == feed.company_id
            ).first()

        if existing and feed.merge_existing:
            # 4a. Aktualizovat existující
            for key, value in p.items():
                if value is not None:
                    setattr(existing, key, value)
            existing.updated_at = datetime.utcnow()
            updated += 1
            catalog_id = existing.id
        else:
            # 4b. Vytvořit nový
            new_product = CatalogProduct(company_id=feed.company_id, **p)
            db.add(new_product)
            db.flush()
            catalog_id = new_product.id
            imported += 1

        # 5. Sync ceny sledovaného produktu
        if p.get('price_with_vat'):
            _sync_tracked_price(db, catalog_id, p['price_with_vat'], feed.market)

    # 6. Aktualizovat status feedu
    feed.last_fetched_at = datetime.utcnow()
    feed.last_fetch_status = "success"
    feed.last_imported_count = imported
    feed.last_updated_count = updated
    db.commit()
```

---

## 12. Import a parsování dat

### 12.1 Heureka XML Parser (`heureka_parser.py`)

Parser podporuje dva XML formáty a zkouší je v pořadí:

**Formát 1: SHOPITEM** (reálný Heureka CZ/SK formát)

```xml
<SHOP>
  <SHOPITEM>
    <EAN>1234567890123</EAN>
    <PRODUCTNO>PRD-001</PRODUCTNO>
    <PRODUCTNAME>Název produktu</PRODUCTNAME>
    <PRODUCT>Alternativní název</PRODUCT>
    <CATEGORYTEXT>Kategorie | Podkategorie</CATEGORYTEXT>
    <DESCRIPTION>Popis produktu</DESCRIPTION>
    <URL>https://eshop.cz/produkt/xyz</URL>
    <IMGURL>https://eshop.cz/img/xyz.jpg</IMGURL>
    <PRICE>247.93</PRICE>           <!-- bez DPH -->
    <PRICE_VAT>299.00</PRICE_VAT>   <!-- s DPH — toto je prodejní cena -->
    <VAT>12%</VAT>                  <!-- DPH sazba -->
    <QUANTITY_UNIT>ks</QUANTITY_UNIT>
    <MANUFACTURER>Výrobce</MANUFACTURER>
  </SHOPITEM>
</SHOP>
```

**Formát 2: ITEM** (starší/alternativní formát)

```xml
<ITEMS>
  <ITEM>
    <ID>1234567890123</ID>          <!-- EAN -->
    <TITLE>Název produktu</TITLE>
    <PRICE_CZK>299.00</PRICE_CZK>
    <PRICE_SKK>12.00</PRICE_SKK>
    <UNIT>ks</UNIT>
  </ITEM>
</ITEMS>
```

**Implementace parseru:**

```python
def parse_heureka_xml(xml_content: str, market: str = "CZ") -> list[dict]:
    root = ET.fromstring(xml_content)

    # Zkus SHOPITEM formát
    items = root.findall('.//SHOPITEM')

    if not items:
        # Záložní: ITEM formát
        items = root.findall('.//ITEM')
        return [_parse_item_format(item, market) for item in items]

    return [_parse_shopitem_format(item, market) for item in items]


def _parse_shopitem_format(item, market: str) -> dict:
    def get_text(*tags) -> str | None:
        """Zkusí více tagů, vrátí první nalezený."""
        for tag in tags:
            el = item.find(tag)
            if el is not None and el.text:
                return el.text.strip()
        return None

    # Normalizace quantity_unit: "1xks" → "ks"
    unit = get_text('QUANTITY_UNIT')
    if unit:
        import re
        unit = re.sub(r'^\d+x', '', unit).strip()

    return {
        'ean': get_text('EAN'),
        'product_code': get_text('PRODUCTNO'),
        'name': get_text('PRODUCTNAME', 'PRODUCT') or 'Neznámý produkt',
        'category': get_text('CATEGORYTEXT'),
        'description': get_text('DESCRIPTION'),
        'url_reference': get_text('URL'),
        'thumbnail_url': get_text('IMGURL'),
        'price_without_vat': _parse_price(get_text('PRICE')),
        'price_with_vat': _parse_price(get_text('PRICE_VAT')),
        'vat_rate': _parse_vat(get_text('VAT')),
        'unit_of_measure': unit or 'ks',
        'manufacturer': get_text('MANUFACTURER'),
        'market': market,
        'imported_from': f'heureka_{market.lower()}',
    }
```

### 12.2 Excel Import (`openpyxl`)

```python
def import_from_excel(file_content: bytes, company_id: UUID, market: str) -> dict:
    wb = openpyxl.load_workbook(io.BytesIO(file_content))
    ws = wb.active

    # Hlavičkový řádek
    headers = [str(cell.value).strip().lower() for cell in ws[1]]

    # Mapování názvů sloupců
    column_map = {
        'název': 'name', 'name': 'name',
        'ean': 'ean',
        'cena bez dph': 'price_without_vat',
        'kategorie': 'category',
        # ... atd.
    }

    imported = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        data = {}
        for i, value in enumerate(row):
            if i < len(headers) and headers[i] in column_map:
                data[column_map[headers[i]]] = value
        if data.get('name'):
            imported.append(data)

    return imported
```

---

## 13. Web scraper

### 13.1 Implementace (`scraper.py`)

```python
import aiohttp
import asyncio
from bs4 import BeautifulSoup
import re

SCRAPER_TIMEOUT = 7.0  # Vnitřní limit scraperu
EXTERNAL_TIMEOUT = 8.0  # Limit pro asyncio.wait_for

USER_AGENT = (
    "Mozilla/5.0 (compatible; NutiesPricingBot/1.0; "
    "+https://pricing.jacobsvoboda.cz)"
)

async def scrape_competitor(url: str) -> dict:
    """
    Stáhne metadata konkurenta z jeho webu.
    Vrátí: name, logo_url, description, emails, phones, address, prices_found
    """
    result = {
        'name': None,
        'logo_url': None,
        'description': None,
        'email': None,
        'phone': None,
        'address': None,
        'prices_found': [],
    }

    headers = {'User-Agent': USER_AGENT}

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=SCRAPER_TIMEOUT)
            ) as response:
                html = await response.text()

        soup = BeautifulSoup(html, 'html.parser')

        # Název: <title> nebo og:site_name
        og_site = soup.find('meta', property='og:site_name')
        if og_site:
            result['name'] = og_site.get('content', '').strip()
        elif soup.title:
            result['name'] = soup.title.string.strip()

        # Popis: og:description nebo meta description
        og_desc = soup.find('meta', property='og:description')
        meta_desc = soup.find('meta', {'name': 'description'})
        if og_desc:
            result['description'] = og_desc.get('content', '')
        elif meta_desc:
            result['description'] = meta_desc.get('content', '')

        # Email: regex v textu stránky
        emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', html)
        if emails:
            result['email'] = emails[0]

        # Telefon: regex
        phones = re.findall(r'[\+\d][\d\s\-\(\)]{7,15}\d', html)
        if phones:
            result['phone'] = phones[0].strip()

    except asyncio.TimeoutError:
        raise ValueError(f"Scraping timed out after {SCRAPER_TIMEOUT}s")
    except Exception as e:
        raise ValueError(f"Scraping failed: {str(e)}")

    return result
```

**Použití v routeru s timeoutem:**

```python
# app/routers/competitors.py

@router.post("/{competitor_id}/rescrape")
async def rescrape_competitor(competitor_id: UUID, ...):
    try:
        result = await asyncio.wait_for(
            scrape_competitor(competitor.url),
            timeout=8.0  # Railway timeout ochrana
        )
        # Aktualizuj data konkurenta
        competitor.name = result.get('name') or competitor.name
        competitor.logo_url = result.get('logo_url')
        competitor.description = result.get('description')
        competitor.email = result.get('email')
        competitor.phone = result.get('phone')
        competitor.address = result.get('address')
        competitor.last_scrape_date = datetime.utcnow()
        competitor.scrape_attempts += 1
        db.commit()
    except asyncio.TimeoutError:
        competitor.scrape_attempts += 1
        competitor.scrape_failures += 1
        competitor.scrape_error = "Timeout po 8 sekundách"
        db.commit()
        raise HTTPException(status_code=408, detail="Scraping timed out")
```

### 13.2 Favicon konkurenta

Logo konkurenta se nezískává přímo ze scrapu, ale dynamicky generuje přes Google Favicons API:

```typescript
// Frontend
const getFaviconUrl = (competitorUrl: string): string => {
  const domain = new URL(competitorUrl).hostname;
  return `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}`;
};
```

---

## 14. Proměnné prostředí

### 14.1 Backend (Railway)

```env
# Databáze (Supabase)
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres

# JWT
SECRET_KEY=<náhodný-silný-klíč-min-32-znaků>

# SMTP (SendGrid)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<sendgrid-api-key>
SMTP_FROM_EMAIL=noreply@jacobsvoboda.cz

# Frontend URL (pro email linky)
FRONTEND_URL=https://pricing.jacobsvoboda.cz

# Debug
DEBUG=false
```

### 14.2 Frontend (Vercel)

```env
VITE_API_URL=https://api.jacobsvoboda.cz/api
```

**Kritické:** Hodnota `VITE_API_URL` MUSÍ být HTTPS URL. API client automaticky konvertuje `http://` na `https://` pokud je frontend načten přes HTTPS (viz sekce 8.3).

---

## 15. Deployment

### 15.1 Backend (Railway)

**Procfile:**
```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**Dockerfile (alternativa):**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

**railway.json:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**Automatický deploy:** Při push na `main` branch.

**Railway timeout:** Maximální doba odezvy je ~30s. Všechny operace (scraping, import) MUSÍ mít timeout < 25s.

### 15.2 Frontend (Vercel)

**Nastavení projektu:**
- Build Command: `vite build`
- Output Directory: `dist`
- Install Command: `npm install`

**vercel.json** (SPA routing):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 15.3 Supabase (PostgreSQL)

**Connection string formát:**
```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

**Poznámky:**
- Migrace se spouštějí **ručně** přes SQL Editor v Supabase dashboardu
- Soubory migrací jsou uloženy v `/backend/migrations/` a číslované `001–009`
- `Base.metadata.create_all()` v SQLAlchemy **nepřidá** nové sloupce do existujících tabulek — vždy použij SQL migrace

---

## 16. Databázové migrace

### 16.1 Konvence

Migrace jsou číslované soubory SQL v `/backend/migrations/`:
```
001_initial_schema.sql
002_add_feed_subscriptions.sql
003_add_catalog_products.sql
...
009_add_analytics.sql
```

### 16.2 Aplikace migrací

**Postup:**
1. Otevři Supabase Dashboard → SQL Editor
2. Zkopíruj obsah migračního souboru
3. Spusť

**Přidání nového sloupce (příklad):**
```sql
-- migrations/010_add_new_column.sql
ALTER TABLE catalog_products
ADD COLUMN IF NOT EXISTS new_column VARCHAR;

-- Přidání indexu
CREATE INDEX IF NOT EXISTS idx_catalog_products_new_column
ON catalog_products(new_column);
```

---

## 17. Známé patterny a úskalí

### 17.1 Pydantic v2 — UUID serializace

**Problém:** Pydantic v2 v lax mode nekonvertuje `uuid.UUID` na `str` automaticky pro pole mapovaná z SQLAlchemy `UUID(as_uuid=True)`. Výsledkem je HTTP 500 při serializaci.

**Správné řešení:**
```python
# ŠPATNĚ
class ProductResponse(BaseModel):
    id: str  # Způsobí 500 error při UUID hodnotě

# SPRÁVNĚ
from uuid import UUID

class ProductResponse(BaseModel):
    id: UUID  # Pydantic v2 správně serializuje

    model_config = {"from_attributes": True}
```

### 17.2 Pydantic v2 — Config style

```python
# ŠPATNĚ (Pydantic v1 style)
class ProductResponse(BaseModel):
    class Config:
        from_attributes = True

# SPRÁVNĚ (Pydantic v2 style)
class ProductResponse(BaseModel):
    model_config = {"from_attributes": True}
```

### 17.3 CORS a 500 errors

**Problém:** FastAPI CORS middleware NEPŘIDÁVÁ CORS hlavičky k HTTP 500 response. V prohlížeči se to jeví jako CORS chyba, ale skutečný problém je vždy backend 500.

**Diagnóza:** Vždy zkontroluj Railway logy, ne jen chybovou hlášku v prohlížeči.

**Prevence:** Přidej globální exception handler:
```python
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )
```

### 17.4 FastAPI route ordering — `/pending` vs `/{id}`

**Problém:** FastAPI zpracovává routes v pořadí definice. Pokud je `/{user_id}` definována před `/pending`, pak požadavek na `/pending` bude zachycen jako `{user_id}="pending"`.

**Řešení:** Vždy definuj specifické routes PŘED parametrickými:
```python
# app/routers/users.py

# SPRÁVNĚ — specifická route PŘED parametrickou
@router.get("/pending")
async def get_pending_users(...): ...

@router.get("/{user_id}")
async def get_user(user_id: UUID, ...): ...
```

### 17.5 Railway connection timeout

**Problém:** Railway má ~30s connection timeout. Scraping a jiné async operace mohou trvat déle.

**Řešení:** Vždy použi `asyncio.wait_for` s timeoutem < 25s:
```python
result = await asyncio.wait_for(
    long_running_operation(),
    timeout=8.0
)
```

### 17.6 SQLAlchemy `create_all` vs migrace

**Problém:** `Base.metadata.create_all(bind=engine)` vytvoří tabulky pokud neexistují, ale NEPŘIDÁ nové sloupce do existujících tabulek.

**Pravidlo:** Pro jakoukoliv změnu schématu existující databáze VŽDY vytvoř SQL migraci a spusť ji ručně přes Supabase SQL Editor.

### 17.7 SMTP TLS konfigurace

```python
# Port 465 = SSL/TLS od začátku
if SMTP_PORT == 465:
    await aiosmtplib.send(message, use_tls=True, ...)

# Port 587 = STARTTLS (plain → upgrade na TLS)
else:  # port 587
    await aiosmtplib.send(message, start_tls=True, ...)
```

### 17.8 Heureka XML — PRICE vs PRICE_VAT

| Pole XML | Popis | Použití |
|---|---|---|
| `PRICE` | Cena BEZ DPH | Uloží se do `price_without_vat` |
| `PRICE_VAT` | Cena S DPH (zákazník vidí tuto cenu) | Uloží se jako `current_price` v `prices` |
| `VAT` | Sazba DPH (např. `"12%"`) | Uloží se do `vat_rate` |

**Při automatické synchronizaci cen** (`_sync_tracked_price`) se používá vždy `PRICE_VAT` — reálná prodejní cena zákazníka.

### 17.9 Sidebar menu struktura

**Sidebar položky:**

| Sekce | Položky | Cesta |
|---|---|---|
| PŘEHLED | Dashboard | /dashboard |
| DATA | Produkty | /products |
| DATA | Katalog | /catalog |
| DATA | Konkurenti | /competitors |
| DATA | Import | /import |
| ANALÝZA | Simulátor | /simulator |
| ANALÝZA | Sezónnost | /seasonality |
| ANALÝZA | Příležitosti | /opportunities |
| OPERACE | Uživatelé | /users |
| OPERACE | Audit | /audit |
| OPERACE | Export | /export |
| — | Administrace | /admin (**pouze admin role**) |

**Sidebar rozměry:**
- Collapsed: 64px (pouze ikony)
- Expanded: 256px (ikony + texty)
- Přepínač: hamburger ikona v hlavičce

---

## Příloha A: `requirements.txt`

```
fastapi==0.104.1
uvicorn[standard]
sqlalchemy==2.0.23
pydantic[email]>=2.0
psycopg2-binary
python-jose[cryptography]
bcrypt
apscheduler==3.10.4
aiohttp
aiosmtplib
openpyxl
python-multipart
beautifulsoup4
lxml
python-dotenv
```

## Příloha B: `package.json` (klíčové závislosti)

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-router-dom": "^6.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.0.0",
    "axios": "^1.0.0",
    "lucide-react": "^0.300.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0"
  }
}
```

---

*Dokument generován: 30. března 2026. Verze specifikace: 1.0.*
