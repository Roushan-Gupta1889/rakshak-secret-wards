# RAKSHAK — Offline Privacy Firewall for Secret Wards (Track 3)

**Team:** `team-rakshak` · **Frozen Engine Tag:** `phase-1e-v1` · **Repository:** https://github.com/Roushan-Gupta1889/rakshak-secret-wards

## Overview

RAKSHAK (रक्षक = "protector") is a deterministic, fully **offline, CPU-only, LLM-free privacy firewall** built for heterogeneous Indian hospital exports across **English, Hindi (Devanagari), and Hinglish**. It eliminates direct, quasi-identifying, and cross-channel PII leaks across CSV, TSV, nested JSON, FHIR R4 Bundles, clinical prose, keys, headers, filenames, metadata paths, and Base64 payloads while preserving clinical utility (medications, doses, labs, vitals, doctors, diagnoses, and lengths of stay) and issuing cryptographically unlinkable longitudinal patient pseudonyms.

In **Phase 2**, RAKSHAK pairs the frozen pure-stdlib Stage 1 CLI engine with a process-isolated **Local FastAPI Security Adapter** (`apps/api`) and an offline **Audit & Sanitization Console** (`apps/web`) for live verification, cohort risk inspection, cryptographic unlinkability testing, and evaluator walkthroughs.

---

## Stage 1 Privacy Firewall Architecture (4-Pass Pipeline)

```text
Input Batch (CSV / TSV / JSON / FHIR R4 / Clinical TXT + Unsupported Binary Stubs)
   │
   ▼  Pass 1 — Global Name & Context Assembly
   │  • Multi-encoding decode (UTF-8 / BOM / UTF-16 / CP1252) & adversarial NFKC/homoglyph folding
   │  • Iterative deep JSON walker (handles 1,500+ level nesting) & span-mapped Base64/escape decoding
   │  • Statistical CSV inference & CamelCase/boundary schema classification (columns.py)
   │  • Dr. span protection, institutional exclusions & cached O(N) longest-first gazetteer
   ▼  Pass 2 — Cluster-Safe Cross-Script Record Linking
   │  • Akshara-aware Devanagari → Latin transliteration & Indic phonetic folding
   │  • Phase 1: exact ID matching (Phone / Aadhaar / ABHA / PAN / generic & structured MRNs)
   │  • Phase 2: soft corroboration (threshold 36.0) with pooled cluster checks (0 false merges)
   ▼  Pass 2b — Corpus Adaptive k-Anonymity Planning (k_anonymity.py, min_group_size=5)
   │  • Keeps fine 5-year age bands & districts in dense k >= 5 cohorts (adaptive_k_mixed)
   │  • Generalizes/suppresses rare outliers, extreme ages (>=80 / 85+), and small PIN prefixes
   ▼  Pass 3 — Context-Aware Privacy Layer, Hardened Pseudonyms & Fail-Safe Export
      • Keyed HMAC-SHA256 Crockford Base-32 PSN-XXXXXX w/ rejection sampling (\x00rej|{c}|{key})
      • Eliminates all-digit PSN-\d{6} collisions (1,072,741,824 valid alpha codes, 0 modulo bias)
      • Per-patient non-zero ±180d HMAC date shifts keeping exact intervals & hospital lengths of stay
      • FHIR R4 structural cleanup, filename/header/key scrubbing & fail-closed quarantine
   │
   ▼
Output: sanitized/ (mirrored UTF-8 exports) + report.json (SHA-256 audit) + records.jsonl
```

---

## Core Modules & Phase 1A–1E Hardening

