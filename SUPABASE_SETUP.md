# Supabase Setup Guide

## Návod na nastavení databáze na Supabase

### 1. Vytvoření Supabase projektu

1. Jít na https://supabase.com/
2. Přihlásit se nebo vytvořit účet
3. Kliknout na "New project"
4. Vyplnit:
   - **Project name:** `pricing-app` (nebo vaše jméno)
   - **Database password:** Bezpečné heslo (zapamatujte si!)
   - **Region:** Europe (nejblíže vám - např. Central Europe)
5. Kliknout "Create new project"
6. Čekat na vytvoření (cca 2-3 minuty)

### 2. Získání Connection String

1. V Supabase dashboardu jít na "Settings" → "Database"
2. Copypaste **Connection string** (URI format)
3. Vypadá to takto:
```
postgresql://[user]:[password]@[host]:[port]/[database]
```

### 3. Nastavení Environment Variables

**Backend `.env` file:**
```bash
# Database
DATABASE_URL=postgresql://postgres.[projekt-id]:[heslo]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# JWT
SECRET_KEY=your-super-secret-key-generate-a-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# App
DEBUG=true
```

### 4. Spuštění SQL Migrations

#### Možnost A: Přes Supabase UI (nejjednoduší)

1. V Supabase dashboardu jít na "SQL Editor"
2. Kliknout na "New query"
3. Copypaste obsah z `backend/migrations/001_initial_schema.sql`
4. Kliknout "Run"
5. ✅ Databáze je připravená!

#### Možnost B: Přes Python Alembic (pro production)

```bash
cd backend
python -m alembic upgrade head
```

### 5. Ověření Databáze

1. V Supabase jít na "Table Editor"
2. Měly by se zobrazit tabulky:
   - companies
   - users
   - products
   - prices
   - audit_logs
   - analytics

### 6. Nastavit Auth v Supabase (optional)

Supabase má svůj auth systém, ale my používáme JWT. Můžeme ho přidat později.

---

## Vývojové Testování

Jakmile máte `.env` nastavený, spusťte:

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Otestujte API na http://localhost:8000/docs

---

## Troubleshooting

**Problém:** "Connection refused"
- Zkontrolujte, že je správný CONNECTION STRING v `.env`
- Ujistěte se, že máte internetové připojení
- Zkuste regenerovat databázové heslo v Supabase Settings

**Problém:** "Permission denied"
- Zkontrolujte, že `DATABASE_URL` obsahuje správné heslo
- V Supabase jděte na Settings → Database → Reset password

**Problém:** Tabulky nejsou vidět
- Spusťte SQL migration znovu přes SQL Editor
- Zkontrolujte, že máte vybrané správné schéma (public)

---

## Hosting na Production

Jakmile je vše funkční lokálně:

1. Vytvořit nový Supabase projekt pro production
2. Spustit migrations i na production DB
3. Aktualizovat `DATABASE_URL` v Railway env variables
4. Deploy!

