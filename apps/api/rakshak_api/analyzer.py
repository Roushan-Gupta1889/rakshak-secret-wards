"""Read-only post-sanitization analyzer and safe output explorer (never accesses raw PII)."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from .schemas import (
    CohortKSummary,
    FhirValidationSummary,
    ManifestFileEntry,
    PlaceholderSummary,
    PolicyResponse,
    RecordsPageResponse,
    RunCounts,
    RunResources,
    RunSummaryResponse,
    RunTiming,
    SanitizedRecordItem,
)

_PLACEHOLDER_PATTERNS: tuple[tuple[str, re.Pattern], ...] = (
    ("PSN", re.compile(r"\bPSN-[0-9A-HJKMNPQRSTVWXYZ]{6}\b")),
    ("NAME", re.compile(r"\[NAME\]")),
    ("RELATIVE", re.compile(r"\[RELATIVE\]")),
    ("PHONE", re.compile(r"\[PHONE\]")),
    ("AADHAAR", re.compile(r"\[AADHAAR\]")),
    ("ABHA", re.compile(r"\[ABHA\]")),
    ("PAN", re.compile(r"\[PAN\]")),
    ("EMAIL", re.compile(r"\[EMAIL\]")),
    ("INSURANCE", re.compile(r"\[INSURANCE\]")),
    ("MRN", re.compile(r"\[MRN\]")),
    ("DOB", re.compile(r"\[DOB\]")),
    ("AGE", re.compile(r"\[AGE\]")),
    ("PIN", re.compile(r"\[PIN\]")),
    ("DISTRICT", re.compile(r"\[DISTRICT\]")),
    ("VILLAGE", re.compile(r"\[VILLAGE\]")),
    ("TEHSIL", re.compile(r"\[TEHSIL\]")),
    ("ADDRESS", re.compile(r"\[ADDRESS\]")),
    ("LOCALITY", re.compile(r"\[LOCALITY\]")),
    ("LANDMARK", re.compile(r"\[LANDMARK\]")),
    ("HOUSE", re.compile(r"\[HOUSE\]")),
    ("REDACTED", re.compile(r"\[REDACTED\]")),
)

_PSN_VALID_RX = re.compile(r"^PSN-[0-9A-HJKMNPQRSTVWXYZ]{6}$")
_FHIR_DATE_RX = re.compile(r"^\d{4}(?:-\d{2}(?:-\d{2})?)?$")


def read_policy_snapshot(policy_path: Path) -> PolicyResponse:
    """Parse config/policy.yaml cleanly without modifying engine policy."""
    raw = policy_path.read_bytes() if policy_path.is_file() else b""
    policy_sha256 = hashlib.sha256(raw).hexdigest()
    parsed: dict[str, str | int] = {}
    for line in raw.decode("utf-8", errors="ignore").splitlines():
        clean = line.split("#", 1)[0].strip()
        if not clean or ":" not in clean:
            continue
        k, v = clean.split(":", 1)
        k, v = k.strip(), v.strip()
        if re.fullmatch(r"-?\d+", v):
            parsed[k] = int(v)
        else:
            parsed[k] = v
    return PolicyResponse(provenance="LIVE", policy_sha256=policy_sha256, policy=parsed)


def _validate_fhir_bundle_dict(bd: object) -> bool:
    """Structural FHIR R4 Bundle validation strictly on exported JSON."""
    if not isinstance(bd, dict) or bd.get("resourceType") != "Bundle" or not bd.get("type"):
        return False
    entries = bd.get("entry")
    if not isinstance(entries, list):
        return False
    full_urls = {e.get("fullUrl") for e in entries if isinstance(e, dict) and e.get("fullUrl")}
    res_ids = {
        f"{(e.get('resource') or {}).get('resourceType')}/{(e.get('resource') or {}).get('id')}"
        for e in entries
        if isinstance(e, dict) and isinstance(e.get("resource"), dict)
    }
    for ent in entries:
        if not isinstance(ent, dict):
            return False
        res = ent.get("resource")
        if not isinstance(res, dict):
            return False
        rt = res.get("resourceType")
        if not rt or not res.get("id"):
            return False
        if rt == "Patient" and "birthDate" in res:
            if not _FHIR_DATE_RX.fullmatch(str(res["birthDate"])):
                return False
        text_obj = res.get("text")
        if isinstance(text_obj, dict) and "div" in text_obj:
            if not str(text_obj["div"]).strip().startswith("<div"):
                return False
        for ref_key in ("subject", "patient"):
            ref_obj = res.get(ref_key)
            if isinstance(ref_obj, dict) and ref_obj.get("reference"):
                ref = str(ref_obj["reference"])
                if ref.startswith("urn:uuid:") and ref not in full_urls:
                    return False
                if "/" in ref and not ref.startswith("urn:") and ref not in res_ids:
                    return False
    return True


def build_run_summary(
    run_id: str,
    created_iso: str,
    expires_iso: str,
    secret_source: str,
    out_dir: Path,
    staged_sizes_by_sha: dict[str, int] | None = None,
) -> RunSummaryResponse:
    """Build sanitized run summary strictly from output artifacts (report.json, records.jsonl, sanitized/)."""
    report = json.loads((out_dir / "report.json").read_text(encoding="utf-8"))
    san_dir = out_dir / "sanitized"

    manifest: list[ManifestFileEntry] = []
    size_lookup = staged_sizes_by_sha or {}
    for entry in report.get("files") or []:
        sha = str(entry.get("input_sha256", ""))
        out_rel = entry.get("output")
        out_size = size_lookup.get(sha)
        if out_rel and (out_dir / out_rel).is_file():
            out_size = (out_dir / out_rel).stat().st_size
        manifest.append(
            ManifestFileEntry(
                input_sha256=sha,
                output=out_rel,
                status="sanitized" if entry.get("status") == "sanitized" else "quarantined",
                reason=entry.get("reason"),
                size_bytes=out_size,
            )
        )

    # Scan sanitized output directory only (never raw inputs)
    ph_counts: Counter = Counter()
    bundles_total = bundles_valid = bundles_invalid = 0
    if san_dir.is_dir():
        for p in sorted(san_dir.rglob("*")):
            if not p.is_file():
                continue
            txt = p.read_text(encoding="utf-8", errors="replace")
            for name, rx in _PLACEHOLDER_PATTERNS:
                c = len(rx.findall(txt))
                if c:
                    ph_counts[name] += c
            if p.suffix.lower() == ".json":
                try:
                    parsed = json.loads(txt)
                except Exception:
                    parsed = None
                if isinstance(parsed, dict) and parsed.get("resourceType") == "Bundle":
                    bundles_total += 1
                    if _validate_fhir_bundle_dict(parsed):
                        bundles_valid += 1
                    else:
                        bundles_invalid += 1

    psns: set[str] = set()
    rec_path = out_dir / "records.jsonl"
    if rec_path.is_file():
        for line in rec_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            p = r.get("patient")
            if isinstance(p, str) and p:
                psns.add(p)

    all_alpha_valid = all(
        bool(_PSN_VALID_RX.fullmatch(p)) and any(ch.isalpha() for ch in p[4:])
        for p in psns
    )

    counts_raw = report.get("counts") or {}
    return RunSummaryResponse(
        run_id=run_id,
        created_at=created_iso,
        expires_at=expires_iso,
        status="completed",
        secret_source="configured" if secret_source == "configured" else "ephemeral",
        provenance="LIVE",
        schema_version=str(report.get("schema", "raksha-report/1")),
        counts=RunCounts(**counts_raw),
        entities=dict(report.get("entities") or {}),
        timing=RunTiming(**(report.get("timing") or {"seconds": 0.0})),
        resources=RunResources(**(report.get("resources") or {"peak_rss_mb": 0.0})),
        files=manifest,
        placeholder_summary=PlaceholderSummary(
            provenance="DERIVED",
            counts={k: int(ph_counts[k]) for k in sorted(ph_counts)},
            psn_count=len(psns),
            all_alpha_psn_valid=all_alpha_valid,
        ),
        fhir_validation=FhirValidationSummary(
            provenance="DERIVED",
            bundles_total=bundles_total,
            bundles_valid=bundles_valid,
            bundles_invalid=bundles_invalid,
        ),
        cohort_summary=CohortKSummary(
            provenance="DERIVED",
            generalized_district_markers=int(ph_counts.get("DISTRICT", 0)),
            suppressed_pin_markers=int(ph_counts.get("PIN", 0)),
            suppressed_dob_markers=int(ph_counts.get("DOB", 0)),
            suppressed_age_markers=int(ph_counts.get("AGE", 0)),
        ),
    )


def get_records_page(
    run_id: str,
    out_dir: Path,
    page: int = 1,
    page_size: int = 25,
    status: str | None = None,
    patient_psn: str | None = None,
    file_q: str | None = None,
) -> RecordsPageResponse:
    """Serve paginated sanitized record rows strictly from records.jsonl and sanitized/ files."""
    rec_path = out_dir / "records.jsonl"
    raw_rows = []
    if rec_path.is_file():
        for idx, line in enumerate(rec_path.read_text(encoding="utf-8").splitlines()):
            if not line.strip():
                continue
            r = json.loads(line)
            if status and r.get("status") != status:
                continue
            if patient_psn and r.get("patient") != patient_psn:
                continue
            if file_q and file_q.lower() not in str(r.get("file", "")).lower():
                continue
            raw_rows.append((idx, r))

    total = len(raw_rows)
    start = max(0, (page - 1) * page_size)
    slice_rows = raw_rows[start:start + page_size]

    text_cache: dict[str, str] = {}
    items: list[SanitizedRecordItem] = []
    for idx, r in slice_rows:
        f_rel = str(r.get("file", ""))
        if f_rel not in text_cache:
            target = (out_dir / f_rel).resolve()
            san_root = (out_dir / "sanitized").resolve()
            if target.is_relative_to(san_root) and target.is_file():
                text_cache[f_rel] = target.read_text(encoding="utf-8", errors="replace")[:4000]
            else:
                text_cache[f_rel] = ""
        preview_src = text_cache[f_rel]
        loc = str(r.get("loc", "doc"))
        preview = preview_src[:280].replace("\n", " ")
        if loc.startswith("row:") and preview_src:
            row_idx_s = loc.split(":", 1)[1]
            if row_idx_s.isdigit():
                lines = preview_src.splitlines()
                ri = int(row_idx_s) + 1
                if ri < len(lines):
                    preview = lines[ri][:280]
        items.append(
            SanitizedRecordItem(
                index=idx,
                file=f_rel,
                loc=loc,
                patient=r.get("patient"),
                status=r.get("status"),
                preview=preview,
            )
        )

    return RecordsPageResponse(
        provenance="DERIVED",
        run_id=run_id,
        total=total,
        page=page,
        page_size=page_size,
        items=items,
    )


def utc_iso(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).isoformat().replace("+00:00", "Z")
