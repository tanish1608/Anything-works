"""Minimal DB-backed job queue. Good enough for MVP scale and needs no Redis; the handler registry
keeps it easy to move to RQ/Celery later. Handlers get their own session and must be idempotent-ish."""

import logging
import threading
import time
import traceback
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import Job

log = logging.getLogger("jobs")
Handler = Callable[[Session, Job], dict | None]
HANDLERS: dict[str, Handler] = {}
ON_FAIL: dict[str, Callable[[Session, Job], None]] = {}
RECOVER: list[Callable[[Session], None]] = []


def handler(kind: str):
    def deco(fn: Handler) -> Handler:
        HANDLERS[kind] = fn
        return fn

    return deco


def enqueue(db: Session, kind: str, payload: dict, project_id: str | None = None, user_id: str | None = None) -> Job:
    """Adds the job to the session; it runs after the caller commits (see run_pending_inline for tests)."""
    job = Job(kind=kind, payload=payload, project_id=project_id, created_by=user_id)
    db.add(job)
    db.flush()
    return job


def _claim(db: Session) -> Job | None:
    job = db.scalar(select(Job).where(Job.status == "queued").order_by(Job.created_at).limit(1))
    if job is None:
        return None
    # Optimistic claim so two workers never run the same job.
    n = db.execute(update(Job).where(Job.id == job.id, Job.status == "queued")
                   .values(status="running", started_at=datetime.now(UTC))).rowcount
    db.commit()
    return db.get(Job, job.id) if n else None


def run_job(make_session: sessionmaker, job_id: str) -> None:
    with make_session() as db:
        job = db.get(Job, job_id)
        try:
            result = HANDLERS[job.kind](db, job)
            job = db.get(Job, job_id)
            job.status, job.result = "done", result or {}
        except Exception as e:  # noqa: BLE001 - job failures are recorded, not raised
            db.rollback()
            log.exception("job %s failed", job_id)
            job = db.get(Job, job_id)
            job.status, job.error = "failed", f"{e}\n{traceback.format_exc(limit=5)}"
        job.finished_at = datetime.now(UTC)
        db.commit()
        if job.status == "failed" and job.kind in ON_FAIL:
            try:
                ON_FAIL[job.kind](db, job)
            except Exception:  # noqa: BLE001
                log.exception("failure hook for %s", job.kind)


def run_pending(make_session: sessionmaker) -> int:
    """Run every queued job now. Used by tests/inline mode and by the worker loop."""
    with make_session() as db:
        for recover in RECOVER:
            recover(db)
    n = 0
    while True:
        with make_session() as db:
            job = _claim(db)
        if job is None:
            return n
        run_job(make_session, job.id)
        n += 1


class Worker(threading.Thread):
    def __init__(self, make_session: sessionmaker, interval: float = 1.0):
        super().__init__(daemon=True, name="job-worker")
        self.make_session, self.interval, self._stop_evt = make_session, interval, threading.Event()

    def run(self) -> None:
        while not self._stop_evt.is_set():
            try:
                if run_pending(self.make_session) == 0:
                    self._stop_evt.wait(self.interval)
            except Exception:  # noqa: BLE001
                log.exception("worker loop error")
                self._stop_evt.wait(self.interval)

    def stop(self) -> None:
        self._stop_evt.set()


def after_commit_run_inline(make_session: sessionmaker) -> None:
    if get_settings().jobs_mode == "inline":
        run_pending(make_session)


def wait_for(make_session: sessionmaker, job_id: str, timeout: float = 120) -> Job:
    end = time.time() + timeout
    while time.time() < end:
        with make_session() as db:
            job = db.get(Job, job_id)
            if job.status in ("done", "failed"):
                return job
        time.sleep(0.2)
    raise TimeoutError(job_id)
