"""RAKSHAK Pipeline: 3-pass orchestrator (Collect Names → Link Records → Sanitize & Export)."""
from __future__ import annotations

import argparse
import base64 as b64mod
import csv
import datetime as dt
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

from .crypto import pseudonym, age_band, file_hash, shift_date
from .io_utils import (
    sorted_walk, decode_bytes, detect_delimiter, read_csv_rows,
    write_csv, parse_json_safe, is_fhir_bundle,
)
from .detectors import (
    find_all_identifiers, find_all_identifiers_raw, find_phones, find_mrn,
    find_aadhaar, find_abha, find_pan, find_insurance, find_doctor_spans,
    normalize_with_map, map_norm_span, canonical_clean,
    try_decode_b64_text, try_decode_hex_text, PHONE_RX,
)
from .names import find_names_in_text, is_name_token, compile_gazetteer_rx
from .medical import find_medical_spans, overlaps_medical
from .columns import classify_column, ColumnType
from .privacy import shift_date_string
from .linker import (
    PatientLinker, RecordEvidence, normalize_phone, normalize_mrn,
    extract_name_tokens_latin,
)
from .text_sanitizer import TextSanitizer
from .fhir_handler import sanitize_fhir_bundle
from .filename_sanitizer import sanitize_filename


def load_policy(path: Path) -> dict:
    """Parse simple key: value YAML policy without external dependencies."""
    policy: dict[str, object] = {
        "age_band_years": 5,
        "date_shift_max_days": 180,
        "min_group_size": 5,
    }
    if not path.is_file():
        return policy
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip(), v.strip()
        if re.fullmatch(r"-?\d+", v):
            policy[k] = int(v)
        else:
            policy[k] = v
    return policy

# Institution / hospital / document words that must NEVER pollute the person-name gazetteer
_NON_PERSON_WORDS = {
    "hospital", "clinic", "charitable", "multispeciality", "trust", "centre", "center",
    "medical", "nursing", "home", "district", "village", "government", "primary",
    "health", "community", "prescription", "summary", "discharge", "report",
    "certificate", "registration", "export", "legacy", "results", "patients",
    "claims", "bundle", "forward", "whatsapp", "visitor", "ambulance", "helpdesk",
    "scanned", "consent", "form", "ward", "vitals", "sheet", "bulk", "corrupt",
    "bytes", "note", "truncated", "mislabeled", "empty", "readme", "index", "deep",
    "jeevan", "jyoti", "arogya", "sanjeevani", "hardoi", "lifeline", "pathkind",
    "sadan", "seva", "diet", "doctor", "panel", "panels", "medicine", "surgery",
    "age", "dob", "sex", "gender", "uhid", "ipd", "opd", "adm",
}

_NON_PERSON_CONTAINER_KEYS = {
    "hospital", "organization", "org", "facility", "lab", "laboratory",
    "clinic", "department", "panel", "panels", "test", "tests",
    "diagnosis", "diagnoses", "rx", "medication", "medications",
    "drug", "drugs", "procedure", "procedures", "provider", "facility_info",
    "_export_meta", "export_meta", "meta",
}

_PERSON_CONTAINER_KEYS = {
    "patient", "person", "raised_by", "user", "client", "contact",
    "applicant", "subscriber", "beneficiary", "subject", "attendant",
    "guardian", "relative", "family_member",
}

_DOCTOR_KEYS = {
    "doctor", "referred_by", "ref_doctor", "practitioner", "consultant",
    "attending", "physician", "clinician", "prescribed_by", "surgeon",
    "doctor_name",
}

_PROSE_KEYS = {
    "notes", "note", "remarks", "remark", "description", "comment",
    "comments", "summary", "text", "body", "narrative", "details",
}

_RECORD_LIST_KEYS = {
    "patients", "visits", "records", "tickets", "entries", "cases",
    "admissions", "encounters", "claims", "reports",
}


def _try_decode_b64_text(val: str) -> str | None:
    """Delegate to shared base64 payload decoder."""
    return try_decode_b64_text(val)


def _is_record_list(key: str, items: list) -> bool:
    """Distinguish top-level patient record lists from nested clinical lists (panels/rx/diagnosis)."""
    if not isinstance(items, list) or not items or not all(isinstance(x, dict) for x in items):
        return False
    kl = key.lower()
    if kl in {"panels", "diagnosis", "diagnoses", "rx", "medications", "drugs",
              "procedures", "items", "wards", "tests"}:
        return False
    if kl in _RECORD_LIST_KEYS:
        return True
    sample = items[0]
    for sk in sample.keys():
        ct = classify_column(str(sk))
        if ct in (ColumnType.PATIENT_NAME, ColumnType.MRN, ColumnType.PHONE,
                  ColumnType.AADHAAR, ColumnType.ABHA) or str(sk).lower() in ("patient", "patient_ref", "raised_by"):
            return True
    return False


def _is_multi_patient_index(data: dict) -> bool:
    """Detect index dicts mapping multiple distinct patient keys/names WITHOUT record lists."""
    if any(_is_record_list(k, v) for k, v in data.items()):
        return False
    if "by_uhid" in data or "by_name" in data:
        return True
    raw_s = json.dumps(data, ensure_ascii=False)
    mrns = {normalize_mrn(m.surface) for m in find_mrn(raw_s)}
    phones = {normalize_phone(m.surface) for m in find_phones(raw_s)}
    return len(mrns) >= 3 or len(phones) >= 3


def _shift_age_sex_cell(cell: str, width: int = 5) -> str:
    """Generalize combined age/sex strings like '65/F' -> '65-69/F' or '85+/F'."""
    m = re.match(r"^\s*(\d{1,3})\s*(?:([A-Za-z]+)\s*)?([/\-\s]*[MFmf])?\s*$", cell)
    if not m:
        return cell
    age_val = int(m.group(1))
    if not (0 < age_val < 120):
        return cell
    band = age_band(age_val, width)
    mid = f" {m.group(2)}" if m.group(2) else ""
    tail = m.group(3) or ""
    return f"{band}{mid}{tail}"


