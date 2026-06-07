# Deployment Guide — Nuties Pricing App (Vercel)

## Přehled

Vše běží na **jednom Vercel projektu** (frontend + Python API) + **Supabase** (Postgres).
Railway už se nepoužívá.

```
repo root
├── api/index.py          # Vercel Python entrypoint → importuje FastAPI app z backend/
├── backend/              # FastAPI aplikace (zdroj pravdy logiky)
│   └── app/api/cron.py   # cron endpointy spouštěné Vercel Cronem
├── frontend/             # Vite SPA (build → frontend/dist)
├── requirements.txt      # -r backend/requirements.txt (pro Vercel Python runtime)
└── vercel.json           # build, rewrites, functions, crons
```

Frontend volá API přes **relativní `/api`** (stejný origin) → žádné CORS.
Rewrite v `vercel.json` směruje `/api/*` na Python funkci, vše ostatní na SPA.

---

## Phase 1: Vercel projekt

> ⚠️ Pokud už existuje samostatný Vercel projekt jen pro frontend (Root Directory =
> `frontend/`), přepni jeho **Root Directory na repo root** (Project Settings → General),
> nebo založ nový projekt nad rootem repa. Jinak se `api/` a root `vercel.json` neaplikují.

1. Import GitHub repa do Vercelu, **Root Directory = `.`** (kořen repa)
2. Framework Preset: **Other** (build/output řídí `vercel.json`)
3. **Plán Pro** je potřeba kvůli: Vercel Cron (4× denně) + `maxDuration` 300 s u scrapingu

`vercel.json` už nastavuje:
- `buildCommand`: `cd frontend && npm install && npm run build`
- `outputDirectory`: `frontend/dist`
- `functions."api/index.py"`: `maxDuration` 300 s, `memory` 1024 MB
- `rewrites`: `/api/* → /api/index`, zbytek → `/index.html` (SPA)
- `crons`: feedy 02:00, ceny 03:00, sklad 04:00, report 06:00 (UTC)

---

## Phase 2: Environment Variables (Vercel → Settings → Environment Variables)

```
# Database — POUŽÍT Supabase Transaction Pooler (port 6543), ne přímé 5432
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require

# JWT
SECRET_KEY=<náhodný 64-znakový řetězec>

# Cron (Vercel posílá Authorization: Bearer $CRON_SECRET automaticky)
CRON_SECRET=<náhodný řetězec>

# Email (SendGrid)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.<sendgrid-api-key>
SMTP_FROM_EMAIL=noreply@jacobsvoboda.cz

# URL pro odkazy v e-mailech (produkční doména frontendu)
FRONTEND_URL=https://pricing.jacobsvoboda.cz

# Produkce
DEBUG=false

# DB init NEspouštět v request path (serverless cold start) — schéma se řeší migracemi
RUN_DB_INIT=false

# In-process scheduler nechat vypnutý (úlohy řeší Vercel Cron)
ENABLE_SCHEDULER=false
```

> `VITE_API_URL` **nenastavovat** — frontend pak použije relativní `/api` (stejný origin).
> Nastav ji jen tehdy, když chceš mířit na samostatný backend.

---

## Phase 3: Databáze (Supabase)

Schéma se na produkci **nevytváří za běhu** (`RUN_DB_INIT=false`). Migrace aplikuj ručně:

1. Supabase Dashboard → SQL Editor
2. Spusť potřebné migrace z `backend/migrations/` (vč. `004_add_market_and_vat_fields.sql`)
3. Idempotentní `ADD COLUMN IF NOT EXISTS` / indexy z `backend/app/main.py`
   (`_ensure_schema`, `_ensure_indexes`) lze při prvním nasazení spustit jednou ručně,
   nebo dočasně nastavit `RUN_DB_INIT=true`, nasadit a zase vrátit na `false`.

---

## Phase 4: Cron jobs

Definované v `vercel.json` → běží automaticky po nasazení (Pro plán).
Endpointy jsou chráněné `CRON_SECRET`; ručně lze spustit:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<deployment>/api/cron/import-feeds
```

| Endpoint                       | Rozvrh (UTC) | Úloha                         |
|--------------------------------|--------------|-------------------------------|
| `/api/cron/import-feeds`       | `0 2 * * *`  | Import aktivních feedů         |
| `/api/cron/competitor-prices`  | `0 3 * * *`  | Aktualizace cen konkurence     |
| `/api/cron/baselinker-stock`   | `0 4 * * *`  | Sync skladu z Baselinker       |
| `/api/cron/daily-report`       | `0 6 * * *`  | Denní cenový report e-mailem   |

> Scraping běží v jedné funkci s limitem `maxDuration` 300 s. Pokud import/scraping
> poroste nad limit, rozděl ho na dávky (per feed / per konkurent) a spouštěj víc běhů.

---

## Verification Checklist

- [ ] Vercel Root Directory = kořen repa
- [ ] Plán Pro aktivní (cron + maxDuration)
- [ ] Env variables nastaveny (vč. `DATABASE_URL` přes pooler, `CRON_SECRET`, `RUN_DB_INIT=false`)
- [ ] Migrace aplikovány v Supabase
- [ ] Deploy proběhl
- [ ] API health: `curl https://<deployment>/api/health` → `{"status":"ok"}`
- [ ] Frontend načte: `https://pricing.jacobsvoboda.cz`
- [ ] Login funguje (volá `/api/auth/login`, žádné CORS chyby)
- [ ] Cron běhy vidět v Vercel → Deployments → Crons (po prvním rozvrhu)
- [ ] Railway projekt vypnut/smazán až po ověření výše
```
