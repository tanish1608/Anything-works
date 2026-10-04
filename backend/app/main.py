from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, events, projects, structure
from app.config import get_settings
from app.models import TRADES


def create_app() -> FastAPI:
    app = FastAPI(title="SiteMesh API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (auth.router, projects.router, structure.router, events.router):
        app.include_router(r, prefix="/api")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/trades")
    def trades():
        return [{"code": k, "name": v} for k, v in TRADES.items()]

    return app


app = create_app()
