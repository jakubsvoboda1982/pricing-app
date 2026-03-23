# Quick Start Guide

Stavěli jsme kompletní pricing management software. Tady je jak to spustit.

---

## 📋 Příprava (first time)

### 1. Node.js Installation
Pokud jste ho neměli:
```bash
# macOS
brew install node

# nebo z https://nodejs.org/
```

### 2. Python Setup
```bash
# Upgrade pip
python3 -m pip install --upgrade pip

# Vytvoř virtual environment
cd backend
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# nebo: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
```

### 3. Database (local development)
```bash
# Start PostgreSQL v Dockeru
docker-compose up -d

# PostgreSQL bude dostupný na localhost:5432
```

---

## 🚀 Spuštění (development)

### Terminal 1 - Backend:
```bash
cd backend
source venv/bin/activate
python -m uvicorn app.main:app --reload
```

Backend běží na: **http://localhost:8000**
API Docs: **http://localhost:8000/docs**

### Terminal 2 - Frontend:
```bash
cd frontend
npm install  # (jen poprvé)
npm run dev
```

Frontend běží na: **http://localhost:5173**

---

## 🔐 Login

1. Jít na http://localhost:5173
2. Register - create account:
   - Email: test@example.com
   - Password: Test123!
   - Company: My Company
   - Name: Test User
3. Login s credentialama
4. ✅ Dashboard by měl fungovat!

---

## 📂 Project Structure

```
pricing-app/
├── backend/
│   ├── app/
│   │   ├── api/           # API endpoints
│   │   ├── models/        # Database models
│   │   ├── schemas/       # Validation
│   │   └── main.py
│   ├── requirements.txt
│   └── venv/              # Virtual environment
│
├── frontend/
│   ├── src/
│   │   ├── pages/         # React pages
│   │   ├── components/
│   │   ├── api/
│   │   └── store/
│   ├── package.json
│   └── node_modules/
│
├── docker-compose.yml     # PostgreSQL
└── README.md
```

---

## 🗄️ Database (Development)

### Local PostgreSQL (Docker):
```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs postgres
```

Connection: `postgresql://pricing_user:pricing_password@localhost:5432/pricing_db`

### Production (Supabase):
Viz [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

---

## 📱 Features

### Dashboard
- **Overview**: Stats, počet produktů, uživatelů
- **Last Activity**: Audit log s posledními změnami

### Products
- ✅ CRUD tabulka všech produktů
- ✅ Vytváření nových produktů
- ✅ Editace/Smazání
- ✅ Hero score a analytics

### Users
- ✅ Správa uživatelů
- ✅ Role-based access (Admin, Pricing Manager, Category Manager, Read Only)
- ✅ Pozvání nových uživatelů

### Import/Export
- ✅ Import z XLSX/CSV
- ✅ Export do XLSX/CSV
- ✅ Vybírání sloupců pro export

### Audit Log
- ✅ Záznam všech změn
- ✅ Kdo, co, kdy upravil
- ✅ Timeline view

### Analytics
- ✅ Hero score (0-100)
- ✅ Margin risk (Low, Medium, High)
- ✅ Pricing recommendations
- ✅ Competitor comparison

---

## 🧪 Testing API (Postman / Curl)

### Register:
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!",
    "full_name": "Test User",
    "company_name": "Test Company"
  }'
```

### Login:
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }'
```

Response obsahuje `access_token`.

### Get Products:
```bash
curl -X GET http://localhost:8000/api/products \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🐛 Troubleshooting

### "ModuleNotFoundError" v Pythonu
```bash
# Ověř, že jsi ve virtual environment
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### "Cannot find module" v Node
```bash
cd frontend
rm -rf node_modules
npm install
```

### "Port already in use"
```bash
# Backend (port 8000)
lsof -ti:8000 | xargs kill -9

# Frontend (port 5173)
lsof -ti:5173 | xargs kill -9
```

### "Connection refused" na databázi
```bash
# Ensure docker is running
docker-compose ps

# Restart
docker-compose down
docker-compose up -d
```

---

## 📦 Deployment

Viz [DEPLOYMENT.md](./DEPLOYMENT.md) pro:
- Supabase setup
- Railway backend deployment
- Vercel frontend deployment
- Wedos domain registration

---

## 📚 Docs

- [README.md](./README.md) - Project overview
- [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) - Database setup
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment
- [API Docs](http://localhost:8000/docs) - Interactive API documentation (SwaggerUI)

---

## 💡 Next Steps

1. **Spustit backend a frontend** → Všechno testovat
2. **Vytvořit Supabase projekt** → Produkční databázi
3. **Deployovat na Railway + Vercel** → Live aplikace
4. **Registrovat doménu na Wedosu** → Vlastní URL
5. **Setup Wedos DNS** → Propojit doménu s aplikací

---

## 🆘 Support

- GitHub Issues: https://github.com/your-username/pricing-app/issues
- Local API Docs: http://localhost:8000/docs
- Supabase Support: https://supabase.com/support
- Railway Support: https://docs.railway.app/

---

**Hotovo! 🎉 Máte funkční pricing management aplikaci.**
