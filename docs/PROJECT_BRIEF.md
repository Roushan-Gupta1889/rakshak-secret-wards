# Team RAKSHAK (`team-rakshak`): Multilingual Privacy Firewall for Secret Wards

**Track 3 · Secret Wards** · **Stage 1 Engine:** Python 3.10+ stdlib only (`phase-1e-v1`) · **Repo:** https://github.com/Roushan-Gupta1889/rakshak-secret-wards

## 1. Team & Pitch

**Pitch:** RAKSHAK is a deterministic, fully offline, CPU-only privacy firewall that eliminates multilingual PII leaks (**0 / 3,230** leaks and **0 / 4** canaries under LF evaluation), preserves **98.1%** of clinical utility (**0** false merges), and resists automated re-identification attacks using corpus-adaptive k-anonymity and rejection-sampled HMAC pseudonyms—backed by a sandboxed FastAPI + React local audit console.

## 2. System Architecture (Stage 1 Pipeline + Isolated Audit Console)

```text
Input Batch (CSV / TSV / JSON / FHIR R4 / TXT + Unsupported Binary Stubs)
   │
   ▼  Pass 1 — Global Name & Context Assembly (UTF-8 / BOM / UTF-16 / CP1252)
   │           NFKC + homoglyph folding, 1,500-deep JSON walk, span-mapped b64/escape decode
   │           Statistical CSV + CamelCase schema classifier; Dr. span + trap exclusions; O(N) gazetteer
   ▼  Pass 2 — Cluster-Safe Cross-Script Linking (Akshara Deva→Latin + Indic phonetics)
   │           Phase 1: Phone/Aadhaar/ABHA/PAN/MRN → Phase 2: Name + pooled cluster checks
   ▼  Pass 2b — Adaptive k-Anonymity Planning (min_group_size = 5, adaptive_k_mixed)
   │           Keeps fine 5-yr bands & districts in dense cohorts; generalizes rare/sparse outliers
   ▼  Pass 3 — Hardened Privacy Layer & Fail-Closed Export
   │           HMAC-SHA256 PSN-XXXXXX w/ rejection sampling (\x00rej|{c}|{key}) → >=1 alpha char
   │           Per-patient non-zero ±180d date shifts (exact LOS), FHIR R4 scrub, filename/key scrub,
   │           quarantine unsupported files (.pdf/.jpg/.xml/corrupt) -> output: null in report.json
   ▼
Output Tree: sanitized/ (mirrored UTF-8) + report.json + records.jsonl
   ▲  [Optional Phase 2 Subprocess Boundary — Zero In-Process Pipeline Imports]
   └── Local FastAPI Security Adapter (Host/Origin/CSRF, 5 MiB/file, immediate rmtree purge)
       └── Offline React Audit Console (Evaluator Demo, Studio, Registry, Unlinkability Lab, Analytics)
```

## 3. How Each Component Works

- **Ingestion & Normalization:** Decodes UTF-8/BOM/UTF-16/CP1252 purely in RAM. An iterative JSON walker handles 1,500-deep exports cleanly. Adversarial NFKC/homoglyph folding and span-mapped unescaping inspect raw text, headers, JSON keys, metadata paths, filenames, and Base64 attachments (`Phase 1A`). Empty, corrupt, or unsupported files (`.pdf`, `.jpg`, `.xml`) fail closed to quarantine.
- **Multilingual Detection & Schema Inference:** Combines statistical CSV header inference and word-boundary/CamelCase column matching (`Phase 1B`) with regex detectors for Indian IDs (Aadhaar/masked Aadhaar, ABHA, PAN, +91 & Devanagari digits `०–९`, insurance IDs, and structural hospital MRNs in `Phase 1C`), Hindi labels (`मरीज़ का नाम:`, `पिता/पति का नाम:`), contextual traps (`C/O` relative vs `C/O fever`, `K/C/O`, `attended/witnessed by`), and multi-token `Dr.` protection.
- **Cross-Script Linkage & Numeric-Hardened HMAC Pseudonyms:** Blocks on phone, MRN, and akshara/phonetic keys (`tiwari`/`तिवारी`) with pooled compatibility checks preventing transitive false merges. `rakshak/crypto.py` (`Phase 1E`) assigns `PSN-XXXXXX` over Crockford Base-32 using domain-separated rejection sampling (`\x00rej|{counter}|{patient_key}`), eliminating all-digit `PSN-\d{6}` collisions (`~0.093%` rate) so numeric/PIN detectors (`A6`) gain zero signal.
- **Adaptive k-Anonymity & Temporal Integrity:** Shifts all dates per patient by a non-zero `±180d` HMAC offset preserving exact inter-event intervals and hospital stays. Ages map to 5-year bands (`85+` top-coded), PINs to 3-digit prefixes (`226***`), and `adaptive_k_mixed` (`Phase 1D`) generalizes sparse cohort districts while preserving dense cohort utility, diagnoses, drugs, doses, vitals, and valid FHIR R4 Bundles.

