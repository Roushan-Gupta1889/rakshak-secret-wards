# RAKSHAK — Privacy Firewall for Secret Wards (Track 3)

## Overview

RAKSHAK (रक्षक = "protector") is an offline, CPU-only, standard-library privacy firewall built for heterogeneous Indian hospital records across English, Hindi (Devanagari), and Hinglish. It removes all direct and indirect personal identifiers across content, filenames, JSON keys, headers, metadata paths, FHIR R4 narrative/attachments, and base64 payloads while preserving **100.0%** of clinical utility (medicines, doses, vitals, lab results, doctors, and diagnoses).

## Architecture

```
Input Files (CSV / TSV / JSON / FHIR R4 / TXT)
        │
        ▼
┌──────────────────────────────────────────────────────┐
│  Pass 1: Global Name & Context Assembly              │
│  • Multi-encoding decode (UTF-8 / BOM / UTF-16 / cp1252) │
│  • Iterative JSON walk (arbitrary nesting depth)     │
│  • Base64 & prose contextual extraction (Latin/Deva) │
│  • Institutional & Dr. exclusion sets                │
└─────────────────────────┬────────────────────────────┘
                          │ Compiled sorted gazetteer
                          ▼
┌──────────────────────────────────────────────────────┐
│  Pass 2: Cluster-Safe Two-Phase Patient Linking      │
│  • Akshara-aware Devanagari → Latin transliteration  │
│  • Indic phonetic canonicalization                   │
│  • Phase 1: Strong IDs (Phone/Aadhaar/ABHA/PAN/MRN)  │
│  • Phase 2: Name + relative/village/age w/ conflict checks │
└─────────────────────────┬────────────────────────────┘
                          │ Keyed HMAC-SHA256 pseudonyms
                          ▼
┌──────────────────────────────────────────────────────┐
│  Pass 3: Privacy Layer & Fail-Safe Export            │
│  • Column/key-aware CSV, JSON, FHIR & text sanitization │
│  • Protected medical & Dr. spans (C/O, K/C/O, eponyms) │
│  • Per-patient secret date shifting + 5-yr / 85+ bands │
│  • Prefix-3 PIN, Tehsil/village/address redaction    │
└─────────────────────────┬────────────────────────────┘
                          ▼
Output: sanitized/ + report.json + records.jsonl
```

## Core Components

