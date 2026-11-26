"""API-vs-CLI tree parity and response contract tests for Phase 2A."""
from __future__ import annotations

import hashlib
import io
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

from rakshak_api.config import ApiSettings
from rakshak_api.main import create_app


def _build_sample_inputs() -> dict[str, bytes]:
    fhir_bundle = {
        "resourceType": "Bundle",
        "type": "document",
        "entry": [
            {
                "fullUrl": "urn:uuid:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "resource": {
                    "resourceType": "Patient",
                    "id": "p-1",
                    "gender": "male",
                    "birthDate": "1979-04-12",
                    "name": [{"text": "Ramesh Verma"}],
                    "identifier": [{"system": "urn:snj:uhid", "value": "SNJ-26-00912"}],
                    "address": [{"district": "Barabanki", "city": "Barabanki", "postalCode": "225035"}],
                },
            },
            {
                "fullUrl": "urn:uuid:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                "resource": {
                    "resourceType": "Organization",
                    "id": "org-1",
                    "name": "Jeevan Jyoti Charitable Hospital",
                    "address": [{"district": "Barabanki", "city": "Barabanki"}],
                },
            },
            {
                "fullUrl": "urn:uuid:cccccccc-cccc-cccc-cccc-cccccccccccc",
                "resource": {
                    "resourceType": "Encounter",
                    "id": "enc-1",
                    "subject": {"reference": "urn:uuid:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"},
                    "period": {"start": "2026-05-01", "end": "2026-05-05"},
                },
            },
        ],
    }
    return {
        "reg_patients.csv": (
            "mrn,name,age,sex,district,pin,mobile,doctor,diagnosis\n"
            "SNJ-26-00912,Ramesh Verma,47,M,Barabanki,225035,9811223344,Dr. Harjeet Bedi,Essential hypertension (I10)\n"
        ).encode("utf-8"),
        "note_Ramesh_Verma.txt": (
            "Patient Name: Ramesh Verma   Age: 47/M\n"
            "UHID: SNJ-26-00912   Mobile: 9811223344\n"
            "Dr. Harjeet Bedi advised Tab Amlodipine 5 mg OD x 15 days.\n"
        ).encode("utf-8"),
        "opd_visit.json": json.dumps({
            "hospital": "Jeevan Jyoti Charitable Hospital, Barabanki",
            "visits": [{
                "visit_id": "V-101",
                "uhid": "SNJ-26-00912",
                "doctor": "Dr. Harjeet Bedi",
                "patient": {"name": "Ramesh Verma", "age_sex": "47/M", "mobile": "9811223344"},
            }],
        }).encode("utf-8"),
        "fhir_bundle.json": json.dumps(fhir_bundle).encode("utf-8"),
        "scan_stub.pdf": b"%PDF-1.4\n% unsupported binary stub\n",
    }


