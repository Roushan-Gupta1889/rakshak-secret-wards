import type { NavPageId } from "@/stores/uiStore";

export type EvidenceNature = "LIVE_DEMO" | "LIVE_LAB" | "FROZEN_BENCHMARK" | "UNAVAILABLE_BOUNDARY";

export interface EvaluatorWalkthroughStep {
  stepNumber: number;
  id: string;
  title: string;
  targetPage: NavPageId;
  targetPageLabel: string;
  evidenceNature: EvidenceNature;
  evaluatorAction: string;
  whatToObserve: string;
  provenanceDisclosure: string;
}

export interface SubmissionReadinessItem {
  category: string;
  provenance: "FROZEN" | "LIVE" | "UNAVAILABLE";
  summary: string;
  sourceRef: string;
}

export const EVALUATOR_WALKTHROUGH_STEPS: EvaluatorWalkthroughStep[] = [
  {
    stepNumber: 1,
    id: "step-intro",
    title: "Introduce RAKSHAK & System Boundaries",
    targetPage: "overview",
    targetPageLabel: "Overview",
    evidenceNature: "LIVE_DEMO",
    evaluatorAction:
      "Inspect /api/health engine metadata (phase-1e-v1, offline_mode: true, stdlib_stage1: true) on Overview or this Evaluator Demo Hub.",
    whatToObserve:
      "Confirmation that the local FastAPI adapter runs loopback-only without external cloud dependencies and tracks active/retained runs cleanly.",
    provenanceDisclosure: "LIVE telemetry from GET /api/health paired with FROZEN Phase 1E historical baselines.",
  },
  {
    stepNumber: 2,
    id: "step-upload",
    title: "Load Synthetic Multilingual Hospital Batch",
    targetPage: "demo",
    targetPageLabel: "Evaluator Demo",
    evidenceNature: "LIVE_DEMO",
    evaluatorAction:
      "Review the 6-file synthetic batch below (English CSV, Hindi Devanagari TSV, OPD JSON, Discharge TXT, FHIR R4 Bundle, unsupported PDF stub).",
    whatToObserve:
      "Phase 2A client pre-validation classifies 5 files as Process and 1 binary .pdf as Quarantine Test under 5 MiB/file and 25 MiB/batch bounds.",
    provenanceDisclosure: "100% synthetic non-sensitive hospital records created solely for live demonstration.",
  },
  {
    stepNumber: 3,
    id: "step-execute",
    title: "Execute Real Offline Stage 1 Pipeline",
    targetPage: "demo",
    targetPageLabel: "Evaluator Demo",
    evidenceNature: "LIVE_DEMO",
    evaluatorAction:
      "Click 'Run Synthetic Demo Pipeline' below to acquire a CSRF token and submit via POST /api/runs.",
    whatToObserve:
      "Real child subprocess execution (python -m rakshak) completing without mocks, populating shared session telemetry and a 16-hex run_id.",
    provenanceDisclosure: "LIVE subprocess execution via untouched Phase 2A adapter and frozen Phase 1E engine.",
  },
  {
    stepNumber: 4,
    id: "step-sanitized-output",
    title: "Inspect Sanitized Outputs & Fail-Closed Quarantine",
    targetPage: "studio",
    targetPageLabel: "Sanitization Studio",
    evidenceNature: "LIVE_DEMO",
    evaluatorAction:
      "Open Sanitization Studio to inspect file-by-file status, FHIR validation summary, placeholder counts, and downloadable ZIP bundle.",
    whatToObserve:
      "5 sanitized files in sanitized/, 1 quarantined .pdf (output: null), valid FHIR R4 Bundle count, and zero leaked phone/patient names.",
    provenanceDisclosure: "LIVE outputs from report.json, records.jsonl, and Phase 2A post-sanitization analyzer.",
  },
  {
    stepNumber: 5,
    id: "step-registry",
    title: "Explore Sanitized Medical Registry & Cross-Script Linking",
    targetPage: "registry",
    targetPageLabel: "Medical Registry",
    evidenceNature: "LIVE_DEMO",
    evaluatorAction:
      "Open Medical Registry and filter or inspect linked records across syn_ward_reg_en.csv, syn_hindi_reg.tsv, syn_opd_visits.json, and syn_fhir_bundle.json.",
    whatToObserve:
      "Same patient across English CSV, Hindi Devanagari TSV, JSON, and FHIR R4 shares one PSN-XXXXXX; doctors, diagnoses, medicines, vitals, and stay intervals survive intact.",
    provenanceDisclosure: "DERIVED strictly from exported sanitized/ files and records.jsonl; raw PII is never held in browser state.",
  },
  {
    stepNumber: 6,
    id: "step-unlinkability",
    title: "Verify Determinism & Cross-Secret Empirical Unlinkability",
    targetPage: "unlinkability",
    targetPageLabel: "Unlinkability Lab",
    evidenceNature: "LIVE_LAB",
    evaluatorAction:
      "Navigate to Unlinkability Lab and click 'Run Cryptographic Verification' to trigger paired configured and CSPRNG ephemeral CLI runs.",
    whatToObserve:
      "Identical PSNs across repeat configured runs (determinism) and 0 overlapping PSNs across independent secrets (empirical unlinkability), followed by automatic workspace cleanup.",
    provenanceDisclosure: "LIVE multi-run Stage 1 verification; Scenario A requires server RAKSHA_SECRET (shows BLOCKED if unset).",
  },
  {
    stepNumber: 7,
    id: "step-format-collisions",
    title: "Inspect Crockford Format Rules & Finite Collision Bounds",
    targetPage: "unlinkability",
    targetPageLabel: "Unlinkability Lab",
    evidenceNature: "FROZEN_BENCHMARK",
    evaluatorAction:
      "Test vector PSN-975397 in the Interactive Format Validator (Scenario C) and inspect the Birthday-Paradox Collision chart (Scenario D).",
    whatToObserve:
      "All-digit Phase 1D vector PSN-975397 is rejected (ALL_DIGIT_NUMERIC_COLLISION); Phase 1E guarantees >=1 alpha char over 1,072,741,824 valid codes with expected 30-bit birthday collisions documented honestly.",
    provenanceDisclosure: "LIVE batch format check + DERIVED birthday curve + FROZEN 100k key benchmark (99,996/100,000 distinct).",
  },
  {
    stepNumber: 8,
    id: "step-risk-analytics",
    title: "Examine Risk Analytics & Adaptive k-Anonymity",
    targetPage: "privacy",
    targetPageLabel: "Risk Analytics",
    evidenceNature: "UNAVAILABLE_BOUNDARY",
    evaluatorAction:
      "Open Risk Analytics to inspect release equivalence-class sizes (k_release), small/rare cohort diagnostics, ATTACKS.md matrix, and ablation frontier.",
    whatToObserve:
      "Dense 45-49 Lucknow cohort meets k>=5 while sparse/94M Rabies outlier triggers QI generalization; A2-A5 adversarial oracle & raw probe recall on live batches are explicitly badged UNAVAILABLE.",
    provenanceDisclosure: "DERIVED in-corpus cohort analysis + FROZEN Phase 1E simulator benchmarks + explicit UNAVAILABLE oracle boundary.",
  },
  {
    stepNumber: 9,
    id: "step-policy-arch",
    title: "Audit Enforced Policies & 4-Pass Stage 1 Pipeline",
    targetPage: "policies",
    targetPageLabel: "Policies & Architecture",
    evidenceNature: "FROZEN_BENCHMARK",
    evaluatorAction:
      "Inspect Policies & Architecture to trace config/policy.yaml values, read-only mutability, 3-tier isolation, and Pass 1 -> Pass 2 -> Pass 2b -> Pass 3 order.",
    whatToObserve:
      "Live SHA-256 policy snapshot vs declarative YAML flags enforced statically in code, plus confirmation that frontend implements zero cryptography.",
    provenanceDisclosure: "LIVE /api/policy snapshot + source-traced Stage 1 & Phase 2A verification.",
  },
  {
    stepNumber: 10,
    id: "step-readiness",
    title: "Review Security Guarantees, Limitations & Submission Readiness",
    targetPage: "demo",
    targetPageLabel: "Evaluator Demo",
    evidenceNature: "FROZEN_BENCHMARK",
    evaluatorAction:
      "Review the Submission Readiness Summary below separating official toolkit check_submission.py results from supplementary local simulator numbers.",
    whatToObserve:
      "check_submission.py --run confirms READY TO SUBMIT (CONTRACT OK), while confidential competition leaderboard scores are strictly UNAVAILABLE / unpublished.",
    provenanceDisclosure: "Distinguishes official toolkit checks, local simulator scores, and unpublished competition grading.",
  },
];