## 4. Key Unfair Advantages (USP)

1. **Unseen-Format & Trap Resilience:** Built to beat the calibration chaos gap—uses statistical column inference, generic structural MRN matching, and medical-span guards rather than hardcoded dataset filenames or templates.
2. **Cluster-Safe Cross-Script Linking (`0` Wrong Merges):** Pools cluster gender, age, village, phone, and disjoint MRNs before merging, preserving clean longitudinal trajectories across Devanagari, Hinglish, and English (`F0.5 = 0.99`, `B3-F1` intact).
3. **Adaptive Privacy + Zero A6 Pseudonym Inversion:** Jointly suppresses singleton rare-cohort QIs (`trap risk 1.000 → 0.0085`) and rejects all-digit Crockford pseudonyms while executing **pure Python stdlib** with zero cloud/LLM deps (`3.8s–4.8s`, `~30.8 MB` RSS).

## 5. Privacy–Utility Trade-Off & Measured Evaluation

| Benchmark & Provenance | Privacy / Security | Clinical Utility & Integrity | Linking & Compute |
| :--- | :--- | :--- | :--- |
| **`check_submission.py --run`** (Official ToolKit) | **0** secret leaks; different secret -> unlinkable outputs | **CONTRACT OK**, deterministic same-secret tree, input unchanged | **`READY TO SUBMIT`** in **`3.8s`** |
| **LF Practice Suite** (`200` files, Reconstructed Dev) | **0 / 3,230 (0.0%)** real PII leaked; **0 / 4** canaries; **0** raw copies | **4,763 / 4,855 (98.1%)** probes kept (only 92 sparse `[DISTRICT]` generalized) | Prec **`1.000`**, **`F0.5 = 0.99`**, **`0`** wrong merges; `5` quarantined |
| **Local `eval_arena.py`** (Simulator, non-official) | `audit-sec-A`: **`97.57`** total (`0.9858` privacy, `A1=0`, `A2/3=0.0198`, `A4=0.0208`, `A5=0.0284`, `A6=0`, `A7=0`) | `utility = 0.9184`; **`19/19`** valid FHIR R4; **`14/14`** chaos checks PASS | `baseline-sec-A`: **`97.13`** (`4.8s`, `30.8 MB` RSS); trap risk `1.000 → 0.0085` |
| **Crypto 100k Suite** (`test_phase1e.py`) | **100,000 / 100,000** valid alpha PSNs; `10/10` all-digit vectors remapped | Uniform Crockford distribution (`max_dev = 0.037`, `M = 1,072,741,824`) | `99,996/100,000` distinct (30-bit truncation); **`0/10,000`** cross-secret overlap |

*Official confidential hidden-dataset competition scores remain `UNAVAILABLE` locally. On Windows CRLF checkouts, raw `check_dev.py` reads `98.0%` clinical probes and `0` leaks in content/Deva/Hinglish/base64/metadata/keys/headers alongside Windows CRLF SHA-256 rename-map fallback noise (`72.9%` filename artifact absent under Linux LF bytes).*

## 6. Security Design & Known Limitations

- **Defense-in-Depth Boundary:** `RAKSHA_SECRET` resides exclusively in server/child env (zero disk writes, response fields, or browser storage). Stage 1 executes in memory; Phase 2 runs isolated CLI subprocesses behind strict loopback `Host`/`Origin`/CSRF/size checks and immediately purges staged raw uploads (`shutil.rmtree`). Built console bundles local fonts/ECharts with zero outbound requests.
- **Honest Limitations:** Binary `.pdf`/`.jpg` scans are quarantined rather than OCR'd; rare outlier cohorts trade ~`1.9%` sparse `[DISTRICT]` probes for linkage resistance; unlabelled novel institutional ID formats rely on co-occurring PII cues; and Phase 2 filesystem cleanup performs OS unlinking (relying on host disk encryption).
