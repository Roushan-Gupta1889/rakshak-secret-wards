"""Process-isolated subprocess runner and lifecycle manager for frozen RAKSHAK Stage 1 CLI."""
from __future__ import annotations

import asyncio
import hashlib
import io
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from fastapi import UploadFile

from .analyzer import build_run_summary, get_records_page, utc_iso
from .config import ApiSettings
from .schemas import RecordsPageResponse, RunSummaryResponse
from .security import ApiError, resolve_run_secret, scrub_sensitive_text, validate_upload_relpath

_SAFE_PASSTHROUGH_ENV = (
    "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "LANG", "LC_ALL",
)


@dataclass
class JobRecord:
    run_id: str
    job_dir: Path
    out_dir: Path
    created_epoch: float
    expires_epoch: float
    summary: RunSummaryResponse


def _ensure_restricted_dir(path: Path) -> None:
    """Create directory with restricted owner permissions (0700 on POSIX; user temp on Windows)."""
    path.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass


def _build_child_env(run_secret: str, settings: ApiSettings) -> dict[str, str]:
    """Minimal allowlisted child subprocess environment preserving import-time secret isolation."""
    env: dict[str, str] = {
        "PYTHONHASHSEED": "0",
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "RAKSHA_SECRET": run_secret,
        "RAKSHAK_POLICY": str(settings.policy_path),
    }
    for key in _SAFE_PASSTHROUGH_ENV:
        val = os.environ.get(key)
        if val is not None:
            env[key] = val
    return env