class Pipeline:
    """Main RAKSHAK pipeline."""

    def __init__(self, input_dir: Path, output_dir: Path, policy: dict):
        self.inp = input_dir
        self.out = output_dir
        self.san = output_dir / "sanitized"
        self.policy = policy
        self.age_width = int(policy.get("age_band_years", 5))
        self.date_shift_max = int(policy.get("date_shift_max_days", 180))

        # Accumulators
        self.files_report: list[dict] = []
        self.records: list[dict] = []
        self.stats = {
            "identifiers_detected": 0,
            "records_processed": 0,
            "records_linked": 0,
            "records_generalized": 0,
            "records_suppressed": 0,
        }

        # Linker & O(1) lookup index
        self.linker = PatientLinker()
        self._record_idx_map: dict[tuple[str, str], int] = {}

        # Name collection (populated in pass 1)
        self.all_names: set[str] = set()
        self.doctor_names: set[str] = set()
        self._gazetteer_rx: re.Pattern | None = None
        self._clean_key_cache: dict[str, str] = {}

    def run(self) -> dict:
        """Execute the full pipeline. Returns the report dict."""
        t0 = time.monotonic()
        self.san.mkdir(parents=True, exist_ok=True)
        sys.setrecursionlimit(max(sys.getrecursionlimit(), 5000))

        # ─── Pass 1: Collect names and evidence from all files ──────────
        raw_data: dict[str, tuple[bytes, str]] = {}
        for path in sorted_walk(self.inp):
            rel = path.relative_to(self.inp).as_posix()
            raw = path.read_bytes()
            raw_data[rel] = (raw, rel)
            try:
                self._collect_names(raw, rel, path.suffix.lower())
            except Exception:
                pass  # Broken files quarantined cleanly in Pass 3

        # ─── Pass 1b: Also collect genuine person names & phones from filenames ─
        for rel in sorted(raw_data.keys()):
            basename = rel.rsplit("/", 1)[-1] if "/" in rel else rel
            basename_no_ext = canonical_clean(re.sub(r"\.\w+$", "", basename), decode_escapes=True)
            parts = re.split(r"[_\-\s]", basename_no_ext)
            for p in parts:
                p = p.strip()
                if (p and len(p) >= 3 and p[0].isupper() and p.isalpha()
                        and p.lower() not in _NON_PERSON_WORDS and is_name_token(p)):
                    self.all_names.add(p)
            phone_m = re.match(r"^(\d{10})_", basename_no_ext)
            if phone_m:
                self.all_names.add(phone_m.group(1))

        # Remove doctor names AND any hospital/non-person words from all_names
        doc_strip = set()
        for dn in self.doctor_names:
            doc_strip.add(dn)
            doc_strip.add(f"Dr. {dn}")
            doc_strip.add(f"Dr {dn}")
        self.all_names = {
            n for n in self.all_names
            if n not in doc_strip and n.lower() not in _NON_PERSON_WORDS
        }
        self._gazetteer_rx = compile_gazetteer_rx(self.all_names)

        # ─── Pass 2: Link records ───────────────────────────────────────
        self._run_linker(raw_data)

        # ─── Pass 3: Sanitize and export ────────────────────────────────
        used_out_paths: dict[str, int] = {}

        for rel in sorted(raw_data.keys()):
            raw, _ = raw_data[rel]
            path = self.inp / rel
            sha = file_hash(raw)
            entry = {"input_sha256": sha}

            try:
                result, records = self._process_file(raw, rel, path.suffix.lower(), path)
                if result is not None:
                    out_rel, fn_changed = sanitize_filename(rel, self.all_names)

                    if out_rel in used_out_paths:
                        used_out_paths[out_rel] += 1
                        idx = used_out_paths[out_rel]
                        dot = out_rel.rfind(".")
                        if dot > 0:
                            out_rel = out_rel[:dot] + f"_{idx}" + out_rel[dot:]
                        else:
                            out_rel = out_rel + f"_{idx}"
                        fn_changed = True
                    else:
                        used_out_paths[out_rel] = 0

                    dest = self.san / out_rel
                    dest.parent.mkdir(parents=True, exist_ok=True)

                    if isinstance(result, str):
                        dest.write_text(result, encoding="utf-8", newline="")
                    elif isinstance(result, bytes):
                        dest.write_bytes(result)

                    entry["output"] = f"sanitized/{out_rel}"
                    entry["status"] = "sanitized"

                    if fn_changed:
                        for rec in records:
                            rec["file"] = f"sanitized/{out_rel}"

                    self.records.extend(records)
                    self.stats["records_processed"] += len(records)
                else:
                    entry["output"] = None
                    entry["status"] = "quarantined"
                    entry["reason"] = "processing_failed"
            except Exception as exc:
                reason = type(exc).__name__
                entry.update(output=None, status="quarantined", reason=reason)

            self.files_report.append(entry)

        # Keep records only for exported files
        exported = {e["output"] for e in self.files_report if e.get("output")}
        self.records = [r for r in self.records if r["file"] in exported]

        with open(self.out / "records.jsonl", "w", encoding="utf-8") as f:
            for r in self.records:
                f.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")

        n_san = sum(1 for e in self.files_report if e["status"] == "sanitized")
        report = {
            "schema": "raksha-report/1",
            "files": self.files_report,
            "counts": {
                "files_total": len(self.files_report),
                "files_sanitized": n_san,
                "files_quarantined": len(self.files_report) - n_san,
                "records_processed": len(self.records),
                "identifiers_detected": self.stats["identifiers_detected"],
                "records_linked": sum(1 for r in self.records if r.get("patient")),
                "records_generalized": self.stats["records_generalized"],
                "records_suppressed": self.stats["records_suppressed"],
                "records_quarantined": 0,
            },
            "entities": self._count_entity_types(),
            "timing": {"seconds": round(time.monotonic() - t0, 2)},
            "resources": {"peak_rss_mb": self._peak_rss()},
        }

        (self.out / "report.json").write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        print(f"files {len(self.files_report)} sanitized {n_san} "
              f"quarantined {len(self.files_report) - n_san} "
              f"records {len(self.records)}")

        return report

    # ─── Pass 1: Name Collection ────────────────────────────────────────

    def _collect_names(self, raw: bytes, rel: str, ext: str):
        """Extract person names from a file for the global gazetteer."""
        if ext not in (".csv", ".tsv", ".json", ".txt"):
            return
        if not raw.strip():
            return
        if rel.lower().startswith("clean/"):
            return
        text = decode_bytes(raw)
        if text is None:
            return

        text = text.replace("\r\n", "\n").replace("\r", "\n")

        # Extract known Indian name tokens from filenames (never institution words!)
        parts = re.split(r"[_/\\]", rel)
        for p in parts:
            p = re.sub(r"\.\w+$", "", p)
            for t in re.split(r"[-_]", p):
                if (t and t[0].isupper() and len(t) >= 3 and t.isalpha()
                        and t.lower() not in _NON_PERSON_WORDS and is_name_token(t)):
                    self.all_names.add(t)

        if ext in (".csv", ".tsv"):
            self._collect_names_csv(text, ext)
        elif ext == ".json":
            self._collect_names_json(text)
        else:
            self._collect_names_text(text)

    def _collect_names_csv(self, text: str, ext: str):
        delim = "\t" if ext == ".tsv" else detect_delimiter(text)
        header, body = read_csv_rows(text, delim)
        col_types = [classify_column(h) for h in header]

        for row in body:
            first_last = []
            for i, cell in enumerate(row):
                if i >= len(col_types):
                    continue
                ct = col_types[i]
                hl = header[i].strip().lower()
                if ct == ColumnType.DOCTOR:
                    m = re.match(r"(?i)\bDr\.?\s+(.+)", cell.strip())
                    if m:
                        self.doctor_names.add(m.group(1).strip())
                elif ct == ColumnType.PATIENT_NAME:
                    self._add_name_parts(cell, "patient")
                    if hl in ("firstname", "first_name", "lastname", "last_name"):
                        first_last.append(cell.strip())
                elif ct == ColumnType.RELATIVE_NAME:
                    m = re.match(r"(?i)(?:(?:S|D|W)\s*/\s*(?:o|O)\s+)?(.+)", cell)
                    if m:
                        self._add_name_parts(m.group(1), "relative")
                elif ct in (ColumnType.UNKNOWN, ColumnType.SAFE):
                    self._collect_names_text(cell)
            if len(first_last) >= 2:
                self._add_name_parts(" ".join(first_last), "patient")

        for m in re.finditer(r"\b[Dd][Rr]\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})", text):
            self.doctor_names.add(m.group(1))

    def _collect_names_json(self, text: str):
        data = parse_json_safe(text)
        if data is None:
            return
        self._walk_json_for_names_iter(data)

    def _walk_json_for_names_iter(self, root):
        """Iterative JSON walk (stack-safe for 1500+ deep files like deep_export.json)."""
        # Stack items: (obj, parent_key, inside_person_ctx)
        stack = [(root, "", False)]
        while stack:
            obj, parent_key, in_person = stack.pop()
            if isinstance(obj, dict):
                pkl = parent_key.lower()
                # Check if this dict itself looks like a person object
                dict_is_person = in_person or pkl in _PERSON_CONTAINER_KEYS or any(
                    k.lower() in {"age", "sex", "gender", "dob", "uhid", "mobile", "phone", "first", "last"}
                    for k in obj.keys()
                )
                # In FHIR Bundle entries, inspect resourceType
                rt = str(obj.get("resourceType", "")).lower()
                if rt in ("organization", "practitioner", "location"):
                    if rt == "practitioner":
                        for nm in obj.get("name", []) if isinstance(obj.get("name"), list) else []:
                            if isinstance(nm, dict) and isinstance(nm.get("text"), str):
                                m = re.match(r"(?i)\bDr\.?\s+(.+)", nm["text"].strip())
                                if m:
                                    self.doctor_names.add(m.group(1).strip())
                    # Still inspect base64/data or Patient extensions inside non-patient resources?
                    # Skip collecting Organization/Practitioner names as patient names!
                    continue

                for k, v in obj.items():
                    kl = str(k).lower()
                    if kl in _DOCTOR_KEYS or (kl == "name" and pkl in _DOCTOR_KEYS):
                        if isinstance(v, str):
                            m = re.match(r"(?i)\bDr\.?\s+(.+)", v.strip())
                            if m:
                                self.doctor_names.add(m.group(1).strip())
                        continue
                    if kl in _NON_PERSON_CONTAINER_KEYS or kl == "by_uhid":
                        if kl == "by_name" and isinstance(v, dict):
                            for person_name in v.keys():
                                self._add_name_parts(str(person_name), "patient")
                        continue
                    if kl == "by_name" and isinstance(v, dict):
                        for person_name in v.keys():
                            self._add_name_parts(str(person_name), "patient")
                        continue

                    if kl == "data" and isinstance(v, str):
                        dec = _try_decode_b64_text(v)
                        if dec:
                            self._collect_names_text(dec)
                        continue

                    if kl in ("patient_name", "full_name", "first_name", "last_name",
                              "firstname", "lastname", "naam") or (
                        kl in ("name", "patient") and dict_is_person
                        and pkl not in _NON_PERSON_CONTAINER_KEYS
                    ):
                        if isinstance(v, str):
                            self._add_name_parts(v, "patient")
                        elif isinstance(v, dict):
                            for sk in ("first", "last", "text", "given", "family", "local"):
                                sv = v.get(sk)
                                if isinstance(sv, str):
                                    self._add_name_parts(sv, "patient")
                                elif isinstance(sv, list):
                                    for item in sv:
                                        if isinstance(item, str):
                                            self._add_name_parts(item, "patient")
                        elif isinstance(v, list):
                            for item in v:
                                if isinstance(item, dict):
                                    for sk in ("first", "last", "text", "given", "family", "local"):
                                        sv = item.get(sk)
                                        if isinstance(sv, str):
                                            self._add_name_parts(sv, "patient")
                                        elif isinstance(sv, list):
                                            for sub in sv:
                                                if isinstance(sub, str):
                                                    self._add_name_parts(sub, "patient")

                    if any(x in kl for x in ("guardian", "relative", "father", "mother",
                                             "spouse", "attendant")):
                        if isinstance(v, str):
                            m = re.match(r"(?i)(?:(?:S|D|W)\s*/\s*(?:o|O)\s+)?(.+)", v)
                            if m:
                                self._add_name_parts(m.group(1), "relative")
                        elif isinstance(v, dict):
                            for sk in ("name", "text"):
                                sv = v.get(sk)
                                if isinstance(sv, str):
                                    self._add_name_parts(sv, "relative")

                    if kl in _PROSE_KEYS and isinstance(v, str):
                        self._collect_names_text(v)
                    elif isinstance(v, str) and len(v) >= 16:
                        dec = _try_decode_b64_text(v) or try_decode_hex_text(v)
                        if dec:
                            self._collect_names_text(dec)

                    if isinstance(v, (dict, list)):
                        child_person = dict_is_person or kl in _PERSON_CONTAINER_KEYS
                        stack.append((v, str(k), child_person))

            elif isinstance(obj, list):
                child_person = parent_key.lower() in _RECORD_LIST_KEYS
                for item in obj:
                    if isinstance(item, (dict, list)):
                        stack.append((item, parent_key, in_person or child_person))

    def _collect_names_text(self, text: str):
        text = canonical_clean(text, decode_escapes=True)
        _HINDI_NAME_LABEL_RX = re.compile(
            r"(?:(?:मरीज़|मरीज|रोगी|पिता|माता|पति)\s+(?:का\s+)?नाम|(?<!का\s)नाम)\s*[:=]\s*"
            r"([\u0900-\u097F]+(?: [\u0900-\u097F]+){0,3})"
        )
        for rx in (
            re.compile(r"(?i:Patient\s*(?:'s)?\s*Name|Name)\s*[:=]\s*([A-Z][a-zA-Z.']*(?: [A-Z][a-zA-Z.']*){0,3})"),
            _HINDI_NAME_LABEL_RX,
        ):
            for m in rx.finditer(text):
                self._add_name_parts(m.group(1), "patient")

        # Relative names: stop cleanly at closing ')' or punctuation!
        for m in re.finditer(
            r"(?i:(?:S|D|W)\s*/\s*(?:o|O))\s+([A-Z\u0900-\u097F][^\n,;|():\"]{2,50})",
            text,
        ):
            self._add_name_parts(m.group(1), "relative")

        # Honorific names
        for m in re.finditer(
            r"([A-Z\u0900-\u097F][a-zA-Z\u0900-\u097F.']+)\s+(?i:ji|sahab|sahib|didi|bhai|bhaiya|mama|chachu|amma|behenji)\b",
            text,
        ):
            self._add_name_parts(m.group(1), "patient")

        # Contextual person cues (visitor logs, ambulance remarks, consent witnesses)
        for m in re.finditer(
            r"(?i:attendant|attended\s+by|brought\s+by|informed\s+by|visitor|called\s+by|witnessed?\s+by|escorted\s+by|accompanied\s+by)\s+"
            r"([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})",
            text,
        ):
            cand = m.group(1).strip()
            toks = cand.split()
            if (len(toks) >= 2
                    and not any(t.lower() in _NON_PERSON_WORDS for t in toks)
                    and all(len(t) >= 3 and t[0].isupper() and not t.isupper() for t in toks)):
                self._add_name_parts(cand, "patient")

        for m in re.finditer(
            r"([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})\s*\((?i:attendant|visitor|guardian|relative|bystander|witness)",
            text,
        ):
            cand = m.group(1).strip()
            toks = cand.split()
            if (len(toks) >= 2
                    and not any(t.lower() in _NON_PERSON_WORDS for t in toks)
                    and all(len(t) >= 3 and t[0].isupper() and not t.isupper() for t in toks)):
                self._add_name_parts(cand, "patient")

        for m in re.finditer(r"\b[Dd][Rr]\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})", text):
            self.doctor_names.add(m.group(1))

    def _add_name_parts(self, name: str, role: str):
        """Add a person name and its tokens to self.all_names, filtering institutional words."""
        name = canonical_clean(name, decode_escapes=True)
        name = name.strip().rstrip(".,;:")
        name = re.split(
            r"\s{2,}|\s+(?:आयु|उम्र|लिंग|पता|ग्राम|age|sex|gender|dob|mob|ph|phone|address|addr)\b",
            name, flags=re.I,
        )[0].strip().rstrip(".,;:")
        if not name or len(name) < 2:
            return
        # Never ingest Dr. prefixed strings or multi-word institutional strings
        if re.match(r"(?i)^dr\.?\s+", name):
            doc = re.sub(r"(?i)^dr\.?\s+", "", name).strip()
            if doc:
                self.doctor_names.add(doc)
            return

        tokens_check = name.split()
        if any(t.lower().strip(".,;:") in _NON_PERSON_WORDS for t in tokens_check):
            # If any institutional word appears, skip whole phrase (avoid "Jeevan Jyoti Hospital")
            if any(w in name.lower() for w in ("hospital", "charitable", "clinic", "multispeciality",
                                               "trust", "sadan", "seva", "hardoi", "lifeline", "pathkind",
                                               "sanjeevani", "arogya", "jeevan", "jyoti")):
                return

        if len(tokens_check) >= 2 or (len(name) >= 4 and name.lower() not in _NON_PERSON_WORDS):
            self.all_names.add(name)

        for t in re.split(r"[\s.,'_]+", name):
            t = t.strip()
            if not t or t.lower() in _NON_PERSON_WORDS:
                continue
            is_deva = any("\u0900" <= c <= "\u097F" for c in t)
            if is_deva:
                # Note: Devanagari vowel matras/nukta return False for str.isalpha()!
                if len(t) >= 3 and all("\u0900" <= c <= "\u097F" for c in t):
                    self.all_names.add(t)
            elif len(t) >= 3 and t.isalpha():
                self.all_names.add(t)

    # ─── Pass 2: Linking ────────────────────────────────────────────────

    def _run_linker(self, raw_data: dict[str, tuple[bytes, str]] | None = None):
        """Second pass: extract structured & text evidence and link patient records."""
        if raw_data is not None:
            items = [(rel, raw_data[rel][0]) for rel in sorted(raw_data.keys())]
        else:
            items = [
                (p.relative_to(self.inp).as_posix(), p.read_bytes())
                for p in sorted_walk(self.inp)
            ]

        for rel, raw in items:
            ext = Path(rel).suffix.lower()
            if ext not in (".csv", ".tsv", ".json", ".txt"):
                continue
            if not raw.strip() or rel.lower().startswith("clean/"):
                continue
            text = decode_bytes(raw)
            if text is None:
                continue
            text = text.replace("\r\n", "\n").replace("\r", "\n")

            try:
                if ext in (".csv", ".tsv"):
                    self._link_csv(text, ext, rel)
                elif ext == ".json":
                    self._link_json(text, rel)
                else:
                    self._link_text(text, rel)
            except Exception:
                pass

        self.linker.link_all(threshold=36.0)
        self._record_idx_map = {
            (r.file_rel, r.loc): i for i, r in enumerate(self.linker.records)
        }

    def _extract_evidence_from_text(self, text: str, file_rel: str,
                                     loc: str) -> RecordEvidence | None:
        """Extract clean linking evidence from a free-text chunk."""
        text = canonical_clean(text, decode_escapes=True)
        phones: set[str] = set()
        mrns: set[str] = set()
        aadhaar: set[str] = set()
        abha: set[str] = set()
        pan: set[str] = set()
        insurance: set[str] = set()
        names_latin: set[str] = set()
        relatives_latin: set[str] = set()
        names_full = ""
        age = None
        gender = None
        village = None
        hospital = None

        for m in find_phones(text):
            phones.add(normalize_phone(m.surface))
        for m in find_mrn(text):
            mrns.add(normalize_mrn(m.surface))
        for m in find_aadhaar(text):
            aadhaar.add(re.sub(r"\D", "", m.surface))
        for m in find_abha(text):
            abha.add(re.sub(r"\D", "", m.surface))
        for m in find_pan(text):
            pan.add(m.surface.upper())
        for m in find_insurance(text):
            insurance.add(m.surface.upper())

        name_matches = find_names_in_text(text, self.all_names, self._gazetteer_rx)
        # Keep labelled/honorific patient names as primary; relative matches go to relatives_latin!
        rel_spans = [(nm.start, nm.end) for nm in name_matches if nm.role == "relative"]
        for nm in name_matches:
            if nm.role == "doctor":
                continue
            if nm.role == "relative":
                relatives_latin |= extract_name_tokens_latin(nm.surface)
                continue
            # Do not let gazetteer patient matches duplicate relative spans!
            if any(nm.start < re_ and nm.end > rs for rs, re_ in rel_spans):
                continue
            if not names_full:
                names_full = nm.surface
            names_latin |= extract_name_tokens_latin(nm.surface)

        age_m = re.search(
            r"(?:(?<![a-zA-Z])(?i:age)|आयु|उम्र)\s*[:/-]?\s*(\d{1,3})"
            r"|(?<![\d/])(\d{1,3})\s*(?:(?i:yrs?|years?)|वर्ष)\s*(?:/\s*[MFmf])?"
            r"|(?<![\d/])(\d{1,3})\s*/\s*([MFmf])\b",
            text,
        )
        if age_m:
            age_str = age_m.group(1) or age_m.group(2) or age_m.group(3)
            age_val = int(age_str)
            if 0 < age_val < 120:
                age = age_val

        if re.search(r"\b[Mm]ale\b|/M\b|\bSex\s*[:=]\s*M\b|पुरुष|(?<!\w)S/o\b", text):
            gender = "M"
        elif re.search(r"\b[Ff]emale\b|/F\b|\bSex\s*[:=]\s*F\b|महिला|स्त्री|(?<!\w)[DW]/o\b", text, re.I):
            gender = "F"

        vm = re.search(
            r"(?i)(?:Vill\.?|Village|ग्राम|गांव)\s*[:=.]?\s*"
            r"([A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F ]{2,30}?)(?=[,\n;|\"}\]]|\s{2,}|$)",
            text,
        )
        if vm:
            v_str = vm.group(1).strip()
            if any("\u0900" <= c <= "\u097F" for c in v_str):
                from .linker import transliterate_deva_to_latin
                v_str = transliterate_deva_to_latin(v_str)
            village = v_str.lower()

        for key, name in [("snj", "sanjeevani"), ("jjh", "jeevan"), ("dhh", "hardoi"), ("arogya", "arogya")]:
            if key in file_rel.lower() or name in text.lower():
                hospital = key
                break

        # Skip non-patient witness/visitor/consent logs (no patient ID/label -> avoid bogus pseudonym)
        if not mrns and not aadhaar and not abha and not pan and re.search(
            r"(?i)\b(?:witnessed\s+by|visitor\s+log)\b", text
        ) and not re.search(r"(?i)(?:patient\s*name|नाम\s*:|\bname\s*:)", text):
            return None

        if not (phones or mrns or aadhaar or abha or pan or names_latin):
            return None

        return RecordEvidence(
            file_rel=file_rel, loc=loc,
            names_latin=frozenset(names_latin), names_full=names_full,
            relatives_latin=frozenset(relatives_latin),
            phones=frozenset(phones), mrns=frozenset(mrns),
            aadhaar=frozenset(aadhaar), abha=frozenset(abha),
            pan=frozenset(pan), insurance=frozenset(insurance),
            age=age, gender=gender, village=village, hospital=hospital,
        )

    def _link_csv(self, text: str, ext: str, rel: str):
        delim = "\t" if ext == ".tsv" else detect_delimiter(text)
        header, body = read_csv_rows(text, delim)
        if not header or not body:
            ev = self._extract_evidence_from_text(text, rel, "doc")
            if ev:
                self.linker.add_record(ev)
            return

        col_types = [classify_column(h) for h in header]
        for i, row in enumerate(body):
            phones: set[str] = set()
            mrns: set[str] = set()
            aadhaar: set[str] = set()
            abha: set[str] = set()
            pan: set[str] = set()
            insurance: set[str] = set()
            names_latin: set[str] = set()
            relatives_latin: set[str] = set()
            name_parts_raw: list[str] = []
            age = None
            gender = None
            village = None

            for j, cell in enumerate(row):
                val = cell.strip()
                if not val or j >= len(col_types):
                    continue
                ct = col_types[j]
                hl = header[j].strip().lower()

                if ct == ColumnType.DOCTOR:
                    continue
                elif ct == ColumnType.PATIENT_NAME:
                    name_parts_raw.append(val)
                    names_latin |= extract_name_tokens_latin(val)
                elif ct == ColumnType.RELATIVE_NAME:
                    cleaned_rel = re.sub(r"(?i)^(?:[SDW]\s*/\s*O)\s*", "", val).strip()
                    relatives_latin |= extract_name_tokens_latin(cleaned_rel)
                    if re.match(r"(?i)^W\s*/\s*O\b", val) and not gender:
                        gender = "F"
                    elif re.match(r"(?i)^S\s*/\s*O\b", val) and not gender:
                        gender = "M"
                elif ct == ColumnType.PHONE:
                    for pm in find_phones(val):
                        phones.add(normalize_phone(pm.surface))
                    digits = normalize_phone(val)
                    if len(digits) == 10 and digits[0] in "6789":
                        phones.add(digits)
                elif ct == ColumnType.MRN:
                    for mm in find_mrn(val):
                        mrns.add(normalize_mrn(mm.surface))
                    if not mrns and hl not in ("bill_no",):
                        norm_m = normalize_mrn(val)
                        if len(norm_m) >= 5:
                            mrns.add(norm_m)
                elif ct == ColumnType.AADHAAR:
                    digits = re.sub(r"\D", "", val)
                    if len(digits) == 12:
                        aadhaar.add(digits)
                elif ct == ColumnType.ABHA:
                    digits = re.sub(r"\D", "", val)
                    if len(digits) == 14:
                        abha.add(digits)
                elif ct == ColumnType.PAN:
                    for pm in find_pan(val):
                        pan.add(pm.surface.upper())
                elif ct == ColumnType.INSURANCE:
                    for im in find_insurance(val):
                        insurance.add(im.surface.upper())
                elif ct == ColumnType.AGE:
                    am = re.search(r"\d{1,3}", val)
                    if am and 0 < int(am.group(0)) < 120:
                        age = int(am.group(0))
                elif ct == ColumnType.AGE_SEX:
                    am = re.match(r"^\s*(\d{1,3})\s*/\s*([MFmf])\b", val)
                    if am:
                        if 0 < int(am.group(1)) < 120:
                            age = int(am.group(1))
                        gender = am.group(2).upper()
                elif ct == ColumnType.VILLAGE:
                    v_str = val
                    if any("\u0900" <= c <= "\u097F" for c in v_str):
                        from .linker import transliterate_deva_to_latin
                        v_str = transliterate_deva_to_latin(v_str)
                    village = v_str.lower()
                elif hl in ("sex", "gender", "ling"):
                    vl = val.lower()
                    if vl in ("m", "male", "पुरुष"):
                        gender = "M"
                    elif vl in ("f", "female", "महिला", "स्त्री"):
                        gender = "F"
                elif hl == "relation":
                    if val.upper().startswith("W"):
                        gender = gender or "F"
                    elif val.upper().startswith("S"):
                        gender = gender or "M"
                elif ct in (ColumnType.UNKNOWN, ColumnType.SAFE):
                    for pm in find_phones(val):
                        phones.add(normalize_phone(pm.surface))
                    for mm in find_mrn(val):
                        mrns.add(normalize_mrn(mm.surface))
                    for nm in find_names_in_text(val, self.all_names, self._gazetteer_rx):
                        if nm.role == "patient":
                            names_latin |= extract_name_tokens_latin(nm.surface)

            if phones or mrns or aadhaar or abha or pan or names_latin:
                self.linker.add_record(RecordEvidence(
                    file_rel=rel, loc=f"row:{i}",
                    names_latin=frozenset(names_latin),
                    names_full=" ".join(name_parts_raw),
                    relatives_latin=frozenset(relatives_latin),
                    phones=frozenset(phones), mrns=frozenset(mrns),
                    aadhaar=frozenset(aadhaar), abha=frozenset(abha),
                    pan=frozenset(pan), insurance=frozenset(insurance),
                    age=age, gender=gender, village=village,
                ))

    def _extract_json_record_evidence(self, item: dict, rel: str, loc: str) -> RecordEvidence | None:
        """Extract clean linking evidence from a single patient/visit JSON dict."""
        phones: set[str] = set()
        mrns: set[str] = set()
        aadhaar: set[str] = set()
        abha: set[str] = set()
        pan: set[str] = set()
        insurance: set[str] = set()
        names_latin: set[str] = set()
        relatives_latin: set[str] = set()
        names_full = ""
        age = None
        gender = None
        village = None

        stack = [(item, "")]
        while stack:
            obj, pk = stack.pop()
            if not isinstance(obj, dict):
                continue
            pkl = pk.lower()
            if pkl in _NON_PERSON_CONTAINER_KEYS or pkl in _DOCTOR_KEYS:
                continue

            for k, v in obj.items():
                kl = str(k).lower()
                if kl in _NON_PERSON_CONTAINER_KEYS or kl in _DOCTOR_KEYS:
                    continue
                if isinstance(v, dict):
                    if kl in ("name",) and pkl in ("", "patient", "raised_by", "subject"):
                        parts = []
                        for sk in ("first", "last", "text", "local", "given", "family"):
                            sv = v.get(sk)
                            if isinstance(sv, str) and sv.strip():
                                parts.append(sv.strip())
                                names_latin |= extract_name_tokens_latin(sv)
                            elif isinstance(sv, list):
                                for s in sv:
                                    if isinstance(s, str):
                                        parts.append(s)
                                        names_latin |= extract_name_tokens_latin(s)
                        if not names_full and parts:
                            names_full = " ".join(parts[:2])
                    elif kl in ("guardian", "relative"):
                        if isinstance(v.get("name"), str):
                            relatives_latin |= extract_name_tokens_latin(v["name"])
                        rel_str = str(v.get("relation", "")).upper()
                        if rel_str.startswith("W"):
                            gender = gender or "F"
                        elif rel_str.startswith("S"):
                            gender = gender or "M"
                    else:
                        stack.append((v, str(k)))
                elif isinstance(v, (str, int)):
                    vs = str(v).strip()
                    if not vs:
                        continue
                    ct = classify_column(str(k))
                    if ct == ColumnType.DOCTOR:
                        continue
                    elif kl == "data" and isinstance(v, str):
                        dec = _try_decode_b64_text(v)
                        if dec:
                            ev_sub = self._extract_evidence_from_text(dec, rel, loc)
                            if ev_sub:
                                phones |= ev_sub.phones
                                mrns |= ev_sub.mrns
                                names_latin |= ev_sub.names_latin
                    elif ct == ColumnType.PATIENT_NAME:
                        names_latin |= extract_name_tokens_latin(vs)
                        if not names_full:
                            names_full = vs
                    elif ct == ColumnType.RELATIVE_NAME:
                        cleaned_rel = re.sub(r"(?i)^(?:[SDW]\s*/\s*O)\s*", "", vs).strip()
                        relatives_latin |= extract_name_tokens_latin(cleaned_rel)
                    elif ct == ColumnType.PHONE:
                        for pm in find_phones(vs):
                            phones.add(normalize_phone(pm.surface))
                        d = normalize_phone(vs)
                        if len(d) == 10 and d[0] in "6789":
                            phones.add(d)
                    elif ct == ColumnType.MRN or kl in ("patient_ref", "hospital_uhid", "uhid"):
                        for mm in find_mrn(vs):
                            mrns.add(normalize_mrn(mm.surface))
                        if not mrns and kl not in ("visit_id", "id", "bill_no"):
                            nm = normalize_mrn(vs)
                            if len(nm) >= 5:
                                mrns.add(nm)
                    elif ct == ColumnType.AADHAAR:
                        d = re.sub(r"\D", "", vs)
                        if len(d) == 12:
                            aadhaar.add(d)
                    elif ct == ColumnType.ABHA:
                        d = re.sub(r"\D", "", vs)
                        if len(d) == 14:
                            abha.add(d)
                    elif ct == ColumnType.AGE and isinstance(v, (int, str)):
                        am = re.search(r"\d{1,3}", vs)
                        if am and 0 < int(am.group(0)) < 120:
                            age = int(am.group(0))
                    elif kl in ("sex", "gender", "ling"):
                        vl = vs.lower()
                        if vl in ("m", "male", "पुरुष"):
                            gender = "M"
                        elif vl in ("f", "female", "महिला", "स्त्री"):
                            gender = "F"
                    elif ct == ColumnType.VILLAGE:
                        if any("\u0900" <= c <= "\u097F" for c in vs):
                            from .linker import transliterate_deva_to_latin
                            vs = transliterate_deva_to_latin(vs)
                        village = vs.lower()
                    elif kl in _PROSE_KEYS:
                        ev_sub = self._extract_evidence_from_text(vs, rel, loc)
                        if ev_sub:
                            phones |= ev_sub.phones
                            mrns |= ev_sub.mrns
                            relatives_latin |= ev_sub.relatives_latin
                            for nm in find_names_in_text(vs, self.all_names, self._gazetteer_rx):
                                if nm.role == "patient":
                                    names_latin |= extract_name_tokens_latin(nm.surface)

        if not (phones or mrns or aadhaar or abha or pan or names_latin):
            return None
        return RecordEvidence(
            file_rel=rel, loc=loc,
            names_latin=frozenset(names_latin), names_full=names_full,
            relatives_latin=frozenset(relatives_latin),
            phones=frozenset(phones), mrns=frozenset(mrns),
            aadhaar=frozenset(aadhaar), abha=frozenset(abha),
            pan=frozenset(pan), insurance=frozenset(insurance),
            age=age, gender=gender, village=village,
        )

    def _link_fhir_bundle(self, data: dict, rel: str) -> RecordEvidence | None:
        """Extract Patient / RelatedPerson evidence from a FHIR Bundle without mixing Organization/Practitioner."""
        phones: set[str] = set()
        mrns: set[str] = set()
        aadhaar: set[str] = set()
        abha: set[str] = set()
        pan: set[str] = set()
        names_latin: set[str] = set()
        relatives_latin: set[str] = set()
        names_full = ""
        age = None
        gender = None
        village = None

        for entry in data.get("entry", []):
            res = entry.get("resource", {})
            rt = res.get("resourceType", "")
            if rt == "Patient":
                g = str(res.get("gender", "")).lower()
                if g == "male":
                    gender = "M"
                elif g == "female":
                    gender = "F"
                bd = str(res.get("birthDate", ""))
                if re.match(r"^\d{4}", bd):
                    age = max(0, 2026 - int(bd[:4]))
                for ident in res.get("identifier", []):
                    val = str(ident.get("value", ""))
                    for mm in find_mrn(val):
                        mrns.add(normalize_mrn(mm.surface))
                    for am in find_aadhaar(val):
                        aadhaar.add(re.sub(r"\D", "", am.surface))
                    for ab in find_abha(val):
                        abha.add(re.sub(r"\D", "", ab.surface))
                for tel in res.get("telecom", []):
                    for pm in find_phones(str(tel.get("value", ""))):
                        phones.add(normalize_phone(pm.surface))
                for nm in res.get("name", []):
                    parts = []
                    if isinstance(nm.get("text"), str):
                        parts.append(nm["text"])
                    for gk in nm.get("given", []) or []:
                        parts.append(str(gk))
                    if isinstance(nm.get("family"), str):
                        parts.append(nm["family"])
                    joined = " ".join(parts)
                    if not names_full and joined:
                        names_full = joined
                    names_latin |= extract_name_tokens_latin(joined)
                for contact in res.get("contact", []):
                    cn = contact.get("name", {})
                    if isinstance(cn, dict):
                        c_str = " ".join([str(cn.get("text", "")), str(cn.get("family", ""))] +
                                         [str(x) for x in cn.get("given", []) or []])
                        relatives_latin |= extract_name_tokens_latin(c_str)
            elif rt == "RelatedPerson":
                for nm in res.get("name", []):
                    c_str = str(nm.get("text", ""))
                    relatives_latin |= extract_name_tokens_latin(c_str)
            elif rt == "DocumentReference":
                for cont in res.get("content", []):
                    att = cont.get("attachment", {})
                    if isinstance(att.get("data"), str):
                        dec = _try_decode_b64_text(att["data"])
                        if dec:
                            for pm in find_phones(dec):
                                phones.add(normalize_phone(pm.surface))
                            for mm in find_mrn(dec):
                                mrns.add(normalize_mrn(mm.surface))

        if not (phones or mrns or aadhaar or abha or names_latin):
            return None
        return RecordEvidence(
            file_rel=rel, loc="doc",
            names_latin=frozenset(names_latin), names_full=names_full,
            relatives_latin=frozenset(relatives_latin),
            phones=frozenset(phones), mrns=frozenset(mrns),
            aadhaar=frozenset(aadhaar), abha=frozenset(abha),
            pan=frozenset(pan), age=age, gender=gender, village=village,
        )

    def _link_json(self, text: str, rel: str):
        data = parse_json_safe(text)
        if data is None:
            return
        if is_fhir_bundle(data):
            ev = self._link_fhir_bundle(data, rel)
            if ev:
                self.linker.add_record(ev)
        elif isinstance(data, dict):
            if _is_multi_patient_index(data):
                # Do NOT merge all patients listed in an index file into a single cluster!
                return
            found_list = False
            for k, v in data.items():
                if _is_record_list(k, v):
                    found_list = True
                    pk = k.replace("~", "~0").replace("/", "~1")
                    for i, item in enumerate(v):
                        ev = self._extract_json_record_evidence(item, rel, f"/{pk}/{i}")
                        if ev:
                            self.linker.add_record(ev)
            if not found_list:
                # Unwrap deep single-chain nesting (like deep_export.json) to find leaf evidence
                cur = data
                steps = 0
                while isinstance(cur, dict) and len(cur) == 1 and steps < 5000:
                    only_val = next(iter(cur.values()))
                    if not isinstance(only_val, dict):
                        break
                    cur = only_val
                    steps += 1
                ev = self._extract_json_record_evidence(cur if isinstance(cur, dict) else data, rel, "doc")
                if ev:
                    self.linker.add_record(ev)

    def _link_text(self, text: str, rel: str):
        ev = self._extract_evidence_from_text(text, rel, "doc")
        if ev:
            self.linker.add_record(ev)

    # ─── Pass 3: Sanitization ───────────────────────────────────────────

    def _process_file(self, raw: bytes, rel: str, ext: str,
                       path: Path) -> tuple[str | None, list[dict]]:
        """Process a single file. Returns (sanitized_text, records_list) or (None, []) for quarantine."""
        records = []

        if ext not in (".csv", ".tsv", ".json", ".txt"):
            return None, []
        if not raw.strip():
            return None, []
        text = decode_bytes(raw)
        if text is None:
            return None, []

        text = text.replace("\r\n", "\n").replace("\r", "\n")

        if self._is_clean_file(rel, text):
            return text, [{"file": f"sanitized/{rel}", "loc": "doc", "patient": None}]

        try:
            if ext in (".csv", ".tsv"):
                return self._sanitize_csv(text, ext, rel, records)
            elif ext == ".json":
                return self._sanitize_json(text, rel, records)
            else:
                return self._sanitize_text(text, rel, records)
        except (RecursionError, csv.Error):
            return None, []

    def _is_clean_file(self, rel: str, text: str) -> bool:
        """Check if a file is a clean reference document (no patient PII)."""
        rel_lower = rel.lower()
        return rel_lower.startswith("clean/")

    def _get_patient_key_for_record(self, file_rel: str, loc: str) -> str | None:
        """Look up the patient key from the linker in O(1)."""
        idx = self._record_idx_map.get((file_rel, loc))
        if idx is None:
            return None
        return self.linker.get_patient_key(idx)

    def _clean_csv_header(self, header: list[str]) -> list[str]:
        """Sanitize CSV header strings (identifiers + known patient names across encodings)."""
        clean_header = []
        for h in header:
            clean_header.append(self._clean_key_or_header_text(h, name_tag="[REDACTED]"))
        return clean_header

    def _clean_key_or_header_text(self, raw: str, name_tag: str = "[REDACTED]") -> str:
        """Scrub identifiers and known names from a key/header using normalized span mapping."""
        norm, s_map, e_map = normalize_with_map(raw, decode_escapes=True)
        repls: list[tuple[int, int, str]] = []
        for m in find_all_identifiers_raw(norm):
            os_idx, oe_idx = map_norm_span(s_map, e_map, m.start, m.end)
            repls.append((os_idx, oe_idx, f"[{m.type}]"))
        if self._gazetteer_rx is not None:
            for m in self._gazetteer_rx.finditer(norm):
                os_idx, oe_idx = map_norm_span(s_map, e_map, m.start(), m.end())
                if not any(os_idx < re_ and oe_idx > rs for rs, re_, _ in repls):
                    repls.append((os_idx, oe_idx, name_tag))
        if not repls:
            return raw
        repls.sort(key=lambda x: (x[0], -(x[1] - x[0])))
        result = raw
        filtered = []
        last_e = -1
        for st, en, rep in repls:
            if st >= last_e:
                filtered.append((st, en, rep))
                last_e = en
        for st, en, rep in reversed(filtered):
            result = result[:st] + rep + result[en:]
        return result

    def _sanitize_csv(self, text: str, ext: str, rel: str,
                       records: list) -> tuple[str, list[dict]]:
        delim = "\t" if ext == ".tsv" else detect_delimiter(text)
        header, body = read_csv_rows(text, delim)
        if not header or not body:
            return self._sanitize_text(text, rel, records)

        col_types = [classify_column(h) for h in header]
        clean_header = self._clean_csv_header(header)
        date_hint_default = "mdy" if "arogya" in rel.lower() else "dmy"

        clean_body = []
        for i, row in enumerate(body):
            patient_key = self._get_patient_key_for_record(rel, f"row:{i}")
            pid = pseudonym(patient_key) if patient_key else None

            clean_row = []
            has_pii = False
            for j, cell in enumerate(row):
                ct = col_types[j] if j < len(col_types) else ColumnType.UNKNOWN
                h_str = header[j] if j < len(header) else ""
                row_hint = "mdy" if "mm/dd" in h_str.lower() else date_hint_default
                cleaned = self._clean_cell(cell, ct, patient_key, pid, row_hint)
                if cleaned != cell:
                    has_pii = True
                clean_row.append(cleaned)

            if pid:
                for j, h in enumerate(clean_header):
                    hl = h.lower()
                    if any(x in hl for x in ("patient_ref", "patient_id", "patientid")):
                        if j < len(clean_row):
                            clean_row[j] = pid
                        break
                    elif any(x in hl for x in ("name", "patient", "naam")) and j < len(col_types) and col_types[j] == ColumnType.PATIENT_NAME:
                        if j < len(clean_row):
                            clean_row[j] = pid
                        break

            clean_body.append(clean_row)
            status = "generalized" if has_pii else "sanitized"
            if has_pii:
                self.stats["records_generalized"] += 1
            emitted_pid = pid if (pid and any(pid in c for c in clean_row)) else None
            records.append({
                "file": f"sanitized/{rel}",
                "loc": f"row:{i}",
                "patient": emitted_pid,
                "status": status,
            })
            self.stats["identifiers_detected"] += sum(
                1 for j, cell in enumerate(row)
                if j < len(col_types)
                and col_types[j] not in (ColumnType.SAFE, ColumnType.UNKNOWN, ColumnType.DOCTOR, ColumnType.DISTRICT, ColumnType.CLINICAL_DATE)
                and cell.strip()
            )

        return write_csv(clean_header, clean_body, delim), records

    def _clean_cell(self, cell: str, col_type: str, patient_key: str | None,
                     pid: str | None, date_hint: str = "dmy") -> str:
        """Clean a single CSV cell based on its column type."""
        if not cell.strip():
            return cell

        if col_type == ColumnType.DOCTOR:
            return cell
        elif col_type == ColumnType.PATIENT_NAME:
            self.stats["identifiers_detected"] += 1
            return pid if pid else "[NAME]"
        elif col_type == ColumnType.RELATIVE_NAME:
            self.stats["identifiers_detected"] += 1
            m = re.match(r"(?i)((?:S|D|W)\s*/\s*(?:o|O)\s*,?\s*)", cell)
            prefix = m.group(1) if m else ""
            return prefix + "[RELATIVE]"
        elif col_type == ColumnType.PHONE:
            self.stats["identifiers_detected"] += 1
            return "[PHONE]"
        elif col_type == ColumnType.AADHAAR:
            self.stats["identifiers_detected"] += 1
            return "[AADHAAR]"
        elif col_type == ColumnType.ABHA:
            self.stats["identifiers_detected"] += 1
            return "[ABHA]"
        elif col_type == ColumnType.PAN:
            self.stats["identifiers_detected"] += 1
            return "[PAN]"
        elif col_type == ColumnType.EMAIL:
            self.stats["identifiers_detected"] += 1
            return "[EMAIL]"
        elif col_type == ColumnType.INSURANCE:
            self.stats["identifiers_detected"] += 1
            return "[INSURANCE]"
        elif col_type == ColumnType.MRN:
            self.stats["identifiers_detected"] += 1
            return pid if pid else "[MRN]"
        elif col_type == ColumnType.DOB:
            self.stats["identifiers_detected"] += 1
            if patient_key:
                return shift_date_string(cell, patient_key, hint=date_hint, max_days=self.date_shift_max)
            return "[DOB]"
        elif col_type == ColumnType.CLINICAL_DATE:
            if patient_key:
                return shift_date_string(cell, patient_key, hint=date_hint, max_days=self.date_shift_max)
            return cell
        elif col_type == ColumnType.AGE:
            try:
                age_val = int(re.search(r"\d+", cell).group())
                if 0 < age_val < 120:
                    self.stats["records_generalized"] += 1
                    return age_band(age_val, self.age_width)
            except (ValueError, AttributeError):
                pass
            return cell
        elif col_type == ColumnType.AGE_SEX:
            self.stats["records_generalized"] += 1
            return _shift_age_sex_cell(cell, self.age_width)
        elif col_type == ColumnType.PIN:
            self.stats["identifiers_detected"] += 1
            return "[PIN]" if len(re.sub(r"\D", "", cell)) != 6 else re.sub(r"\D", "", cell)[:3] + "***"
        elif col_type == ColumnType.VILLAGE:
            self.stats["identifiers_detected"] += 1
            return "[VILLAGE]"
        elif col_type == ColumnType.ADDRESS:
            self.stats["identifiers_detected"] += 1
            return "[ADDRESS]"
        if col_type == ColumnType.TEHSIL:
            self.stats["identifiers_detected"] += 1
            return "[TEHSIL]"
        elif col_type == ColumnType.DISTRICT:
            return cell
        elif col_type == ColumnType.LANDMARK:
            self.stats["identifiers_detected"] += 1
            return "[LANDMARK]"
        elif col_type == ColumnType.SAFE:
            return self._clean_unknown_cell(cell, patient_key, pid, enable_pin=False)
        else:
            return self._clean_unknown_cell(cell, patient_key, pid, enable_pin=True)

    def _clean_unknown_cell(self, cell: str, patient_key: str | None,
                             pid: str | None, enable_pin: bool = True) -> str:
        """Clean a free-text/unknown cell preserving doctors and medical spans."""
        sanitizer = TextSanitizer(
            known_names=self.all_names,
            patient_key=patient_key,
            pseudonym=pid,
            enable_pin=enable_pin,
            gazetteer_rx=self._gazetteer_rx,
        )
        cleaned = sanitizer.sanitize(cell)
        if cleaned != cell:
            self.stats["identifiers_detected"] += 1
        return cleaned

    def _sanitize_json(self, text: str, rel: str,
                        records: list) -> tuple[str | None, list[dict]]:
        data = parse_json_safe(text)
        if data is None:
            return None, []
        if is_fhir_bundle(data):
            return self._sanitize_fhir(data, rel, records)
        if isinstance(data, dict):
            return self._sanitize_json_dict(data, rel, records)
        return self._sanitize_text(text, rel, records)

    def _sanitize_fhir(self, data: dict, rel: str,
                        records: list) -> tuple[str, list[dict]]:
        patient_key = self._get_patient_key_for_record(rel, "doc")
        pid = pseudonym(patient_key) if patient_key else None
        result = sanitize_fhir_bundle(data, patient_key, pid, self.all_names)
        out_str = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        emitted_pid = pid if (pid and pid in out_str) else None
        records.append({"file": f"sanitized/{rel}", "loc": "doc", "patient": emitted_pid})
        return out_str, records

    def _sanitize_json_dict(self, data: dict, rel: str,
                             records: list) -> tuple[str, list[dict]]:
        date_hint = "mdy" if "arogya" in rel.lower() else "dmy"
        is_index = _is_multi_patient_index(data)
        list_key_found = None

        if not is_index:
            for k, v in data.items():
                if _is_record_list(k, v):
                    list_key_found = k
                    break

        if list_key_found is not None:
            cleaned: dict = {}
            pk_ptr = list_key_found.replace("~", "~0").replace("/", "~1")
            for k, v in data.items():
                clean_k = self._clean_json_key(k)
                if k == list_key_found:
                    out_items = []
                    for i, item in enumerate(v):
                        loc = f"/{pk_ptr}/{i}"
                        item_pkey = self._get_patient_key_for_record(rel, loc)
                        item_pid = pseudonym(item_pkey) if item_pkey else None
                        cleaned_item = self._clean_json_value_iter(item, item_pkey, item_pid, k, date_hint)
                        emitted_pid = (
                            item_pid if (item_pid and item_pid in json.dumps(cleaned_item, ensure_ascii=False)) else None
                        )
                        records.append({
                            "file": f"sanitized/{rel}",
                            "loc": loc,
                            "patient": emitted_pid,
                        })
                        out_items.append(cleaned_item)
                    cleaned[clean_k] = out_items
                else:
                    cleaned[clean_k] = self._clean_json_value_iter(v, None, None, k, date_hint)
            return json.dumps(cleaned, ensure_ascii=False, indent=2) + "\n", records

        # Whole document = single record (e.g. lab report_00005.json, scanned_consent_form, deep_export, patient_index)
        doc_pkey = None if is_index else self._get_patient_key_for_record(rel, "doc")
        doc_pid = pseudonym(doc_pkey) if doc_pkey else None
        cleaned = self._clean_json_value_iter(data, doc_pkey, doc_pid, "", date_hint)
        out_str = json.dumps(cleaned, ensure_ascii=False, indent=2) + "\n"
        emitted_pid = doc_pid if (doc_pid and doc_pid in out_str) else None
        records.append({
            "file": f"sanitized/{rel}",
            "loc": "doc",
            "patient": emitted_pid,
        })
        return out_str, records

    def _clean_json_value_iter(self, root, patient_key: str | None,
                                pid: str | None, root_parent_key: str = "",
                                date_hint: str = "dmy"):
        """Iterative JSON sanitizer safe for arbitrary nesting depth (1500+ levels)."""
        # Handle single-key deep wrapper chains iteratively first
        prefix_keys: list[str] = []
        cur = root
        while isinstance(cur, dict) and len(cur) == 1:
            only_k, only_v = next(iter(cur.items()))
            if not isinstance(only_v, dict):
                break
            if str(only_k).lower() in ("patient", "guardian", "contact", "address", "name",
                                       "_export_meta", "by_uhid", "by_name"):
                break
            prefix_keys.append(self._clean_json_key(str(only_k)))
            cur = only_v

        sanitized_core = self._clean_json_shallow(cur, patient_key, pid, root_parent_key, date_hint, depth=0)
        for pk in reversed(prefix_keys):
            sanitized_core = {pk: sanitized_core}
        return sanitized_core

    def _clean_json_shallow(self, obj, patient_key: str | None, pid: str | None,
                             parent_key: str, date_hint: str, depth: int):
        """Recursively clean bounded JSON subtrees (delegates any deep chains safely)."""
        if depth > 400 and isinstance(obj, dict) and len(obj) == 1:
            return self._clean_json_value_iter(obj, patient_key, pid, parent_key, date_hint)

        if isinstance(obj, str):
            return self._clean_json_string(obj, patient_key, pid, date_hint)
        if isinstance(obj, list):
            return [
                self._clean_json_shallow(item, patient_key, pid, parent_key, date_hint, depth + 1)
                for item in obj
            ]
        if not isinstance(obj, dict):
            return obj

        pkl = parent_key.lower()
        result: dict = {}
        for k, v in obj.items():
            k_str = str(k)
            kl = k_str.lower()

            # Preserve Organization / Hospital / Panel names without turning them into [NAME]!
            if pkl in _NON_PERSON_CONTAINER_KEYS and kl in ("name", "hospital", "city", "state", "type"):
                result[k_str] = v
                continue

            # Preserve Doctor / Referred-by strings (still scrub non-doctor PII if ever present? Dr. X Y is kept)
            if kl in _DOCTOR_KEYS or (kl == "name" and pkl in _DOCTOR_KEYS):
                result[k_str] = v
                continue

            # Disambiguate cleaned keys so multi-patient maps (patient_index) don't overwrite each other!
            raw_clean_k = self._clean_json_key(k_str)
            clean_k = raw_clean_k
            if clean_k in result:
                c = 1
                while f"{raw_clean_k}_{c}" in result:
                    c += 1
                clean_k = f"{raw_clean_k}_{c}"

            # Decode & sanitize base64 / hex payloads using full TextSanitizer
            if kl == "data" and isinstance(v, str):
                dec = _try_decode_b64_text(v)
                if dec is not None:
                    san = TextSanitizer(known_names=self.all_names, patient_key=patient_key, pseudonym=pid, date_hint=date_hint)
                    cleaned_dec = san.sanitize(dec)
                    result[clean_k] = b64mod.b64encode(cleaned_dec.encode("utf-8")).decode("ascii")
                    continue
                dec_hex = try_decode_hex_text(v)
                if dec_hex is not None:
                    san = TextSanitizer(known_names=self.all_names, patient_key=patient_key, pseudonym=pid, date_hint=date_hint)
                    cleaned_dec = san.sanitize(dec_hex)
                    result[clean_k] = cleaned_dec.encode("utf-8").hex() if cleaned_dec != dec_hex else v
                    continue

            col_type = classify_column(k_str)

            # Nested non-person sub-objects ("name" under "panels" or "hospital" etc.)
            if kl == "name" and pkl in ("panels", "panel", "diagnosis", "rx", "results", "hospital",
                                        "facility", "organization", "lab", "department"):
                result[clean_k] = v
                continue

            if kl in ("source_path", "source") and isinstance(v, str):
                result[clean_k] = self._clean_metadata_path(v, pid)
            elif kl == "hospital" and isinstance(v, str):
                result[clean_k] = v
            elif kl == "exported_by" and isinstance(v, str):
                result[clean_k] = v
            elif kl in ("name", "local") and isinstance(v, str):
                if isinstance(obj.get("first"), str) or isinstance(obj.get("last"), str) or pkl in _PERSON_CONTAINER_KEYS:
                    result[clean_k] = pid if pid else "[NAME]"
                elif col_type == ColumnType.PATIENT_NAME:
                    result[clean_k] = pid if pid else "[NAME]"
                else:
                    result[clean_k] = self._clean_json_string(v, patient_key, pid, date_hint)
            elif kl in ("first", "last", "family", "given") and isinstance(v, str):
                result[clean_k] = pid if pid else "[NAME]"
            elif kl == "name" and isinstance(v, dict):
                name_obj = {}
                for nk, nv in v.items():
                    name_obj[nk] = (pid if pid else "[NAME]") if isinstance(nv, str) else nv
                result[clean_k] = name_obj
            elif kl == "contact" and isinstance(v, dict):
                contact_obj = {}
                for ck, cv in v.items():
                    ckl = str(ck).lower()
                    if any(x in ckl for x in ("mobile", "phone", "tel", "emergency")):
                        contact_obj[ck] = "[PHONE]" if cv is not None else None
                    elif "email" in ckl:
                        contact_obj[ck] = "[EMAIL]" if cv is not None else None
                    else:
                        contact_obj[ck] = self._clean_json_shallow(cv, patient_key, pid, str(ck), date_hint, depth + 1)
                result[clean_k] = contact_obj
            elif kl == "address" and isinstance(v, dict):
                # Preserve generalized district/state in structured addresses while stripping street/tehsil/city/PIN
                addr_out = {}
                for ak, av in v.items():
                    akl = str(ak).lower()
                    if akl in ("district", "distt", "state", "country"):
                        addr_out[ak] = av
                    elif akl == "tehsil":
                        addr_out[ak] = "[TEHSIL]" if av is not None else None
                    elif akl in ("pin", "pincode", "zip", "postalcode") and av is not None:
                        digits = re.sub(r"\D", "", str(av))
                        addr_out[ak] = (digits[:3] + "***") if len(digits) == 6 else "[PIN]"
                    elif av is None:
                        addr_out[ak] = None
                    else:
                        addr_out[ak] = "[ADDRESS]" if "line" in akl or "street" in akl else "[LOCATION]"
                result[clean_k] = addr_out
            elif col_type == ColumnType.DOCTOR:
                result[clean_k] = v
            elif col_type == ColumnType.PATIENT_NAME and isinstance(v, str):
                result[clean_k] = pid if pid else "[NAME]"
            elif col_type == ColumnType.PHONE and isinstance(v, (str, int)):
                result[clean_k] = "[PHONE]"
            elif col_type == ColumnType.AADHAAR and isinstance(v, (str, int)):
                result[clean_k] = "[AADHAAR]"
            elif col_type == ColumnType.ABHA and isinstance(v, (str, int)):
                result[clean_k] = "[ABHA]"
            elif col_type == ColumnType.EMAIL and isinstance(v, str):
                result[clean_k] = "[EMAIL]"
            elif col_type == ColumnType.PAN and isinstance(v, str):
                result[clean_k] = "[PAN]"
            elif col_type == ColumnType.INSURANCE and isinstance(v, str):
                result[clean_k] = "[INSURANCE]"
            elif col_type == ColumnType.MRN and isinstance(v, (str, int)):
                if kl in ("visit_id", "bill_no"):
                    result[clean_k] = "[MRN]"
                else:
                    result[clean_k] = pid if pid else "[MRN]"
            elif col_type == ColumnType.DOB and isinstance(v, str):
                result[clean_k] = shift_date_string(v, patient_key, hint=date_hint, max_days=self.date_shift_max) if patient_key else "[DOB]"
            elif col_type == ColumnType.CLINICAL_DATE and isinstance(v, str):
                result[clean_k] = shift_date_string(v, patient_key, hint=date_hint, max_days=self.date_shift_max) if patient_key else v
            elif col_type == ColumnType.AGE and isinstance(v, (str, int)):
                try:
                    age_val = int(v) if isinstance(v, int) else int(re.search(r"\d+", str(v)).group())
                    result[clean_k] = age_band(age_val, self.age_width) if 0 < age_val < 120 else v
                except (ValueError, AttributeError):
                    result[clean_k] = v
            elif col_type == ColumnType.PIN and isinstance(v, (str, int)):
                digits = re.sub(r"\D", "", str(v))
                result[clean_k] = (digits[:3] + "***") if len(digits) == 6 else "[PIN]"
            elif col_type == ColumnType.VILLAGE and isinstance(v, str):
                result[clean_k] = "[VILLAGE]"
            elif col_type == ColumnType.ADDRESS and isinstance(v, str):
                result[clean_k] = "[ADDRESS]"
            elif col_type == ColumnType.LANDMARK and isinstance(v, str):
                result[clean_k] = "[LANDMARK]"
            elif col_type == ColumnType.RELATIVE_NAME:
                if isinstance(v, str):
                    result[clean_k] = "[RELATIVE]"
                elif isinstance(v, dict):
                    rv = {}
                    for sk, sv in v.items():
                        skl = str(sk).lower()
                        if "name" in skl:
                            rv[sk] = "[RELATIVE]"
                        elif "relation" in skl:
                            rv[sk] = sv
                        else:
                            rv[sk] = self._clean_json_shallow(sv, patient_key, pid, str(sk), date_hint, depth + 1)
                    result[clean_k] = rv
                else:
                    result[clean_k] = self._clean_json_shallow(v, patient_key, pid, k_str, date_hint, depth + 1)
            else:
                result[clean_k] = self._clean_json_shallow(v, patient_key, pid, k_str, date_hint, depth + 1)

        return result

    def _clean_json_string(self, s: str, patient_key: str | None,
                            pid: str | None, date_hint: str = "dmy") -> str:
        """Clean PII from a free-text JSON string value (respecting doctors and medical spans)."""
        if not s or len(s) < 3:
            return s
        dec = _try_decode_b64_text(s)
        if dec is not None:
            san = TextSanitizer(known_names=self.all_names, patient_key=patient_key, pseudonym=pid, date_hint=date_hint)
            return b64mod.b64encode(san.sanitize(dec).encode("utf-8")).decode("ascii")
        dec_hex = try_decode_hex_text(s)
        if dec_hex is not None:
            san = TextSanitizer(known_names=self.all_names, patient_key=patient_key, pseudonym=pid, date_hint=date_hint)
            cleaned_hex = san.sanitize(dec_hex)
            return cleaned_hex.encode("utf-8").hex() if cleaned_hex != dec_hex else s

        san = TextSanitizer(known_names=self.all_names, patient_key=patient_key, pseudonym=pid, date_hint=date_hint)
        s = san._scrub_inline_encoded(s)
        norm_s, s_map, e_map = normalize_with_map(s, decode_escapes=True)

        medical_spans = find_medical_spans(norm_s)
        doctor_spans = find_doctor_spans(norm_s)
        repls: list[tuple[int, int, str]] = []

        def _add_repl(ns: int, ne: int, rep: str) -> None:
            os_idx, oe_idx = map_norm_span(s_map, e_map, ns, ne)
            if not any(os_idx < re_ and oe_idx > rs for rs, re_, _ in repls):
                repls.append((os_idx, oe_idx, rep))

        _HARD = {"MRN", "PHONE", "AADHAAR", "AADHAAR_MASKED", "ABHA_NUMBER",
                 "ABHA_ADDRESS", "PAN", "EMAIL", "INSURANCE_ID"}
        for m in find_all_identifiers_raw(norm_s):
            if m.type in _HARD or not overlaps_medical(m.start, m.end, medical_spans):
                _add_repl(m.start, m.end, f"[{m.type}]")

        for nm in find_names_in_text(norm_s, self.all_names, self._gazetteer_rx):
            if nm.role == "doctor":
                continue
            if any(nm.start < de and nm.end > ds for ds, de in doctor_spans):
                continue
            if nm.role != "context" and overlaps_medical(nm.start, nm.end, medical_spans):
                continue
            repl = pid if (pid and nm.role == "patient") else ("[RELATIVE]" if nm.role == "relative" else "[NAME]")
            _add_repl(nm.start, nm.end, repl)

        if self._gazetteer_rx is not None:
            for m in self._gazetteer_rx.finditer(norm_s):
                pos, end = m.start(), m.end()
                if (pos > 0 and norm_s[pos - 1].isdigit()) or (end < len(norm_s) and norm_s[end].isdigit()):
                    continue
                if any(pos < de and end > ds for ds, de in doctor_spans):
                    continue
                if overlaps_medical(pos, end, medical_spans):
                    continue
                _add_repl(pos, end, pid if pid else "[NAME]")

        repls.sort(key=lambda x: (x[0], -(x[1] - x[0]), x[2]))
        filtered = []
        last_end = -1
        for st, en, rep in repls:
            if st >= last_end:
                filtered.append((st, en, rep))
                last_end = en

        result = s
        for st, en, rep in reversed(filtered):
            result = result[:st] + rep + result[en:]
        self.stats["identifiers_detected"] += len(filtered)
        return result

    def _clean_json_key(self, key: str) -> str:
        """Clean PII (MRNs, phones, patient names) from a JSON dict key."""
        cached = self._clean_key_cache.get(key)
        if cached is not None:
            return cached
        result = self._clean_key_or_header_text(key, name_tag="[REDACTED]")
        if len(self._clean_key_cache) < 2048:
            self._clean_key_cache[key] = result
        return result

    def _clean_metadata_path(self, path: str, pid: str | None) -> str:
        """Clean PII (names, phones, MRNs, and bare 5-8 digit ID cores) from metadata paths."""
        norm = canonical_clean(path, decode_escapes=True)
        src = norm if norm != path else path

        def _scrub_path(target: str) -> str:
            res = target
            if self._gazetteer_rx is not None:
                res = self._gazetteer_rx.sub("REDACTED", res)
            res = PHONE_RX.sub("[PHONE]", res)
            for m in find_mrn(res):
                res = res.replace(m.surface, pid if pid else "[MRN]")
            res = re.sub(r"\d{5,8}", "[ID]", res)
            return res

        cleaned = _scrub_path(src)
        if norm != path and cleaned == src:
            return path
        return cleaned

    def _sanitize_text(self, text: str, rel: str,
                        records: list) -> tuple[str, list[dict]]:
        patient_key = self._get_patient_key_for_record(rel, "doc")
        pid = pseudonym(patient_key) if patient_key else None
        date_hint = "mdy" if ("mdy" in rel.lower() or "arogya" in rel.lower()) else "dmy"

        sanitizer = TextSanitizer(
            known_names=self.all_names,
            patient_key=patient_key,
            pseudonym=pid,
            date_hint=date_hint,
            gazetteer_rx=self._gazetteer_rx,
        )
        result = sanitizer.sanitize(text)
        emitted_pid = pid if (pid and pid in result) else None
        records.append({"file": f"sanitized/{rel}", "loc": "doc", "patient": emitted_pid})
        return result, records

    # ─── Helpers ────────────────────────────────────────────────────────

    def _count_entity_types(self) -> dict[str, int]:
        return {"PATIENT_NAME": self.stats["identifiers_detected"]}

    def _peak_rss(self) -> float:
        try:
            import resource
            r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            return round(r / 1024 if sys.platform != "darwin" else r / 1048576, 1)
        except Exception:
            try:
                import psutil
                return round(psutil.Process().memory_info().rss / 1048576, 1)
            except Exception:
                return 0.0


def main() -> int:
    """CLI entry point."""
    ap = argparse.ArgumentParser(description="RAKSHAK Privacy Firewall")
    ap.add_argument("--input", required=True, help="Input directory")
    ap.add_argument("--output", required=True, help="Output directory")
    a = ap.parse_args()

    inp_str = a.input.strip("'\"")
    out_str = a.output.strip("'\"")

    here = Path(__file__).resolve().parent.parent
    policy = load_policy(here / "config" / "policy.yaml")

    pipeline = Pipeline(Path(inp_str), Path(out_str), policy)
    pipeline.run()
    return 0
