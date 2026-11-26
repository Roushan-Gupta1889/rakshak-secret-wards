"""Configuration and security bounds for the Phase 2 Local API adapter."""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

_DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class ApiSettings:
    """Immutable runtime settings for the isolated FastAPI adapter."""

    repo_root: Path = _DEFAULT_REPO_ROOT
    jobs_base_dir: Path = field(
        default_factory=lambda: Path(tempfile.gettempdir()) / "rakshak_api_jobs"
    )
    host: str = "127.0.0.1"
    port: int = 8000
    engine_tag: str = "phase-1e-v1"
    engine_version: str = "1.0.0"

    allowed_hosts: frozenset[str] = frozenset({"127.0.0.1", "localhost", "[::1]", "::1"})
    allowed_origins: frozenset[str] = frozenset({
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://[::1]:8000",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://[::1]:5173",
    })

    allowed_process_exts: frozenset[str] = frozenset({".csv", ".tsv", ".json", ".txt"})
    allowed_quarantine_exts: frozenset[str] = frozenset({".pdf", ".jpg", ".jpeg", ".png", ".xml"})
    allowed_extensions: frozenset[str] = frozenset({
        ".csv", ".tsv", ".json", ".txt", ".pdf", ".jpg", ".jpeg", ".png", ".xml"
    })

    max_files_per_run: int = 50
    max_file_bytes: int = 5 * 1024 * 1024
    max_batch_bytes: int = 25 * 1024 * 1024
    multipart_overhead_bytes: int = 2 * 1024 * 1024
    subprocess_timeout_seconds: int = 60
    job_ttl_seconds: int = 900
    max_retained_runs: int = 10
    max_concurrent_runs: int = 2
    reaper_interval_seconds: int = 30

    @property
    def policy_path(self) -> Path:
        return self.repo_root / "config" / "policy.yaml"

    @property
    def has_configured_secret(self) -> bool:
        return bool(os.environ.get("RAKSHA_SECRET", ""))


def load_settings() -> ApiSettings:
    """Create default settings, ensuring loopback-only host binding."""
    env_dir = os.environ.get("RAKSHAK_API_JOBS_DIR")
    base = Path(env_dir) if env_dir else Path(tempfile.gettempdir()) / "rakshak_api_jobs"
    return ApiSettings(jobs_base_dir=base)