export const SUBMISSION_READINESS_ITEMS: SubmissionReadinessItem[] = [
  {
    category: "Challenge Objective & Core Spec",
    provenance: "FROZEN",
    summary:
      "Track 3 'Secret Wards': offline, CPU-only, LLM-free privacy firewall removing multilingual PII (EN/HI/Hinglish) across CSV/TSV/JSON/FHIR/TXT while preserving clinical signal & longitudinal patient linkage.",
    sourceRef: "Secret-Wards-ToolKit/docs/PROBLEM_STATEMENT.md · SPEC.md",
  },
  {
    category: "Actual 4-Pass Stage 1 Pipeline",
    provenance: "FROZEN",
    summary:
      "Pass 1 builds global non-doctor name gazetteer; Pass 2 runs two-phase cross-script record linking; Pass 2b computes corpus adaptive k-anonymity plans; Pass 3 quarantines unsupported inputs, computes keyed HMAC pseudonyms & date shifts, masks PII, and exports sanitized/, records.jsonl, and report.json.",
    sourceRef: "rakshak/pipeline.py:271-415 · linker.py · k_anonymity.py",
  },
  {
    category: "Pseudonymization & Date Shifting",
    provenance: "FROZEN",
    summary:
      "pseudonym(patient_key) uses HMAC-SHA256(RAKSHA_SECRET, ...) over Crockford Base-32 with domain-separated rejection sampling (\\x00rej|{c}|{key}) eliminating all-digit PSN-\\d{6}; per-patient ±180d non-zero HMAC date shifts preserve hospital lengths of stay.",
    sourceRef: "rakshak/crypto.py:14-43 · phase-1e-technical-report.md",
  },
  {
    category: "Adaptive k-Anonymity vs Utility",
    provenance: "FROZEN",
    summary:
      "policy.yaml min_group_size=5 under adaptive_k_mixed protects dense cohorts' fine QIs while generalizing/suppressing QIs for sparse, extreme-age >=80, or rare-condition clusters without dropping clinical diagnoses, medications, doses, labs, or vitals.",
    sourceRef: "config/policy.yaml · rakshak/k_anonymity.py:393-411",
  },
  {
    category: "Offline CPU-Only Execution",
    provenance: "FROZEN",
    summary:
      "Root requirements.txt requires zero third-party packages (Python stdlib only); console bundles Inter, JetBrains Mono & ECharts locally with zero external network calls and docs_url=None.",
    sourceRef: "requirements.txt · raksha.toml · apps/api/rakshak_api/main.py:59-64",
  },
  {
    category: "Security & Trust Boundaries",
    provenance: "FROZEN",
    summary:
      "Three-tier separation keeps RAKSHA_SECRET strictly in server/child env; Host/Origin/CSRF/path-depth/streaming-size checks enforce local isolation; zero browser cryptography or localStorage use; raw inputs logically unlinked via shutil.rmtree().",
    sourceRef: "apps/api/rakshak_api/security.py · runner.py",
  },
  {
    category: "Official Toolkit Checker (Verified)",
    provenance: "FROZEN",
    summary:
      "python check_submission.py --repo secret-wards --run -> READY TO SUBMIT (CONTRACT OK, deterministic same-secret trees, distinct cross-secret outputs, zero RAKSHA_SECRET leaks, 3.2s runtime, PROJECT_BRIEF.pdf & README.md valid).",
    sourceRef: "Secret-Wards-ToolKit/check_submission.py",
  },
  {
    category: "Supplementary Local Evaluator Benchmarks",
    provenance: "FROZEN",
    summary:
      "Reconstructed dev check (200 files): 0/3,230 leaked, 4,763/4,855 clinical probes (0.9932; only 92 sparse [DISTRICT] generalizations), linking F0.5=0.994 (0 wrong merges). Local arena eval_arena.py: 97.57 (audit-sec-A) / 97.13 (baseline-sec-A), A6=0.0, trap risk 1.000 -> 0.0085. Not an official competition score.",
    sourceRef: "frozenBenchmarks.ts · audit_1d_report_data.json · test_phase1e.py",
  },
  {
    category: "Official Hidden-Dataset Competition Score",
    provenance: "UNAVAILABLE",
    summary:
      "Not yet published / cannot be computed locally. Organizer scoring runs confidentially on hidden test seeds with held-out registry & known_facts.",
    sourceRef: "Secret-Wards-ToolKit/docs/SCORING.md · ATTACKS.md",
  },
];
