"""FastAPI application entry point.

Boots the API server with CORS, lifespan management, and route registration.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, ingest, data


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown tasks."""
    # Startup
    print("[VAI] Backend starting up...")
    yield
    # Shutdown
    print("[VAI] Backend shutting down...")


app = FastAPI(
    title="Visual Activity Agent API",
    description=(
        "Privacy-first browser activity monitoring backend. "
        "Receives events and screenshots from the Chrome Extension, "
        "stores them securely, and generates AI-powered activity summaries."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow extension origin (chrome-extension://) and localhost for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",
        "http://localhost:*",
        "http://127.0.0.1:*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Route registration ---
app.include_router(auth.router)
app.include_router(ingest.router)
app.include_router(data.router)


# --- Health check ---
@app.get("/health", tags=["system"])
async def health_check():
    """Health check endpoint. Returns 200 if the API is running."""
    return {
        "status": "healthy",
        "service": "visual-activity-agent",
        "version": "0.1.0",
    }