class JobManager:
    """Manages ephemeral job directories, raw-input purge, subprocess execution, and TTL cleanup."""

    def __init__(self, settings: ApiSettings) -> None:
        self.settings = settings
        self._lock = threading.RLock()
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_runs)
        self._jobs: dict[str, JobRecord] = {}
        self._active_run_ids: set[str] = set()

    def startup_clean(self) -> int:
        """Remove any abandoned job directories from prior terminated server instances."""
        base = self.settings.jobs_base_dir
        removed = 0
        _ensure_restricted_dir(base)
        with self._lock:
            for child in list(base.iterdir()):
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                    removed += 1
        return removed

    def shutdown_clean(self) -> None:
        """Best-effort logical cleanup of all retained job workspaces at server shutdown."""
        with self._lock:
            for rec in list(self._jobs.values()):
                if rec.run_id not in self._active_run_ids:
                    shutil.rmtree(rec.job_dir, ignore_errors=True)
            self._jobs.clear()

    def cleanup_expired(self, now_epoch: float | None = None) -> int:
        """Purge expired or excess completed jobs while NEVER deleting active jobs."""
        now = now_epoch if now_epoch is not None else time.time()
        removed = 0
        with self._lock:
            expired_ids = [
                rid for rid, rec in self._jobs.items()
                if rid not in self._active_run_ids and now >= rec.expires_epoch
            ]
            for rid in expired_ids:
                rec = self._jobs.pop(rid)
                shutil.rmtree(rec.job_dir, ignore_errors=True)
                removed += 1

            completed = sorted(
                (rec for rec in self._jobs.values() if rec.run_id not in self._active_run_ids),
                key=lambda r: r.created_epoch,
            )
            excess = len(completed) - self.settings.max_retained_runs
            for rec in completed[:max(0, excess)]:
                self._jobs.pop(rec.run_id, None)
                shutil.rmtree(rec.job_dir, ignore_errors=True)
                removed += 1
        return removed

    def status_counts(self) -> tuple[int, int]:
        with self._lock:
            return len(self._active_run_ids), len(self._jobs)

    def get_run(self, run_id: str) -> RunSummaryResponse:
        self.cleanup_expired()
        with self._lock:
            rec = self._jobs.get(run_id)
            if rec is None:
                raise ApiError(404, "RUN_NOT_FOUND", "Sanitization run not found or expired.")
            return rec.summary

    def get_records(
        self,
        run_id: str,
        page: int = 1,
        page_size: int = 25,
        status: str | None = None,
        patient_psn: str | None = None,
        file_q: str | None = None,
    ) -> RecordsPageResponse:
        self.cleanup_expired()
        with self._lock:
            rec = self._jobs.get(run_id)
            if rec is None:
                raise ApiError(404, "RUN_NOT_FOUND", "Sanitization run not found or expired.")
            out_dir = rec.out_dir
        return get_records_page(run_id, out_dir, page=page, page_size=page_size, status=status, patient_psn=patient_psn, file_q=file_q)

    def get_sanitized_file(self, run_id: str, rel_path: str) -> Path:
        self.cleanup_expired()
        with self._lock:
            rec = self._jobs.get(run_id)
            if rec is None:
                raise ApiError(404, "RUN_NOT_FOUND", "Sanitization run not found or expired.")
            out_dir = rec.out_dir

        norm = rel_path.replace("\\", "/").lstrip("/")
        if norm.startswith("sanitized/"):
            norm = norm[len("sanitized/"):]
        if not norm or ".." in norm.split("/"):
            raise ApiError(400, "INVALID_FILE_PATH", "Invalid sanitized file path.")
        san_root = (out_dir / "sanitized").resolve()
        candidate = (san_root / norm).resolve()
        if not candidate.is_relative_to(san_root) or not candidate.is_file():
            raise ApiError(404, "FILE_NOT_FOUND", "Requested sanitized file does not exist.")
        return candidate

    def build_bundle_zip(self, run_id: str) -> bytes:
        self.cleanup_expired()
        with self._lock:
            rec = self._jobs.get(run_id)
            if rec is None:
                raise ApiError(404, "RUN_NOT_FOUND", "Sanitization run not found or expired.")
            out_dir = rec.out_dir

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            san_dir = out_dir / "sanitized"
            files: list[Path] = []
            if san_dir.is_dir():
                files.extend(sorted(p for p in san_dir.rglob("*") if p.is_file()))
            for meta_name in ("records.jsonl", "report.json"):
                mp = out_dir / meta_name
                if mp.is_file():
                    files.append(mp)
            for p in files:
                rel = p.relative_to(out_dir).as_posix()
                zi = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
                zi.compress_type = zipfile.ZIP_DEFLATED
                zf.writestr(zi, p.read_bytes())
        return buf.getvalue()

    def delete_run(self, run_id: str) -> None:
        with self._lock:
            if run_id in self._active_run_ids:
                raise ApiError(409, "RUN_ACTIVE", "Cannot delete an active running job.")
            rec = self._jobs.pop(run_id, None)
            if rec is None:
                raise ApiError(404, "RUN_NOT_FOUND", "Sanitization run not found or already deleted.")
            job_dir = rec.job_dir
        shutil.rmtree(job_dir, ignore_errors=True)

    async def submit_run(self, upload_files: Iterable[UploadFile], secret_mode: str = "auto") -> RunSummaryResponse:
        """Validate uploads, stage raw input temporarily, invoke CLI subprocess, and purge raw inputs."""
        files_list = list(upload_files)
        if not files_list:
            raise ApiError(400, "NO_FILES_UPLOADED", "At least one file is required.")
        if len(files_list) > self.settings.max_files_per_run:
            raise ApiError(413, "TOO_MANY_FILES", f"Maximum {self.settings.max_files_per_run} files per batch.")

        async with self._semaphore:
            self.cleanup_expired()
            run_secret, secret_source = resolve_run_secret(secret_mode)
            run_id = uuid.uuid4().hex[:16]
            job_dir = self.settings.jobs_base_dir / f"run_{run_id}"
            raw_in = job_dir / "in"
            raw_out = job_dir / "out"

            completed_ok = False
            with self._lock:
                self._active_run_ids.add(run_id)
            try:
                _ensure_restricted_dir(self.settings.jobs_base_dir)
                _ensure_restricted_dir(job_dir)
                _ensure_restricted_dir(raw_in)
                _ensure_restricted_dir(raw_out)

                staged_sizes_by_sha: dict[str, int] = {}
                seen_rels: set[str] = set()
                total_bytes = 0

                for up in files_list:
                    rel = validate_upload_relpath(up.filename, self.settings)
                    if rel in seen_rels:
                        raise ApiError(400, "DUPLICATE_FILENAME", f"Duplicate relative file path '{rel}'.")
                    seen_rels.add(rel)

                    dest = (raw_in / rel).resolve()
                    if not dest.is_relative_to(raw_in.resolve()):
                        raise ApiError(400, "PATH_TRAVERSAL", "Invalid staging destination path.")
                    dest.parent.mkdir(parents=True, exist_ok=True)

                    file_bytes = 0
                    h = hashlib.sha256()
                    with open(dest, "wb") as fh:
                        while True:
                            chunk = await up.read(65536)
                            if not chunk:
                                break
                            file_bytes += len(chunk)
                            total_bytes += len(chunk)
                            if file_bytes > self.settings.max_file_bytes:
                                raise ApiError(413, "FILE_TOO_LARGE", f"File '{rel}' exceeds {self.settings.max_file_bytes} bytes.")
                            if total_bytes > self.settings.max_batch_bytes:
                                raise ApiError(413, "BATCH_TOO_LARGE", f"Batch upload exceeds {self.settings.max_batch_bytes} bytes.")
                            h.update(chunk)
                            fh.write(chunk)
                    staged_sizes_by_sha[h.hexdigest()] = file_bytes

                child_env = _build_child_env(run_secret, self.settings)
                cmd = [sys.executable, "-m", "rakshak", "--input", str(raw_in), "--output", str(raw_out)]

                try:
                    proc = await asyncio.to_thread(
                        subprocess.run,
                        cmd,
                        cwd=str(self.settings.repo_root),
                        env=child_env,
                        capture_output=True,
                        text=True,
                        timeout=self.settings.subprocess_timeout_seconds,
                    )
                except subprocess.TimeoutExpired as exc:
                    raise ApiError(504, "ENGINE_TIMEOUT", "Sanitization engine timed out.") from exc

                if proc.returncode != 0:
                    _ = scrub_sensitive_text((proc.stdout or "") + "\n" + (proc.stderr or ""), self.settings, (run_secret,))
                    raise ApiError(500, "ENGINE_FAILED", "Sanitization engine exited with a processing error.")

                if not (raw_out / "report.json").is_file() or not (raw_out / "records.jsonl").is_file():
                    raise ApiError(500, "INCOMPLETE_OUTPUT", "Sanitization output did not satisfy the expected contract.")

                now_epoch = time.time()
                expires_epoch = now_epoch + self.settings.job_ttl_seconds
                summary = build_run_summary(
                    run_id=run_id,
                    created_iso=utc_iso(now_epoch),
                    expires_iso=utc_iso(expires_epoch),
                    secret_source=secret_source,
                    out_dir=raw_out,
                    staged_sizes_by_sha=staged_sizes_by_sha,
                )
                with self._lock:
                    self._jobs[run_id] = JobRecord(
                        run_id=run_id,
                        job_dir=job_dir,
                        out_dir=raw_out,
                        created_epoch=now_epoch,
                        expires_epoch=expires_epoch,
                        summary=summary,
                    )
                completed_ok = True
                return summary
            finally:
                # Note: shutil.rmtree performs logical filesystem deletion (OS unlink), not forensic wipe.
                shutil.rmtree(raw_in, ignore_errors=True)
                if not completed_ok:
                    shutil.rmtree(job_dir, ignore_errors=True)
                with self._lock:
                    self._active_run_ids.discard(run_id)
                del run_secret
