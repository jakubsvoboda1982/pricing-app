# Deployment Guide - Nutles Pricing App

## Overview
Tento dokument popisuje kroky k nasazení aplikace na produkci (Supabase + Vercel/Railway).

---

## Phase 1: Database Migration na Supabase

### 1.1 Příprava migration
Migration `004_add_market_and_vat_fields.sql` přidává:
- `market` pole do `catalog_products` a `competitors` (pro CZ/SK oddělení)
- `thumbnail_url`, `url_reference`, `imported_from` do `catalog_products`
- `default_market` do `companies`
- Indexy a unique constraints

### 1.2 Aplikace migration na Supabase
```bash
# Přihlašení do Supabase SQL Editor
# https://supabase.com/dashboard

# Zkopírujte obsah migration souboru:
# backend/migrations/004_add_market_and_vat_fields.sql

# Vložte do SQL Editor a spusťte
```

---

## Phase 2: Backend - Railway Environment Variables

Nastavte tyto proměnné v Railway (Settings → Variables):

```
# Database
DATABASE_URL=postgresql://[user]:[password]@[host]:[port]/[database]

# JWT
SECRET_KEY=[generate-random-64-char-string]

# Email (SendGrid)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.[your-sendgrid-api-key]
SMTP_FROM_EMAIL=noreply@jacobsvoboda.cz

# Frontend URL
FRONTEND_URL=https://pricing.jacobsvoboda.cz

# Debug (production: false)
DEBUG=false
```

---

## Phase 3: Frontend - Vercel Environment Variables

```
VITE_API_URL=https://pricing-api.railway.app/api
```

---

## Phase 4: Deployment Steps

### 4.1 Backend (Railway)
1. GitHub repo je již connectnutý
2. Přidat Environment Variables
3. Railway deployuje automaticky na git push

### 4.2 Frontend (Vercel)
1. Importovat GitHub repo
2. Nastavit build: `npm run build`
3. Nastavit output: `dist`
4. Přidat Environment Variables
5. Deploy

### 4.3 Database Migration
1. Jít na Supabase Dashboard
2. SQL Editor → Paste migration code
3. Spustit (RUN button)

---

## Verification Checklist

- [ ] Migration 004 aplikována
- [ ] Railway env variables nastaveny
- [ ] Vercel env variables nastaveny
- [ ] Backend deployed
- [ ] Frontend deployed
- [ ] API health check: `curl https://pricing-api.railway.app/api/health`
- [ ] Frontend loads: `https://pricing.jacobsvoboda.cz`
- [ ] Email verification works
- [ ] Login works
