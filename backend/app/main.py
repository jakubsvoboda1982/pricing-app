from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import Base, engine
from app.api import auth, products, users, audit, analytics, imports, exports, admin, opportunities, simulator, catalog, competitors

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Pricing Management Software",
    description="API for pricing product management",
    version="0.1.0"
)

settings = get_settings()

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Include routers
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(users.router)
app.include_router(audit.router)
app.include_router(analytics.router)
app.include_router(imports.router)
app.include_router(exports.router)
app.include_router(admin.router)
app.include_router(opportunities.router)
app.include_router(simulator.router)
app.include_router(catalog.router)
app.include_router(competitors.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME}

@app.get("/")
def root():
    return {"message": f"Welcome to {settings.APP_NAME} API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