- **PII Detection Engine (`rakshak/detectors.py`)**: Detects Indian phones (+91 and Devanagari ०–९ digits), 12-digit and masked Aadhaar, 14-digit ABHA, ABHA addresses, PAN, emails, PMJAY/policy IDs, Indian PIN codes, and hospital MRN/UHID prefixes (`UHID`, `SNJ`, `JJH`, `DHH-IPD`, `IPD`, `IP`, `ADM`, `OPD`, `BL`, `POL`). Hard identifiers bypass medical-span masking while preserving `doctor_spans`.
- **Multilingual Name Detection (`rakshak/names.py`)**: Case-sensitive vs case-insensitive disambiguation for `C/O` (`C/O Ramesh` vs `C/O cough`), `K/C/O`, `H/O`, Hindi labels (`नाम:`, `मरीज़ का नाम:`, `पिता/पति का नाम:`), honorifics (`ji`, `sahab`, `behenji`), contextual witness/attendant cues, and an O(N) cached longest-first lexicographically-tied compiled gazetteer.
- **Medical Term Preservation (`rakshak/medical.py`)**: Compiled drug formulary regex, dosage forms/quantities/frequencies (`1-0-1`), vitals (`BP 120/80`, `SpO2`, `RBS`), lab values, ICD-10 codes, disease eponyms (`Parkinson's`, `Addison's`, `Crohn's`), clinical wards (`Ward 8`), ASHA workers, and `Dr.` spans.
- **Column & JSON Context Classification (`rakshak/columns.py`, `rakshak/pipeline.py`)**: Strict word-boundary + CamelCase column classification separating `DOCTOR`, `CLINICAL_DATE`, `AGE_SEX`, `RELATIVE_NAME`, `PATIENT_NAME`, `MRN`, `TEHSIL`, `DISTRICT`, and `SAFE` lab/billing values. Iterative JSON processing handles 1,500+ deep files (`deep_export.json`) without recursion limits and threads per-record pseudonyms cleanly into JSON lists.
- **Two-Phase Cross-Script Linking (`rakshak/linker.py`)**: Blocking on phone, MRN, and phonetic/transliterated name keys followed by compatibility-checked greedy cluster merging (checking pooled gender, age, village, phone, and disjoint hospital MRNs to avoid false merges).
- **Cryptographic Privacy Layer (`rakshak/crypto.py`, `rakshak/privacy.py`)**: Keyed HMAC-SHA256 pseudonyms (`PSN-XXXXXX`) and per-patient secret date shifts (±180 days, non-zero, preserving exact ISO timezones and inter-event intervals/LOS). Top-codes extreme ages as `85+` and keeps 5-year age bands (`45-49`), District, and 3-digit PIN prefixes.
- **FHIR R4 Bundle Handler (`rakshak/fhir_handler.py`)**: Sanitizes `Patient`, `RelatedPerson`, `Encounter`, `Condition`, `Observation`, `MedicationRequest`, `DiagnosticReport`, `Procedure`, `Composition`, and `DocumentReference` resources (including XHTML `text.div`, extensions, and base64 attachments) while keeping R4 date/dateTime syntax and Bundle references valid.
- **Filename Sanitizer (`rakshak/filename_sanitizer.py`)**: Cached multi-token-before-single-token longest-first deterministic sanitizer stripping phones, MRNs, and known person names without touching institutional prefixes (`sanjeevani`, `arogya`), mapping renames via `input_sha256` in `report.json`.

## Measured Results (Practice Data)

- **Runtime & Memory**: **7.7 s** wall time, **30.7 MB** peak RSS (std-lib Python only)
- **Privacy**: **0** real PII leaks (`0.0%` content, `0.0%` base64, `0.0%` metadata, `0.0%` Devanagari, `0.0%` Hinglish), **0 / 4** canaries, **0** raw unsupported copies
- **Clinical Utility**: **4,497 / 4,497 (100.0%)** preserved medical values on `check_dev.py` (**4,855 / 4,855** with raw hash mapping)
- **Identity Resolution**: **1.00** precision, **0.98** F0.5 (**0** wrong merges) on `check_dev.py`; **1.000** precision / **0.969** recall / **0.994** F0.5 (`776 / 776` = 100.0% pseudonym consistency) with raw hash mapping
- **Contract & Determinism**: `CONTRACT OK`, `READY TO SUBMIT` (identical outputs for identical secret; unlinkable pseudonyms and shifts across secrets)

## Security Design

- `RAKSHA_SECRET` is read only from `os.environ` in `rakshak/crypto.py` and never written to disk, logs, `report.json`, or stdout.
- All processing happens in-memory with zero temporary files written to `TMPDIR` or `HOME`.
- Unsupported/corrupt/truncated inputs (`.pdf`, `.jpg`, `.xml`, empty CSV, truncated JSON) are quarantined cleanly (`report.json` tracks every `input_sha256`).
- Output pseudonym consistency is verified at export time so `records.jsonl` never emits ungrounded claims.

## Known Limitations

- Binary attachments (`.pdf`, `.jpg`) are quarantined without OCR so raw images are never leaked.
- Unseen hospital MRN formats without standard labels or prefixes rely on contextual name/phone extraction.
- High-risk rare-diagnosis / elderly records share 5-year/`85+` bands and district labels; while `85+` pools extreme ages, cohort-wide k-anonymity suppression of districts is disabled by default to avoid breaking district-level clinical probes.

## Usage

```bash
pip install -r requirements.txt
RAKSHA_SECRET=practice python -m rakshak --input path/to/input --output path/to/output
python validate_output.py --input path/to/input --output path/to/output
python check_dev.py --output path/to/output --show 10
```