- **Pure-Stdlib Detection & Trap Intelligence (`rakshak/detectors.py`, `names.py`, `medical.py`, `columns.py`):** Detects phones (`+91` and Devanagari `०–९`), Aadhaar / masked Aadhaar, ABHA numbers & addresses, PAN, emails, insurance/policy IDs, Indian PIN codes, and both known + unseen structural hospital MRNs (`Phase 1C`). Disambiguates care-of vs complaint (`C/O Ramesh` vs `C/O fever`), `K/C/O`, `H/O`, eponyms (`Parkinson's`), `1-0-1` doses, vitals, and multi-token `Dr.` spans, supported by statistical CSV column inference (`Phase 1B`) and adversarial span-mapped escape decoding (`Phase 1A`).
- **Cluster-Safe Multilingual Linking (`rakshak/linker.py`):** Normalizes across English, Devanagari, and Hinglish without merging distinct homonyms (`0` wrong merges).
- **Cryptographic Privacy & Numeric Hardening (`rakshak/crypto.py`, `privacy.py`, `k_anonymity.py`):** Keys `PSN-XXXXXX` and non-zero `±180d` date shifts with `RAKSHA_SECRET` bound strictly in child process env. Phase 1D adds corpus adaptive k-anonymity (`config/policy.yaml`), and Phase 1E adds deterministic domain-separated rejection sampling guaranteeing at least one alphabetic character in every `PSN-XXXXXX` to prevent 6-digit PIN/numeric detector inversion (`A6`).
- **FHIR R4 & Fail-Closed Quarantine (`rakshak/fhir_handler.py`, `filename_sanitizer.py`, `pipeline.py`):** Preserves R4 Bundles (including `text.div`, extensions, resolvable references, and decoded Base64 `DocumentReference` attachments) while safely quarantining unsupported/corrupt files (`.pdf`, `.jpg`, `.xml`, empty/truncated) with `output: null` in `report.json`.

---

## Security Design & Trust Boundaries

1. **Zero Secret Persistence or Exposure:** `RAKSHA_SECRET` is read solely from process environment variables (`os.environ`) in `rakshak/crypto.py`; never logged, returned in HTTP JSON responses, stored in browser storage, or emitted in `report.json` / `records.jsonl`.
2. **Stdlib-Only Stage 1 Runtime:** Root `requirements.txt` contains zero third-party packages, ensuring deterministic (`PYTHONHASHSEED`-safe), offline, CPU-only execution without cloud APIs or LLMs.
3. **Process-Isolated Phase 2 Local Adapter (`apps/api/`):** FastAPI adapter never imports `Pipeline()` in-process. Every run invokes `python -m rakshak` via an allowlisted subprocess, enforces loopback `Host` (`127.0.0.1` / `localhost` / `[::1]`), strict `Origin` allowlists, `SameSite=Strict` signed double-submit CSRF tokens, `5 MiB/file` & `25 MiB/batch` streaming limits, path-traversal rejection, and immediate `shutil.rmtree()` purge of staged raw inputs (logical OS unlink; zero temporary scratch retention).
4. **Offline-First Frontend (`apps/web/`):** React + TypeScript + Vite console bundling Inter, JetBrains Mono, and ECharts locally (`0` external network/CDN calls, `0` client-side cryptography, `0` `localStorage` usage). Includes **Overview**, **Evaluator Demo** (6-file non-sensitive synthetic batch + 10-step checklist), **Sanitization Studio**, **Medical Registry**, **Unlinkability Lab**, **Risk Analytics**, and **Policies & Architecture**.

---

## Verification & Measured Benchmarks

All metrics below explicitly preserve their evaluator provenance. **Official hidden-dataset competition leaderboard scores remain `UNAVAILABLE` locally.**

