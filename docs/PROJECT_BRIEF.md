# Team RAKSHAK (`team-rakshak`): Multilingual Indian Hospital Records Privacy Firewall

**Track 3 · Secret Wards** · **Tech Stack**: Python 3.10+ (stdlib only, 0 external models) · **Repo**: https://github.com/Roushan-Gupta1889/rakshak-secret-wards

## 1. Team & Pitch

**Pitch**: RAKSHAK is a deterministic, fully offline, CPU-only privacy firewall that eliminates PII leaks (**0 real leaks**, **0/4 canaries**) and preserves **100.0%** of clinical utility (**4,855 / 4,855** probes) across English, Devanagari, and Hinglish hospital exports in **7.7 seconds** and **30.7 MB** RAM.

## 2. Architecture

```
Input Files (CSV / TSV / JSON / FHIR R4 / TXT)
   │
   ▼  Pass 1 — Global Name & Context Assembly (multi-encoding + iterative deep JSON + b64 decode)
   │           Exclude Doctor (Dr.) spans & institutional words; compile O(N) sorted gazetteer
   ▼  Pass 2 — Cluster-Safe Two-Phase Patient Linking (Akshara Deva→Latin + Indic phonetics)
   │           Phase 1: Strong IDs (Phone/Aadhaar/ABHA/PAN/MRN) → Phase 2: Name+corroborator
   │           Cluster compatibility guards prevent transitive merges → HMAC-SHA256 PSN-XXXXXX
   ▼  Pass 3 — Context-Aware Sanitization & Fail-Safe Export
   │           Hard-PII bypass (MRN/Phone/Aadhaar) + medical/Dr. protection + per-patient date shift
   │           Age bands (5-yr & 85+) + 3-digit PIN + Tehsil/village removal + FHIR R4 + filename scrub
   ▼
Output: sanitized/ (mirrored tree) + report.json (SHA-256 map) + records.jsonl (verified PSN links)
```

## 3. How Each Part Works

- **Ingestion**: Decodes UTF-8, UTF-8-BOM, UTF-16, and CP1252 in-memory. Uses an iterative JSON walker and wrapper-unwrapper so **1,500-deep nested JSON** (`deep_export.json`) processes safely. Mislabeled CSVs and undecodable/unsupported formats (`.pdf`, `.jpg`, `.xml`, empty/truncated files) are quarantined cleanly (`5 / 200`).
- **Multilingual Detection**: Combines regex detectors for Indian IDs (Aadhaar, masked Aadhaar, ABHA, PAN, +91/Devanagari phones `०–९`, insurance, 11 hospital MRN prefixes) with structured Hindi labels (`मरीज़ का नाम:`, `नाम:`, `पिता/पति का नाम:`), Devanagari vowel-matra/nukta token boundaries, case-sensitive contextual traps (`C/O` care-of vs `C/O cough`, `K/C/O`, `attended/witnessed by`), and a cached longest-first lexicographically ordered gazetteer.
- **Linkage & HMAC Pseudonyms**: Uses akshara-aware Devanagari-to-Latin transliteration and Indic phonetic folding (`chaudhary`/`choudhary`, `pandey`/`पांडे`, `tiwari`/`तिवारी`) with blocking over phone, MRN, and phonetic name keys. Two-phase greedy merging links exact IDs (+50..+65) first, then soft evidence (`threshold=36.0`) only when pooled cluster gender, age (`±5 yrs`), village, phone, and hospital MRNs agree. Keyed `HMAC-SHA256(RAKSHA_SECRET, patient_key)` produces irreversible `PSN-XXXXXX` tokens.
- **Privacy Layer**: Shifts every patient date (including ISO `effectiveDateTime`, CSV clinical dates, and month-name visit dates) by a non-zero per-patient `HMAC` offset (`±180` days), preserving exact lengths of stay. Ages use 5-year bands and `85+` top-coding; PINs keep 3-digit prefixes (`226***`); street addresses, villages, and Tehsils are scrubbed while retaining `District` utility.
- **FHIR & Hidden Channels**: Recursively cleans FHIR R4 `text.div` XHTML, `Patient`/`RelatedPerson`/`Composition`/`DocumentReference`, extensions, and base64 payloads via the full `TextSanitizer`; protects `Practitioner`/`Organization` names and maintains valid R4 references and ISO dates. Sanitizes filenames, CSV headers, JSON keys (with collision disambiguation), and `source_path` digit suffixes.

