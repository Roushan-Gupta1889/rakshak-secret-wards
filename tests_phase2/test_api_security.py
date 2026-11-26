"""Security, secret-isolation, upload-validation, and cleanup tests for Phase 2A API."""
from __future__ import annotations

import logging
import socket
import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[1]
import sys

sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from rakshak_api.config import ApiSettings
from rakshak_api.main import create_app, run_server
from rakshak_api.security import ApiError, validate_upload_relpath


def _csrf_headers(client: TestClient) -> dict[str, str]:
    r = client.get("/api/csrf")
    assert r.status_code == 200
    return {"Origin": "http://127.0.0.1:8000", "X-CSRF-Token": r.json()["csrf_token"]}


def test_host_origin_csrf_and_no_wildcard_cors(tmp_path: Path):
    settings = ApiSettings(repo_root=REPO_ROOT, jobs_base_dir=tmp_path / "jobs")
    app = create_app(settings)
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        # Host header spoofing must fail
        r_bad_host = client.get("/api/health", headers={"Host": "evil.example.com"})
        assert r_bad_host.status_code == 400
        assert r_bad_host.json()["error"]["code"] == "INVALID_HOST"

        r_zero_host = client.get("/api/health", headers={"Host": "0.0.0.0:8000"})
        assert r_zero_host.status_code == 400

        # No wildcard CORS on evil Origin
        r_preflight = client.options(
            "/api/runs",
            headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"},
        )
        assert r_preflight.headers.get("access-control-allow-origin") != "*"
        assert r_preflight.headers.get("access-control-allow-origin") != "https://evil.example.com"

        csrf = client.get("/api/csrf").json()["csrf_token"]

        # Disallowed origin on POST rejected
        r_bad_origin = client.post(
            "/api/runs",
            files=[("files", ("a.txt", b"hello", "text/plain"))],
            headers={"Origin": "https://evil.example.com", "X-CSRF-Token": csrf},
        )
        assert r_bad_origin.status_code == 403
        assert r_bad_origin.json()["error"]["code"] == "FORBIDDEN_ORIGIN"

        # Missing CSRF token rejected
        r_no_csrf = client.post(
            "/api/runs",
            files=[("files", ("a.txt", b"hello", "text/plain"))],
            headers={"Origin": "http://127.0.0.1:8000"},
        )
        assert r_no_csrf.status_code == 403
        assert r_no_csrf.json()["error"]["code"] == "INVALID_CSRF_TOKEN"

        # Mismatched CSRF token rejected
        r_bad_csrf = client.post(
            "/api/runs",
            files=[("files", ("a.txt", b"hello", "text/plain"))],
            headers={"Origin": "http://127.0.0.1:8000", "X-CSRF-Token": "forged.0000"},
        )
        assert r_bad_csrf.status_code == 403