| Evaluation Suite | Provenance | Measured Result | Notes |
| :--- | :--- | :--- | :--- |
| `Secret-Wards-ToolKit/check_submission.py --run` | Official ToolKit (`Phase 1E` + `Phase 2`) | **READY TO SUBMIT · CONTRACT OK** (`3.8s`) | Deterministic same-secret outputs, distinct cross-secret outputs, zero `RAKSHA_SECRET` leaks, input folder untouched |
| `check_dev.py` on Linux-normalized LF corpus (`200` files, `48` patients) | Reconstructed Official (`Phase 1D/1E`) | **0 / 3,230 leaked (0.0%)**, **0 / 4** canaries, **0** raw copies, **4,763 / 4,855 (98.1%)** med probes, **`F0.5 = 0.99`** (**0** wrong merges) | Adaptive k-anonymity generalizes 92 sparse `[DISTRICT]` probes deliberately to mitigate linkage attacks |
| Raw `check_dev.py` on Windows CRLF checkout | Official ToolKit Script (`Windows`) | `4,405 / 4,497` (**98.0%**) med probes, **`0 / 4`** canaries, **`0`** raw copies, **`F0.5 = 0.98`** (`0` wrong merges), `0.0%` content/base64/metadata/key/header/Deva/Hinglish leaks | Windows CRLF alters `.txt`/`.json` SHA-256 vs Linux `truth.json`, triggering `filename` fallback noise; LF bytes match 100% |
| `eval_arena.py` local privacy attack simulation (`phase-1e-v1`) | Local Attacker Simulator (`FROZEN`, non-official) | **97.57** total (`audit-sec-A`, privacy `0.9858`, `A1=0.0`, `A2/3=0.0198`, `A4=0.0208`, `A5=0.0284`, `A6=0.0`, `A7=0.0`); **97.13** (`baseline-sec-A`, `4.8s`, `30.8 MB` RSS) | `19 / 19` valid FHIR R4 Bundles, `14 / 14` chaos checks PASS, trap cohorts `PT00035/PT00046` risk `1.000 -> 0.0085` |
| `test_phase1e.py` (100k-key Crockford invariants) | Verification Test Suite (`FROZEN`) | **100,000 / 100,000** valid alpha PSNs, `10/10` numeric triggers remapped, `99,996/100,000` distinct, `0/10,000` cross-secret overlap | Confirming 30-bit birthday expectation (`E[distinct] = 99,995.34`) over `1,072,741,824` valid codes |
| Phase 2 API & UI Test Suites (`pytest` + `vitest` + Playwright E2E) | Phase 2 Suite (`6061ce3`) | Backend `8/8` passed; Frontend `12/12` files (`36/36` tests); CDN scan `0` matches; offline Playwright E2E `0` console/network errors | Tested cleanly on desktop (`1440x900`) and mobile (`390x844`) viewports with zero leaks |

---

## Known Limitations

- **No OCR on Scanned Images/PDFs:** Binary `.pdf` and `.jpg`/`.png` uploads are fail-closed quarantined rather than OCR'd, guaranteeing zero leaked image text at the cost of excluding image-only scans.
- **Privacy vs. Sparse District Probes:** Adaptive `min_group_size = 5` deliberately generalizes rare extreme-age (`>=80`) and sparse cohort districts (`~1.9%` of practice clinical probes) to defeat cross-document linkage attacks.
- **Novel Unlabelled Record IDs:** Completely arbitrary institutional ID strings outside recognized patterns and labelled columns depend on co-occurring patient names or contact cues for linkage.
- **Physical Media Erasure:** Phase 2 staging purges raw uploads immediately via `shutil.rmtree()`, which performs OS unlinking rather than hardware block wiping and relies on host disk encryption.

---

## Quick Usage

### 1. Stage 1 CLI Engine (Submission Entrypoint, Zero External Dependencies)

```bash
pip install -r requirements.txt
RAKSHA_SECRET=practice python -m rakshak --input path/to/input --output path/to/output
python ../Secret-Wards-ToolKit/validate_output.py --input path/to/input --output path/to/output
python ../Secret-Wards-ToolKit/check_submission.py --repo . --run
```

### 2. Optional Local Audit Console & API (Offline Development / Demo)

```bash
pip install -r apps/api/requirements-api.txt
python -m uvicorn rakshak_api.main:app --app-dir apps/api --host 127.0.0.1 --port 8000

cd apps/web
npm install
npm run build
npm run preview   # Opens offline console on http://127.0.0.1:5173/
```
