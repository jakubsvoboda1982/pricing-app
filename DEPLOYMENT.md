# Deployment Guide

Kompletní návod na nasazení aplikace na **Railway** (backend) a **Vercel** (frontend).

---

## 1. Supabase Setup (Database)

### Kroky:

1. **Přihlášení:**
   - Jít na https://supabase.com/
   - Přihlásit se nebo vytvořit účet

2. **Vytvoření projektu:**
   - Kliknout "New project"
   - Vyplnit: Project name, Password, Region (EU Central)
   - Kliknout "Create new project" (čekejte 2-3 minuty)

3. **SQL Setup:**
   - V dashboardu jít na "SQL Editor"
   - Kliknout "New query"
   - Copypaste obsah z `backend/migrations/001_initial_schema.sql`
   - Kliknout "Run"

4. **Connection String:**
   - Jít na "Settings" → "Database"
   - Copypaste **Connection string** (URI format)
   - Vypadá takto: `postgresql://postgres.[id]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`

---

## 2. Railway Deployment (Backend)

### Příprava:

1. **Vytvořit Railway účet:**
   - Jít na https://railway.app/
   - Přihlásit se přes GitHub (doporučeno)

2. **Vytvořit nový projekt:**
   - Kliknout "New Project"
   - Vybrat "Deploy from GitHub"
   - Autorizovat GitHub
   - Vybrat repo `pricing-app`

3. **Konfigurace:**
   - Railway automaticky detekuje Python projekt
   - Kliknout "Add Service" → "PostgreSQL" (optional - lze použít Supabase)

### Environment Variables:

V Railway dashboardu jít na "Variables" a přidat:

```env
DATABASE_URL=postgresql://postgres.[id]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
SECRET_KEY=vygenerovany-tajny-klic-delsi-nez-32-znaku
DEBUG=false
RAILWAY_ENVIRONMENT=production
```

### Nastavení Build/Start:

Railway by mělo automaticky detekovat:
- **Build**: `pip install -r backend/requirements.txt`
- **Start**: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Pokud ne, nastavit ručně v "Settings" → "Deploy":
- **Start Command**: `cd backend && uvicorn app.main:app --host 0.0.0.0`

### Deploy:

1. Commitat změny na GitHub
2. Railway automaticky detekuje push a spouští build
3. Čekat na deploy (cca 2-3 minuty)
4. Zkopírovat si **Railway URL** (bude něco jako `pricing-app-prod.railway.app`)

---

## 3. Vercel Deployment (Frontend)

### Příprava:

1. **Vytvořit Vercel účet:**
   - Jít na https://vercel.com/
   - Přihlásit se přes GitHub (doporučeno)

2. **Importovat projekt:**
   - Kliknout "Add New..." → "Project"
   - Vybrat GitHub repo `pricing-app`
   - Kliknout "Import"

### Konfigurace:

1. **Project Settings:**
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

2. **Environment Variables:**
   - Kliknout "Environment Variables"
   - Přidat:
     ```
     VITE_API_URL=https://pricing-app-prod.railway.app/api
     ```
     (Nahraďte `pricing-app-prod.railway.app` vaší Railway URL)

### Deploy:

1. Kliknout "Deploy"
2. Čekat na build a deploy (cca 2-3 minuty)
3. Vercel vám přidělí URL (něco jako `pricing-app.vercel.app`)

---

## 4. Wedos - Domain Setup

### Registrace domény:

1. Jít na https://www.wedos.cz/
2. Vyhledat doménu (např. `pricing-app.cz`)
3. Přidat do košíku a zaplatit (~150 Kč/rok)
4. Přihlásit se do účtu Wedos

### DNS Nastavení:

#### A) Pro Vercel (Frontend):

1. V Wedosu jít na "Správa domén"
2. Vybrat vaší doménu
3. Kliknout "DNS"
4. Přidat **CNAME** záznam:
   - **Subdomain**: `www` (nebo `@` pro root)
   - **Target**: `cname.vercel-dns.com.`
5. Vercel sám vás provede nastavením

#### B) Nastavení v Vercel:

1. V Vercel dashboardu jít na "Settings" → "Domains"
2. Kliknout "Add Domain"
3. Vepsat vaši doménu
4. Vercel vám dá instrukce na DNS záznam

### SSL Certifikát:

- Automaticky řešuje Vercel (Let's Encrypt)
- Zapne se automaticky bez dalšího nastavení

---

## 5. Testování

### Backend:
```bash
curl https://pricing-app-prod.railway.app/health
```

Měl by vrátit:
```json
{"status": "ok", "app": "Pricing Management Software"}
```

### Frontend:
1. Jít na https://pricing-app.vercel.app (nebo vaši doménu)
2. Měla by se zobrazit login stránka

### Login:
1. Zaregistrovat se: Register
2. Vytvořit company a účet
3. Login a ověřit, že vše funguje

---

## 6. Production Checklist

- [ ] Database migrations spuštěny
- [ ] Environment variables nastaveny na obou platformách
- [ ] SSL certifikát funguje (zelený zámek)
- [ ] API endpoint funguje
- [ ] Frontend se connectuje na backend
- [ ] Login/Register funguje
- [ ] CORS je správně nastavený
- [ ] SECRET_KEY je bezpečné a dlouhé

---

## 7. Troubleshooting

### "Connection refused" na backend

1. Zkontrolovat `DATABASE_URL` v Railway env
2. Ověřit, že Supabase projekt je live
3. Restart Railway deployment

### Frontend se nemůže connectovat na backend

1. Zkontrolovat `VITE_API_URL` v Vercel env
2. Ověřit, že Railway URL je správná
3. Zkontrolovat CORS nastavení v FastAPI (`app.config.ALLOWED_ORIGINS`)

### Domain se neukazuje na aplikaci

1. Čekat 24-48 hodin na DNS propagaci
2. Vymazat cache v prohlížeči
3. Zkontrolovat DNS záznam v Wedosu (`nslookup pricing-app.cz`)

---

## 8. Updates & Maintenance

### Pushing updates:

```bash
# Backend + Frontend
git add -A
git commit -m "feature: add new feature"
git push origin main
```

Railway a Vercel automaticky detekují push a re-deployují.

### Monitoring:

- **Railway**: Dashboard → Logs tab
- **Vercel**: Deployments tab → Logs

### Backups:

Supabase automaticky zálohuje databázi, ale doporučuje se:
- Export data pravidelně
- Nastavit backup retention v Supabase Settings

---

## Costs Overview

| Služba | Cena |
|--------|------|
| Supabase (PostgreSQL) | Free tier (5 GB) / $25/měsíc |
| Railway | Free tier ($5 credit) / Pay-as-you-go |
| Vercel | Free tier / Pro $20/měsíc |
| Wedos (doména .cz) | ~150 Kč/rok |
| **Total** | **~200 Kč/rok + ~$25/měsíc** |