def test_upload_validation_traversal_extensions_and_size_limits(tmp_path: Path):
    settings = ApiSettings(
        repo_root=REPO_ROOT,
        jobs_base_dir=tmp_path / "jobs",
        max_file_bytes=256,
        max_batch_bytes=400,
        multipart_overhead_bytes=512,
        max_files_per_run=2,
    )
    app = create_app(settings)
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        headers = _csrf_headers(client)

        # Direct validator checks across forward/backslash traversal patterns
        for bad_name in ("../escape.txt", "a/../../b.csv", "/etc/passwd.txt", "C:\\temp\\a.csv", "C:/temp/a.csv", ".env", "sub/.secret.txt", "a/b/c/deep.txt"):
            try:
                validate_upload_relpath(bad_name, settings)
                raise AssertionError(f"validate_upload_relpath accepted {bad_name!r}")
            except ApiError as exc:
                assert exc.status_code == 400

        # HTTP multipart rejection (note: python-multipart strips unquoted/IE backslash paths via os.path.basename on Windows; forward-slash drive & traversal reach validator cleanly)
        for http_bad in ("../escape.txt", "a/../../b.csv", "/etc/passwd.txt", "C:/temp/a.csv", ".env", "sub/.secret.txt", "a/b/c/deep.txt"):
            boundary = "----rakshaktestboundary789"
            raw_body = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="files"; filename="{http_bad}"\r\n'
                f"Content-Type: text/plain\r\n\r\n"
                f"safe data\r\n"
                f"--{boundary}--\r\n"
            ).encode("utf-8")
            raw_hdrs = dict(headers, **{"Content-Type": f"multipart/form-data; boundary={boundary}"})
            r = client.post("/api/runs", content=raw_body, headers=raw_hdrs)
            assert r.status_code == 400, f"{http_bad} -> {r.status_code} {r.text}"

        for bad_ext in ("payload.exe", "script.py", "archive.zip", "noext"):
            r = client.post(
                "/api/runs",
                files=[("files", (bad_ext, b"data", "application/octet-stream"))],
                headers=headers,
            )
            assert r.status_code == 415, f"{bad_ext} -> {r.status_code}"

        # Oversize single file (> 256 bytes) caught during streaming
        r_big_file = client.post(
            "/api/runs",
            files=[("files", ("big.txt", b"A" * 300, "text/plain"))],
            headers=headers,
        )
        assert r_big_file.status_code == 413

        # Pre-check Content-Length rejection (> max_batch_bytes + overhead)
        r_big_hdr = client.post(
            "/api/runs",
            files=[("files", ("ok.txt", b"x" * 1000, "text/plain"))],
            headers=headers,
        )
        assert r_big_hdr.status_code == 413

        # File count limit (> 2 files)
        r_too_many = client.post(
            "/api/runs",
            files=[
                ("files", ("1.txt", b"a", "text/plain")),
                ("files", ("2.txt", b"b", "text/plain")),
                ("files", ("3.txt", b"c", "text/plain")),
            ],
            headers=headers,
        )
        assert r_too_many.status_code == 413

        # Download path traversal rejection & 0.0.0.0 bind refusal
        r_ok = client.post(
            "/api/runs",
            files=[("files", ("ok.txt", b"Patient: Maya Devi  Age: 30/F\n", "text/plain"))],
            headers=headers,
        )
        assert r_ok.status_code == 201
        rid = r_ok.json()["run_id"]
        assert client.get(f"/api/runs/{rid}/files/..%2Frecords.jsonl").status_code in (400, 404)
        assert client.get(f"/api/runs/{rid}/files/../../report.json").status_code in (400, 404)


def test_refuses_non_loopback_bind(monkeypatch):
    from rakshak_api import main as api_main
    monkeypatch.setattr(api_main, "load_settings", lambda: ApiSettings(host="0.0.0.0"))
    try:
        run_server()
        raise AssertionError("Expected RuntimeError when binding non-loopback host 0.0.0.0")
    except RuntimeError:
        pass


def test_secret_isolation_and_arbitrary_secret_mode_blocked(tmp_path: Path, monkeypatch, caplog):
    canary_secret = "CANARY_SECRET_MUST_NEVER_LEAK_77319"
    monkeypatch.setenv("RAKSHA_SECRET", canary_secret)
    caplog.set_level(logging.DEBUG)

    settings = ApiSettings(repo_root=REPO_ROOT, jobs_base_dir=tmp_path / "jobs")
    app = create_app(settings)
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        headers = _csrf_headers(client)

        # Arbitrary secret submission is rejected
        r_arb = client.post(
            "/api/runs",
            files=[("files", ("p.txt", b"Patient: Sita Ram Age: 55/F\n", "text/plain"))],
            data={"secret_mode": "custom-arbitrary-secret"},
            headers=headers,
        )
        assert r_arb.status_code == 400
        assert canary_secret not in r_arb.text

        # Configured run never exposes canary_secret anywhere
        r_ok = client.post(
            "/api/runs",
            files=[("files", ("p.txt", b"Patient: Sita Ram  Age: 55/F  Mob: 9811002233\n", "text/plain"))],
            data={"secret_mode": "configured"},
            headers=headers,
        )
        assert r_ok.status_code == 201
        rid = r_ok.json()["run_id"]
        for url in (
            "/api/health",
            f"/api/runs/{rid}",
            f"/api/runs/{rid}/records",
            f"/api/runs/{rid}/files/p.txt",
        ):
            rr = client.get(url)
            assert canary_secret not in rr.text
            for hv in rr.headers.values():
                assert canary_secret not in hv
        zbytes = client.get(f"/api/runs/{rid}/bundle.zip").content
        assert canary_secret.encode("utf-8") not in zbytes
        assert canary_secret not in caplog.text