def _sha256_tree(root: Path) -> dict[str, str]:
    files: dict[str, str] = {}
    san = root / "sanitized"
    if san.is_dir():
        for p in sorted(san.rglob("*")):
            if p.is_file():
                files[p.relative_to(root).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
    rec = root / "records.jsonl"
    if rec.is_file():
        files["records.jsonl"] = hashlib.sha256(rec.read_bytes()).hexdigest()
    return files


def _csrf_headers(client: TestClient) -> dict[str, str]:
    r = client.get("/api/csrf")
    assert r.status_code == 200
    tok = r.json()["csrf_token"]
    return {"Origin": "http://127.0.0.1:8000", "X-CSRF-Token": tok}


def test_api_vs_cli_exact_extracted_tree_parity(tmp_path: Path, monkeypatch):
    """API bundle output and on-disk job output must match direct Stage 1 CLI bit-for-bit."""
    secret = "phase2a-parity-secret-9182"
    monkeypatch.setenv("RAKSHA_SECRET", secret)

    samples = _build_sample_inputs()
    cli_in = tmp_path / "cli_in"
    cli_out = tmp_path / "cli_out"
    cli_in.mkdir()
    for name, raw in samples.items():
        (cli_in / name).write_bytes(raw)

    subprocess.run(
        [sys.executable, "-m", "rakshak", "--input", str(cli_in), "--output", str(cli_out)],
        cwd=str(REPO_ROOT),
        env=dict(os.environ, RAKSHA_SECRET=secret, PYTHONHASHSEED="0"),
        check=True,
        capture_output=True,
    )

    settings = ApiSettings(repo_root=REPO_ROOT, jobs_base_dir=tmp_path / "api_jobs")
    app = create_app(settings)
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        headers = _csrf_headers(client)
        multipart = [("files", (name, raw, "application/octet-stream")) for name, raw in samples.items()]
        resp = client.post(
            "/api/runs",
            files=multipart,
            data={"secret_mode": "configured"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        body = resp.json()
        run_id = body["run_id"]
        assert body["secret_source"] == "configured"
        assert body["provenance"] == "LIVE"
        assert body["placeholder_summary"]["provenance"] == "DERIVED"
        assert body["placeholder_summary"]["all_alpha_psn_valid"] is True
        assert body["fhir_validation"] == {"provenance": "DERIVED", "bundles_total": 1, "bundles_valid": 1, "bundles_invalid": 0}

        # Extract bundle.zip and verify every relative path and SHA-256 matches direct CLI output
        zresp = client.get(f"/api/runs/{run_id}/bundle.zip")
        assert zresp.status_code == 200
        extracted_out = tmp_path / "extracted_out"
        with zipfile.ZipFile(io.BytesIO(zresp.content)) as zf:
            zf.extractall(extracted_out)

        cli_tree = _sha256_tree(cli_out)
        api_zip_tree = _sha256_tree(extracted_out)
        job_disk_tree = _sha256_tree(settings.jobs_base_dir / f"run_{run_id}" / "out")

        assert set(api_zip_tree.keys()) == set(cli_tree.keys())
        assert api_zip_tree == cli_tree
        assert job_disk_tree == cli_tree

        # Compare deterministic fields of report.json (schema, sorted files, counts, entities)
        cli_rep = json.loads((cli_out / "report.json").read_text(encoding="utf-8"))
        api_rep = json.loads((extracted_out / "report.json").read_text(encoding="utf-8"))
        assert api_rep["schema"] == cli_rep["schema"]
        assert api_rep["counts"] == cli_rep["counts"]
        assert api_rep["entities"] == cli_rep["entities"]
        assert sorted(api_rep["files"], key=lambda x: x["input_sha256"]) == sorted(
            cli_rep["files"], key=lambda x: x["input_sha256"]
        )

        # Verify records endpoint and sanitized file preview
        recs = client.get(f"/api/runs/{run_id}/records?page=1&page_size=25")
        assert recs.status_code == 200
        rec_data = recs.json()
        assert rec_data["provenance"] == "DERIVED"
        assert rec_data["total"] == cli_rep["counts"]["records_processed"]

        san_files = [f["output"] for f in body["files"] if f["status"] == "sanitized" and f["output"]]
        assert san_files
        first_san = client.get(f"/api/runs/{run_id}/files/{san_files[0]}")
        assert first_san.status_code == 200
        assert "Ramesh" not in first_san.text and "9811223344" not in first_san.text


def test_health_policy_and_zero_fhir_honesty(tmp_path: Path, monkeypatch):
    """Non-FHIR runs must report 0/0 FHIR bundles rather than inventing counts."""
    monkeypatch.delenv("RAKSHA_SECRET", raising=False)
    settings = ApiSettings(repo_root=REPO_ROOT, jobs_base_dir=tmp_path / "api_jobs")
    app = create_app(settings)
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        h = client.get("/api/health")
        assert h.status_code == 200
        hd = h.json()
        assert hd["provenance"] == "LIVE"
        assert hd["engine_tag"] == "phase-1e-v1"
        assert hd["stdlib_stage1"] is True
        assert hd["offline_mode"] is True
        assert hd["secret_configured"] is False

        pol = client.get("/api/policy")
        assert pol.status_code == 200
        pd = pol.json()
        assert pd["provenance"] == "LIVE"
        assert pd["policy"]["min_group_size"] == 5
        assert pd["policy"]["privacy_mode"] == "adaptive_k_mixed"
        assert pd["policy_sha256"] == hashlib.sha256(
            (REPO_ROOT / "config" / "policy.yaml").read_bytes()
        ).hexdigest()

        headers = _csrf_headers(client)
        r = client.post(
            "/api/runs",
            files=[("files", ("plain.txt", b"Patient: Mohan Das  Age: 42/M  Mob: 9988776655\n", "text/plain"))],
            data={"secret_mode": "auto"},
            headers=headers,
        )
        assert r.status_code == 201
        d = r.json()
        assert d["secret_source"] == "ephemeral"
        assert d["fhir_validation"] == {"provenance": "DERIVED", "bundles_total": 0, "bundles_valid": 0, "bundles_invalid": 0}