## 4. Key Unfair Advantages (USP)

1. **Zero-Conflict Doctor & Trap Disambiguation**: Word-boundary + CamelCase schema matching (`columns.py`) separates `doctor`, `history`, `collected_on`, `PlateletVal`, and `panels.name` from patient/relative PII; `find_doctor_spans()` protects every token of multi-word `Dr. X Y` names even when a patient shares the same surname.
2. **Cluster-Safe Two-Phase Cross-Script Linkage**: Detecting multi-patient index dictionaries (`patient_index.json`), excluding relative/hospital/header tokens, and checking cluster compatibility during greedy merging achieves **0 wrong merges** (`precision 1.000`, `F0.5 0.994`).
3. **Full Cross-Channel Scrubbing at 7.7s / 31 MB**: Decodes nested JSON base64 payloads (stopping witness canaries like `Tsering Wangmo` with 0 leaks) using pre-compiled regex/memoization — deterministic to the byte (`PYTHONHASHSEED`-invariant).

## 5. Privacy–Utility Trade-off & Generalisation (Measured)

| Metric | Raw `check_dev.py` | Proper Linux Hash Map |
|---|---:|---:|
| Personal data leaked — overall / content | 1.1%* / **0.0%** | **0** / **0.0%** |
| Base64 / Metadata / Key / Header / Deva / Hinglish leaks | **0.0%** across all | **0.0%** across all |
| Planted canaries / Raw broken copies | **0 / 4** / **0** | **0 / 4** / **0** |
| Clinical & medical values preserved | **4,497 / 4,497 (100.0%)** | **4,855 / 4,855 (100.0%)** |
| Patient linking precision / recall / F0.5 (wrong merges) | **1.00 / 0.89 / 0.98 (0)** | **1.000 / 0.969 / 0.994 (0)** |
| Pseudonym consistency (`records.jsonl` ↔ output) | — | **776 / 776 (100.0%)** |
| Wall time / Peak RSS memory | **7.7 s / 30.7 MB** | **7.7 s / 30.7 MB** |

*\*Note: Windows Git CRLF checkout on `.txt`/`.json` alters input SHA-256 relative to Linux `truth.json`, causing `check_dev.py`'s SHA-256 rename map to fall back to unsanitized input paths on Windows; real filename + content leakage under matching bytes is **0**.*

- **Re-identification & Unseen Generalisation**: Across the sanitized corpus (`49` single-patient profiles), `23/49` remain unique on `(age_band, district)` and `49/49` on `(age_band, district, month, diagnosis)` (`85+` top-coding and Tehsil redaction reduce extreme-age/sub-district linkage without losing any of the 93 `district` clinical probes). On an unseen synthetic stress suite (CamelCase renamed columns `MemberFullName`, `PlateletVal`, `92 वर्ष`, Devanagari phone `मो: ९८२२०११२२३`, `C/O cough`, `Parkinsonism`, `attended by Rohan Deshmukh`, base64 witness `Ananya Gokhale`), **6 / 6 assertions passed** with zero code tuning.

## 6. Security Design

- `RAKSHA_SECRET` exists strictly in process environment memory and is never persisted, logged, or included in `report.json` / stdout (verified by `check_submission.py`).
- Zero temporary files created during execution; all decoding/sanitization stays in RAM.
- Unsupported/broken formats are quarantined (`files_quarantined: 5`), and output pseudonym consistency is enforced on every emitted record.

## 7. Known Limitations

- Scanned images (`.jpg`) and binary PDFs are quarantined rather than OCR'd, trading ingestion of scanned media for zero leak risk.
- Unprecedented non-standard hospital MRN formats outside labelled fields or known prefixes rely on phone/name co-occurrence.
- Rare-condition records keep their 5-year/`85+` band and district; stricter k-anonymity suppression (`min_group_size: 5` on `(age_band, district)`) is configurable if district-level research probes are not required.
