# Pricing Management Software

Full-stack pricing management application built with React, Python FastAPI, and PostgreSQL.

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- React Router + React Query
- Zustand (state management)

**Backend:**
- Python 3.11+
- FastAPI
- PostgreSQL (via Supabase)
- SQLAlchemy ORM

## Project Structure

```
pricing-app/
├── frontend/          # React SPA
├── backend/           # FastAPI server
└── docker-compose.yml # Local PostgreSQL
```

## Getting Started

### Prerequisites

- Node.js 18+ (for frontend)
- Python 3.11+ (for backend)
- Docker & Docker Compose (for PostgreSQL)

### Backend Setup

1. **Install Python dependencies:**
```bash
cd backend
pip install -r requirements.txt
```

2. **Setup environment variables:**
```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Start PostgreSQL (if using Docker):**
```bash
docker-compose up -d
```

4. **Create database tables:**
```bash
cd backend
python -m alembic upgrade head
# Or let FastAPI create them on startup
```

5. **Run FastAPI server:**
```bash
python -m uvicorn app.main:app --reload
```

Server will be at `http://localhost:8000`
API docs at `http://localhost:8000/docs`

### Frontend Setup

1. **Install Node dependencies:**
```bash
cd frontend
npm install
```

2. **Start development server:**
```bash
npm run dev
```

Frontend will be at `http://localhost:5173`

### Environment Variables

**Backend (.env):**
```
DATABASE_URL=postgresql://pricing_user:pricing_password@localhost:5432/pricing_db
SECRET_KEY=your-secret-key
DEBUG=true
```

**Frontend (.env):**
```
VITE_API_URL=http://localhost:8000/api
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Create new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List all products
- `POST /api/products` - Create product
- `GET /api/products/{id}` - Get product details
- `PUT /api/products/{id}` - Update product
- `DELETE /api/products/{id}` - Delete product
- `GET /api/products/{id}/prices` - Get product prices

### Import/Export
- `POST /api/import/products` - Import from XLSX/CSV
- `GET /api/export/products/xlsx` - Export to XLSX
- `GET /api/export/products/csv` - Export to CSV

### Audit & Analytics
- `GET /api/audit-logs` - Get audit logs
- `GET /api/analytics/{product_id}` - Get product analytics

## Development

### Testing Backend
```bash
cd backend
pytest
```

### Building Frontend
```bash
cd frontend
npm run build
```

## Deployment

### Frontend (Vercel)
```bash
cd frontend
npm install
npm run build
# Deploy via Vercel dashboard
```

### Backend (Railway)
```bash
cd backend
# Push to Railway with Railway CLI
railway up
```

### Database
Use Supabase for PostgreSQL hosting (free tier available)

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -am 'Add feature'`
3. Push to branch: `git push origin feature/your-feature`
4. Open Pull Request

## License

MIT

## Support

For issues and questions, open a GitHub issue.
