from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import jobs
from app.api import auth, events, issues, models, projects, structure
from app.config import get_settings
from app.db import SessionLocal
from app.models import TRADES


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app):
        worker = None
        if get_settings().jobs_mode == "thread":
            worker = jobs.Worker(SessionLocal)
            worker.start()
        yield
        if worker:
            worker.stop()

    app = FastAPI(title="SiteMesh API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (auth.router, projects.router, structure.router, events.router, models.router, issues.router):
        app.include_router(r, prefix="/api")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/trades")
    def trades():
        return [{"code": k, "name": v} for k, v in TRADES.items()]

    return app


app = create_app()
