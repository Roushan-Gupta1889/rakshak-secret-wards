"""FastAPI local adapter application for RAKSHAK Phase 2A."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import List

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from .analyzer import read_policy_snapshot
from .config import ApiSettings, load_settings
from .runner import JobManager
from .schemas import (
    CsrfResponse,
    HealthResponse,
    PolicyResponse,
    RecordsPageResponse,
    RunSummaryResponse,
)
from .security import (
    ApiError,
    CsrfManager,
    LocalApiSecurityMiddleware,
    _CSRF_COOKIE_NAME,
    scrub_sensitive_text,
)


def create_app(settings: ApiSettings | None = None) -> FastAPI:
    """Create the isolated Phase 2A FastAPI adapter app with strict local security."""
    cfg = settings or load_settings()
    csrf = CsrfManager()
    jobs = JobManager(cfg)

    async def _reaper_loop() -> None:
        while True:
            await asyncio.sleep(cfg.reaper_interval_seconds)
            jobs.cleanup_expired()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        jobs.startup_clean()
        task = asyncio.create_task(_reaper_loop())
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            jobs.shutdown_clean()

    # Disable external CDN Swagger/ReDoc UI to stay 100% offline-clean
    app = FastAPI(
        title="RAKSHAK Local Privacy Adapter",
        version="2.0.0-alpha",
        docs_url=None,
        redoc_url=None,
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = cfg
    app.state.csrf = csrf
    app.state.jobs = jobs

    # Note Starlette LIFO order: LocalApiSecurityMiddleware added LAST runs OUTERMOST (first!)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cfg.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["X-CSRF-Token", "Content-Type"],
    )
    app.add_middleware(LocalApiSecurityMiddleware, settings=cfg, csrf=csrf)

    @app.exception_handler(ApiError)
    async def _api_error_handler(request: Request, exc: ApiError):
        req_id = getattr(request.state, "request_id", None)
        msg = scrub_sensitive_text(exc.message, cfg)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": msg, "request_id": req_id}},
        )

    @app.exception_handler(HTTPException)
    async def _http_error_handler(request: Request, exc: HTTPException):
        req_id = getattr(request.state, "request_id", None)
        msg = scrub_sensitive_text(str(exc.detail or "HTTP request error"), cfg)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": f"HTTP_{exc.status_code}", "message": msg, "request_id": req_id}},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error_handler(request: Request, _exc: RequestValidationError):
        req_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "VALIDATION_ERROR", "message": "Invalid request parameters.", "request_id": req_id}},
        )

    @app.exception_handler(Exception)
    async def _unhandled_error_handler(request: Request, _exc: Exception):
        req_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected internal error occurred.", "request_id": req_id}},
        )

    @app.get("/api/csrf", response_model=CsrfResponse)
    def issue_csrf():
        token = csrf.issue_token()
        resp = JSONResponse(content={"csrf_token": token, "header_name": "X-CSRF-Token"})
        resp.set_cookie(
            key=_CSRF_COOKIE_NAME,
            value=token,
            httponly=False,
            samesite="strict",
            path="/",
        )
        return resp

    @app.get("/api/health", response_model=HealthResponse)
    def health():
        active_n, retained_n = jobs.status_counts()
        return HealthResponse(
            status="ok",
            provenance="LIVE",
            engine_tag=cfg.engine_tag,
            engine_version=cfg.engine_version,
            stdlib_stage1=True,
            offline_mode=True,
            secret_configured=cfg.has_configured_secret,
            active_runs=active_n,
            retained_runs=retained_n,
            max_concurrent_runs=cfg.max_concurrent_runs,
        )

    @app.get("/api/policy", response_model=PolicyResponse)
    def policy():
        return read_policy_snapshot(cfg.policy_path)

    @app.post("/api/runs", response_model=RunSummaryResponse, status_code=201)
    async def create_run(
        files: List[UploadFile] = File(...),
        secret_mode: str = Form("auto"),
    ):
        return await jobs.submit_run(files, secret_mode=secret_mode)

    @app.get("/api/runs/{run_id}", response_model=RunSummaryResponse)
    def get_run(run_id: str):
        return jobs.get_run(run_id)

    @app.get("/api/runs/{run_id}/records", response_model=RecordsPageResponse)
    def get_run_records(
        run_id: str,
        page: int = Query(1, ge=1, le=10000),
        page_size: int = Query(25, ge=1, le=100),
        status: str | None = Query(None),
        patient_psn: str | None = Query(None),
        file_q: str | None = Query(None),
    ):
        return jobs.get_records(
            run_id=run_id,
            page=page,
            page_size=page_size,
            status=status,
            patient_psn=patient_psn,
            file_q=file_q,
        )

    @app.get("/api/runs/{run_id}/files/{file_path:path}")
    def get_sanitized_file(run_id: str, file_path: str, download: bool = Query(False)):
        p = jobs.get_sanitized_file(run_id, file_path)
        content = p.read_text(encoding="utf-8", errors="replace")
        headers = {}
        if download:
            safe_name = p.name.replace('"', "")
            headers["Content-Disposition"] = f'attachment; filename="{safe_name}"'
        return PlainTextResponse(content=content, media_type="text/plain; charset=utf-8", headers=headers)

    @app.get("/api/runs/{run_id}/bundle.zip")
    def download_bundle_zip(run_id: str):
        zip_bytes = jobs.build_bundle_zip(run_id)
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="rakshak_{run_id}.zip"'},
        )

    @app.delete("/api/runs/{run_id}", status_code=204)
    def delete_run(run_id: str):
        jobs.delete_run(run_id)
        return Response(status_code=204)

    return app


app = create_app()


def run_server() -> None:
    cfg = load_settings()
    if cfg.host not in cfg.allowed_hosts:
        raise RuntimeError("Refusing to bind Phase 2 API outside loopback addresses.")
    uvicorn.run(
        "rakshak_api.main:app",
        host=cfg.host,
        port=cfg.port,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    run_server()
