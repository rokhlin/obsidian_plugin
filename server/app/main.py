from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.services.db_service import db_service
from app.auth import verify_auth_token
from app.routers import sync, ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure DB schema and directory structures exist
    await db_service.init_db()
    _ = settings.vault_dir
    _ = settings.archive_dir
    _ = settings.conflicts_dir
    _ = settings.temp_dir
    yield
    # Shutdown logic if needed


app = FastAPI(
    title="Obsidian Mobile Sync & AI Backend",
    version="1.0.0",
    description="Synchronizes Obsidian Android mobile vaults with conflict protection and AI assistance",
    lifespan=lifespan,
)

# Enable CORS for Obsidian mobile WebViews and local requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync.router)
app.include_router(ai.router)


@app.get("/api/health", tags=["system"])
async def health_check():
    """Public health check endpoint."""
    return {
        "status": "healthy",
        "service": "obsidian-sync-ai-backend",
        "port": settings.PORT,
        "environment": settings.ENVIRONMENT,
        "ai_ready": bool(settings.GEMINI_API_KEY),
    }


@app.get("/api/auth/verify", tags=["system"])
async def verify_auth_endpoint(token: str = Depends(verify_auth_token)):
    """Authenticated endpoint to verify that client token matches server AUTH_TOKEN."""
    return {
        "status": "authenticated",
        "message": "Token is valid",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
