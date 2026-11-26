"""Security guards for the local FastAPI adapter: Host, Origin, CSRF, size & upload checks."""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import uuid
from typing import Literal
from urllib.parse import urlparse

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import ApiSettings

_DRIVE_PREFIX_RX = re.compile(r"^[A-Za-z]:")
_UNSAFE_CTRL_RX = re.compile(r"[\x00-\x1f\x7f]")
_STATE_CHANGING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_CSRF_COOKIE_NAME = "rakshak_csrf"
_CSRF_HEADER_NAME = "X-CSRF-Token"


class ApiError(Exception):
    """Structured API error never exposing secrets, tracebacks, or host filesystem paths."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def scrub_sensitive_text(text: str, settings: ApiSettings, extra_secrets: tuple[str, ...] = ()) -> str:
    """Remove secrets and local filesystem paths from any outward-facing text or log string."""
    out = text
    candidates = list(extra_secrets)
    cfg_sec = os.environ.get("RAKSHA_SECRET", "")
    if cfg_sec:
        candidates.append(cfg_sec)
    for sec in candidates:
        if sec and len(sec) >= 3:
            out = out.replace(sec, "[REDACTED_SECRET]")
    out = out.replace(str(settings.jobs_base_dir), "<jobs_dir>")
    out = out.replace(str(settings.repo_root), "<repo_root>")
    return out


class CsrfManager:
    """Per-server-boot signed double-submit CSRF token manager."""

    def __init__(self) -> None:
        self._signing_key = secrets.token_bytes(32)

    def issue_token(self) -> str:
        nonce = secrets.token_urlsafe(24)
        sig = hmac.new(self._signing_key, nonce.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
        return f"{nonce}.{sig}"

    def verify_token(self, cookie_tok: str | None, header_tok: str | None) -> bool:
        if not cookie_tok or not header_tok:
            return False
        if not hmac.compare_digest(cookie_tok, header_tok):
            return False
        if "." not in header_tok:
            return False
        nonce, sig = header_tok.rsplit(".", 1)
        if not nonce or len(sig) != 32:
            return False
        expected = hmac.new(self._signing_key, nonce.encode("utf-8"), hashlib.sha256).hexdigest()[:32]
        return hmac.compare_digest(sig, expected)


def _extract_host_only(host_header: str | None) -> str:
    if not host_header:
        return ""
    raw = host_header.strip().lower()
    if raw.startswith("["):
        end = raw.find("]")
        if end == -1:
            return ""
        rest = raw[end + 1:]
        if rest and (not rest.startswith(":") or not rest[1:].isdigit()):
            return ""
        return raw[:end + 1]
    if ":" in raw:
        host, port = raw.rsplit(":", 1)
        if not port.isdigit():
            return ""
        return host
    return raw


def _extract_origin_from_request(request: Request) -> str | None:
    origin = request.headers.get("origin")
    if origin:
        return origin.strip().rstrip("/").lower()
    referer = request.headers.get("referer")
    if referer:
        parsed = urlparse(referer.strip())
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
    return None


def _error_json(status_code: int, code: str, message: str, request_id: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "request_id": request_id}},
    )


class LocalApiSecurityMiddleware(BaseHTTPMiddleware):
    """Enforce loopback Host, allowed Origin, CSRF, and pre-body size caps."""

    def __init__(self, app, settings: ApiSettings, csrf: CsrfManager) -> None:
        super().__init__(app)
        self.settings = settings
        self.csrf = csrf

    async def dispatch(self, request: Request, call_next):
        req_id = uuid.uuid4().hex[:12]
        request.state.request_id = req_id

        host = _extract_host_only(request.headers.get("host"))
        if host not in self.settings.allowed_hosts:
            return _error_json(400, "INVALID_HOST", "Disallowed or malformed Host header.", req_id)

        if request.method in _STATE_CHANGING_METHODS:
            origin = _extract_origin_from_request(request)
            if not origin or origin not in self.settings.allowed_origins:
                return _error_json(403, "FORBIDDEN_ORIGIN", "Origin not permitted for state-changing request.", req_id)

            cookie_tok = request.cookies.get(_CSRF_COOKIE_NAME)
            header_tok = request.headers.get(_CSRF_HEADER_NAME)
            if not self.csrf.verify_token(cookie_tok, header_tok):
                return _error_json(403, "INVALID_CSRF_TOKEN", "Missing or invalid CSRF token.", req_id)

            cl = request.headers.get("content-length")
            if cl is not None:
                if not cl.strip().isdigit():
                    return _error_json(400, "INVALID_CONTENT_LENGTH", "Malformed Content-Length header.", req_id)
                limit = self.settings.max_batch_bytes + self.settings.multipart_overhead_bytes
                if int(cl.strip()) > limit:
                    return _error_json(413, "PAYLOAD_TOO_LARGE", "Request exceeds maximum batch upload size.", req_id)

        return await call_next(request)


def validate_upload_relpath(raw_filename: str | None, settings: ApiSettings) -> str:
    """Validate and normalize an uploaded relative filename without allowing traversal."""
    if not raw_filename or not raw_filename.strip():
        raise ApiError(400, "INVALID_FILENAME", "Uploaded file is missing a filename.")
    if _UNSAFE_CTRL_RX.search(raw_filename):
        raise ApiError(400, "INVALID_FILENAME", "Filename contains illegal control or null characters.")

    normalized = raw_filename.replace("\\", "/").strip()
    if normalized.startswith("/") or _DRIVE_PREFIX_RX.match(normalized):
        raise ApiError(400, "PATH_TRAVERSAL", "Absolute paths and drive prefixes are rejected.")
    if len(normalized) > 180:
        raise ApiError(400, "INVALID_FILENAME", "Filename exceeds maximum allowed length (180).")

    parts = [p for p in normalized.split("/") if p]
    if not parts or any(p in (".", "..") or p.startswith(".") for p in parts):
        raise ApiError(400, "PATH_TRAVERSAL", "Path traversal segments and hidden dotfiles are rejected.")
    if len(parts) > 3:
        raise ApiError(400, "INVALID_FILENAME", "Nested directory depth cannot exceed 3 levels.")

    safe_rel = "/".join(parts)
    leaf = parts[-1]
    dot = leaf.rfind(".")
    if dot <= 0:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "File must have a supported extension.")
    ext = leaf[dot:].lower()
    if ext not in settings.allowed_extensions:
        raise ApiError(415, "UNSUPPORTED_MEDIA_TYPE", f"Extension '{ext}' is not allowed.")
    return safe_rel


def resolve_run_secret(secret_mode: str) -> tuple[str, Literal["configured", "ephemeral"]]:
    """Resolve child subprocess RAKSHA_SECRET without exposing or echoing secret values."""
    mode = (secret_mode or "auto").strip().lower()
    if mode not in ("auto", "configured", "ephemeral"):
        raise ApiError(400, "INVALID_SECRET_MODE", "secret_mode must be 'auto', 'configured', or 'ephemeral'.")

    configured = os.environ.get("RAKSHA_SECRET", "")
    if mode == "configured":
        if not configured:
            raise ApiError(400, "SECRET_NOT_CONFIGURED", "Configured RAKSHA_SECRET is not present in server environment.")
        return configured, "configured"
    if mode == "ephemeral":
        return secrets.token_urlsafe(32), "ephemeral"
    if configured:
        return configured, "configured"
    return secrets.token_urlsafe(32), "ephemeral"