def test_raw_cleanup_on_success_failure_timeout_and_startup_and_active_ttl(tmp_path: Path, monkeypatch):
    canary_secret = "FAIL_TIMEOUT_SECRET_55412"
    monkeypatch.setenv("RAKSHA_SECRET", canary_secret)
    jobs_dir = tmp_path / "jobs"
    jobs_dir.mkdir()
    abandoned = jobs_dir / "run_abandoned_crash_dir"
    (abandoned / "in").mkdir(parents=True)
    (abandoned / "in" / "leaked.txt").write_text("raw pii", encoding="utf-8")

    settings = ApiSettings(repo_root=REPO_ROOT, jobs_base_dir=jobs_dir)
    app = create_app(settings)

    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        # 1. Startup orphan recovery deleted abandoned directory
        assert not abandoned.exists()
        headers = _csrf_headers(client)

        # 2. Normal success: raw in/ purged immediately while sanitized out/ retained
        r_ok = client.post(
            "/api/runs",
            files=[("files", ("n.txt", b"Patient: Ajay Kumar  Age: 40/M  Mob: 9876543210\n", "text/plain"))],
            headers=headers,
        )
        assert r_ok.status_code == 201
        rid_ok = r_ok.json()["run_id"]
        assert not (jobs_dir / f"run_{rid_ok}" / "in").exists()
        assert (jobs_dir / f"run_{rid_ok}" / "out" / "report.json").is_file()

        # 3. Active-job TTL protection: active IDs cannot be purged by cleanup_expired
        jm = app.state.jobs
        with jm._lock:
            jm._active_run_ids.add(rid_ok)
        removed_while_active = jm.cleanup_expired(now_epoch=9999999999.0)
        assert removed_while_active == 0
        assert (jobs_dir / f"run_{rid_ok}" / "out").is_dir()

        # Delete of active run returns 409; once inactive, TTL reaper deletes it cleanly
        r_del_act = client.delete(f"/api/runs/{rid_ok}", headers=headers)
        assert r_del_act.status_code == 409
        with jm._lock:
            jm._active_run_ids.discard(rid_ok)
        assert jm.cleanup_expired(now_epoch=9999999999.0) == 1
        assert not (jobs_dir / f"run_{rid_ok}").exists()

        # 4. Subprocess non-zero exit failure: clean 500 error, no secret/path leak, entire job dir wiped
        def _fail_subproc(*args, **kwargs):
            return subprocess.CompletedProcess(args[0], returncode=2, stdout=canary_secret, stderr=str(jobs_dir))

        monkeypatch.setattr(subprocess, "run", _fail_subproc)
        r_fail = client.post(
            "/api/runs",
            files=[("files", ("fail.txt", b"Patient: Raw Fail  Mob: 9000011111\n", "text/plain"))],
            headers=headers,
        )
        assert r_fail.status_code == 500
        assert canary_secret not in r_fail.text
        assert str(jobs_dir) not in r_fail.text
        assert list(jobs_dir.iterdir()) == []

        # 5. Subprocess timeout: clean 504 error and entire job dir wiped
        def _timeout_subproc(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd=args[0], timeout=1)

        monkeypatch.setattr(subprocess, "run", _timeout_subproc)
        r_to = client.post(
            "/api/runs",
            files=[("files", ("to.txt", b"Patient: Raw Timeout  Mob: 9000022222\n", "text/plain"))],
            headers=headers,
        )
        assert r_to.status_code == 504
        assert r_to.json()["error"]["code"] == "ENGINE_TIMEOUT"
        assert list(jobs_dir.iterdir()) == []


def test_offline_mode_zero_external_network_attempts(tmp_path: Path, monkeypatch):
    """Block any non-loopback network connection to verify 100% offline API execution."""
    real_create_conn = socket.create_connection

    def _guard_conn(address, *args, **kwargs):
        host = address[0]
        if host not in ("127.0.0.1", "localhost", "::1"):
            raise AssertionError(f"Unexpected outbound network call attempted to {address}")
        return real_create_conn(address, *args, **kwargs)

    monkeypatch.setattr(socket, "create_connection", _guard_conn)
    settings = ApiSettings(repo_root=REPO_ROOT, jobs_base_dir=tmp_path / "jobs")
    app = create_app(settings)
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/policy").status_code == 200
        assert client.get("/openapi.json").status_code == 200
        headers = _csrf_headers(client)
        r = client.post(
            "/api/runs",
            files=[("files", ("offline.txt", b"Patient: Kavita Rao  Age: 33/F  Mob: 9123456780\n", "text/plain"))],
            headers=headers,
        )
        assert r.status_code == 201
