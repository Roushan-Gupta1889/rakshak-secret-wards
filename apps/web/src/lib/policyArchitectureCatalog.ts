import type { HealthResponse, PolicyResponse } from "@/api/schemas";
import { BACKEND_CONTRACT } from "@/config/backendContract";

export type PolicyEnforcementMode =
  | "ENFORCED_FROM_YAML"
  | "YAML_WITH_CODE_OVERRIDE"
  | "DECLARATIVE_FIXED_IN_CODE"
  | "FIXED_ADAPTER_CONSTANT"
  | "UNAVAILABLE_FROM_API";

export type PolicyDomainCategory =
  | "Policy YAML"
  | "Cohort & Privacy"
  | "Crypto & Identity"
  | "Formats & Quarantine"
  | "API & Security";

export interface PolicyInventoryRow {
  key: string;
  domain: PolicyDomainCategory;
  actualValue: string;
  provenance: "LIVE" | "FROZEN" | "UNAVAILABLE";
  statusLabel: string;
  enforcementMode: PolicyEnforcementMode;
  explanation: string;
  sourceLocation: string;
  configurability: string;
}

export interface PipelinePassSpec {
  passId: string;
  orderNumber: number;
  title: string;
  moduleRef: string;
  summary: string;
  details: string[];
  cryptoHooks: string[];
}

export interface TrustTierSpec {
  tierId: "browser" | "adapter" | "cli";
  name: string;
  runtime: string;
  privilege: string;
  owns: string[];
  explicitlyExcluded: string[];
}

export type SecurityClassification =
  | "VERIFIED_BEHAVIOR"
  | "CONFIG_CHOICE"
  | "DESIGN_ASSUMPTION"
  | "KNOWN_LIMITATION";

export interface SecurityBoundaryItem {
  id: string;
  classification: SecurityClassification;
  title: string;
  provenance: "LIVE" | "FROZEN";
  detail: string;
  sourceRef: string;
}

export interface FormatSupportRow {
  extensionOrFormat: string;
  stage1Handling: string;
  phase2aUploadStatus: "Process (.sanitized)" | "Quarantine Test (Accepted)" | "Rejected (HTTP 415)";
  notes: string;
  sourceRef: string;
}

interface YamlPolicyMeta {
  domain: PolicyDomainCategory;
  fallbackDefault: string;
  enforcementMode: PolicyEnforcementMode;
  statusLabel: string;
  explanation: string;
  sourceLocation: string;
  configurability: string;
}

const YAML_POLICY_METADATA: Record<string, YamlPolicyMeta> = {
  min_group_size: {
    domain: "Cohort & Privacy",
    fallbackDefault: "5",
    enforcementMode: "ENFORCED_FROM_YAML",
    statusLabel: "CONFIGURED (YAML) · ENFORCED",
    explanation:
      "Minimum equivalence-class size k evaluated over corpus clusters (district, 3-digit PIN, gender, age_band). Triggers coarsening when cell count < k.",
    sourceLocation: "rakshak/pipeline.py:218 · rakshak/k_anonymity.py:153,395-410",
    configurability: "YAML edit (config/policy.yaml) · Read-only via API",
  },
  privacy_mode: {
    domain: "Cohort & Privacy",
    fallbackDefault: "adaptive_k_mixed",
    enforcementMode: "YAML_WITH_CODE_OVERRIDE",
    statusLabel: "CONFIGURED (YAML) · OVERRIDABLE INTERNALLY",
    explanation:
      "Selects corpus QI widening ladder. adaptive_k_mixed preserves QIs for dense clusters while widening/suppressing sparse, rare-condition, or age >= 80 clusters.",
    sourceLocation: "rakshak/k_anonymity.py:155,393-411 · rakshak/pipeline.py:322",
    configurability: "YAML / internal CLI env (RAKSHA_PRIVACY_MODE) · Read-only via API",
  },
  age_band_years: {
    domain: "Cohort & Privacy",
    fallbackDefault: "5",
    enforcementMode: "YAML_WITH_CODE_OVERRIDE",
    statusLabel: "BASELINE (YAML) · ADAPTIVELY WIDENED",
    explanation:
      "Sets initial age-band width (e.g. 45-49) and 85+ top-coding; adaptive_k_mixed automatically widens sparse clusters to 10/20-yr bands or [AGE] suppression.",
    sourceLocation: "rakshak/pipeline.py:216 · rakshak/k_anonymity.py:154,395-410 · rakshak/crypto.py:46-51",
    configurability: "YAML baseline · Read-only via API",
  },
  date_shift_max_days: {
    domain: "Cohort & Privacy",
    fallbackDefault: "180",
    enforcementMode: "YAML_WITH_CODE_OVERRIDE",
    statusLabel: "CONFIGURED (CSV/JSON) · FIXED ±180d (TXT/FHIR)",
    explanation:
      "HMAC-seeded non-zero per-patient day offset in [-max, +max] preserving hospital lengths of stay. CSV/JSON cells use policy value; TXT and FHIR paths use crypto default 180.",
    sourceLocation: "rakshak/pipeline.py:217,1423 · rakshak/privacy.py:83-103 · rakshak/crypto.py:34-43",
    configurability: "YAML (structured cells) · Read-only via API",
  },
  pin_generalize: {
    domain: "Policy YAML",
    fallbackDefault: "prefix3",
    enforcementMode: "DECLARATIVE_FIXED_IN_CODE",
    statusLabel: "DECLARED IN YAML · HARDCODED IN ENGINE",
    explanation:
      "Stage 1 keeps 3-digit PIN prefix (226***) for dense cohorts and masks to [PIN] when ClusterPrivacyPlan.mask_pin is True without reading this YAML string.",
    sourceLocation: "rakshak/privacy.py:168-173 · rakshak/pipeline.py:1441-1445 · rakshak/fhir_handler.py:214-219",
    configurability: "Fixed in Stage 1 code (declarative YAML documentation)",
  },
  village_generalize: {
    domain: "Policy YAML",
    fallbackDefault: "remove",
    enforcementMode: "DECLARATIVE_FIXED_IN_CODE",
    statusLabel: "DECLARED IN YAML · FIXED SUPPRESSION",
    explanation:
      "Stage 1 unconditionally masks village fields and village label spans to [VILLAGE]; this YAML string is not branched at runtime.",
    sourceLocation: "rakshak/pipeline.py:1446-1448 · rakshak/text_sanitizer.py:270-273",
    configurability: "Fixed in Stage 1 code",
  },
  house_generalize: {
    domain: "Policy YAML",
    fallbackDefault: "remove",
    enforcementMode: "DECLARATIVE_FIXED_IN_CODE",
    statusLabel: "DECLARED IN YAML · FIXED SUPPRESSION",
    explanation:
      "Unconditionally replaces house numbers and street lines with [HOUSE], [ADDRESS], or [REDACTED]; not branched from YAML value.",
    sourceLocation: "rakshak/text_sanitizer.py:263-267 · rakshak/privacy.py:176-178 · rakshak/fhir_handler.py:206",
    configurability: "Fixed in Stage 1 code",
  },
  locality_generalize: {
    domain: "Policy YAML",
    fallbackDefault: "remove",
    enforcementMode: "DECLARATIVE_FIXED_IN_CODE",
    statusLabel: "DECLARED IN YAML · FIXED SUPPRESSION",
    explanation:
      "Unconditionally replaces mohalla/locality/address-ward mentions with [LOCALITY]; YAML value is declarative metadata.",
    sourceLocation: "rakshak/text_sanitizer.py:256-267 · rakshak/privacy.py:181-183",
    configurability: "Fixed in Stage 1 code",
  },
  landmark_generalize: {
    domain: "Policy YAML",
    fallbackDefault: "remove",
    enforcementMode: "DECLARATIVE_FIXED_IN_CODE",
    statusLabel: "DECLARED IN YAML · FIXED SUPPRESSION",
    explanation:
      "Unconditionally replaces landmark values/phrases with [LANDMARK]; YAML value is declarative metadata.",
    sourceLocation: "rakshak/pipeline.py:1460-1462 · rakshak/text_sanitizer.py:263-267 · rakshak/privacy.py:186-188",
    configurability: "Fixed in Stage 1 code",
  },
};

export function buildPolicyInventory(
  policyResp: PolicyResponse | null,
  healthResp: HealthResponse | null,
): PolicyInventoryRow[] {
  const rows: PolicyInventoryRow[] = [];

  if (policyResp) {
    const entries = Object.entries(policyResp.policy).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of entries) {
      const meta = YAML_POLICY_METADATA[key];
      rows.push({
        key,
        domain: meta?.domain ?? "Policy YAML",
        actualValue: String(value),
        provenance: "LIVE",
        statusLabel: meta?.statusLabel ?? "LIVE IN /API/POLICY",
        enforcementMode: meta?.enforcementMode ?? "ENFORCED_FROM_YAML",
        explanation:
          meta?.explanation ?? "Loaded dynamically from config/policy.yaml by Stage 1 load_policy().",
        sourceLocation: meta?.sourceLocation ?? "rakshak/pipeline.py:44-64,1930",
        configurability: meta?.configurability ?? "YAML edit · Read-only via API",
      });
    }
  } else {
    // Offline fallback explicitly marks YAML keys UNAVAILABLE when /api/policy has not responded
    for (const [key, meta] of Object.entries(YAML_POLICY_METADATA)) {
      rows.push({
        key,
        domain: meta.domain,
        actualValue: `Unavailable (Default: ${meta.fallbackDefault})`,
        provenance: "UNAVAILABLE",
        statusLabel: "UNAVAILABLE · /API/POLICY OFFLINE",
        enforcementMode: "UNAVAILABLE_FROM_API",
        explanation: meta.explanation,
        sourceLocation: meta.sourceLocation,
        configurability: meta.configurability,
      });
    }
  }

  // Live Secret Configuration Status from /api/health
  rows.push({
    key: "secret_configured (RAKSHA_SECRET)",
    domain: "Crypto & Identity",
    actualValue: healthResp
      ? healthResp.secret_configured
        ? "Configured in server env (true)"
        : "Unset in server env (false -> CSPRNG ephemeral auto mode)"
      : "Unavailable (API offline)",
    provenance: healthResp ? "LIVE" : "UNAVAILABLE",
    statusLabel: healthResp ? "LIVE · /API/HEALTH" : "UNAVAILABLE",
    enforcementMode: healthResp ? "ENFORCED_FROM_YAML" : "UNAVAILABLE_FROM_API",
    explanation:
      "Server process holds RAKSHA_SECRET (or generates 256-bit CSPRNG secret per ephemeral run) and passes it strictly via child subprocess env. Never exposed in API or UI.",
    sourceLocation: "apps/api/rakshak_api/security.py:182-197 · apps/api/rakshak_api/runner.py:50-63 · rakshak/crypto.py:9",
    configurability: "Server OS environment variable only (immutable via UI)",
  });

  // Frozen engine & adapter runtime limits verified in Phase 1E & 2A
  rows.push(
    {
      key: "pseudonym_algorithm (PSN-XXXXXX)",
      domain: "Crypto & Identity",
      actualValue: "HMAC-SHA256 + Crockford Base-32 + rejection sampling (>=1 alpha)",
      provenance: "FROZEN",
      statusLabel: "FIXED IN CODE (PHASE 1E)",
      enforcementMode: "FIXED_ADAPTER_CONSTANT",
      explanation:
        "Hashes canonical patient_key (up to 64 attempts using \\x00rej|{counter}|{key}), rejecting all-digit PSN-\\d{6} suffixes with zero modulo bias across 1,072,741,824 valid codes.",
      sourceLocation: "rakshak/crypto.py:11-31",
      configurability: "Fixed algorithm (phase-1e-v1)",
    },
    {
      key: "identifier_detection_and_masking",
      domain: "Crypto & Identity",
      actualValue: "Multilingual NER + Devanagari/Hinglish gazetteer + Dr./medical protection",
      provenance: "FROZEN",
      statusLabel: "FIXED IN CODE (STAGE 1)",
      enforcementMode: "FIXED_ADAPTER_CONSTANT",
      explanation:
        "Combines Pass 1 global name gazetteer with regex detectors for Aadhaar/ABHA/PAN/Phone/MRN/Insurance/Email while protecting Dr. names, doses, labs, and diagnoses.",
      sourceLocation: "rakshak/detectors.py · rakshak/names.py · rakshak/medical.py · rakshak/pipeline.py:1805-1845",
      configurability: "Fixed in Stage 1 code",
    },
    {
      key: "supported_formats_and_encodings",
      domain: "Formats & Quarantine",
      actualValue: "Stage 1: .csv,.tsv,.json,.txt (UTF-8-BOM/UTF-16/UTF-8/CP1252) -> UTF-8",
      provenance: "FROZEN",
      statusLabel: "FIXED IN CODE",
      enforcementMode: "FIXED_ADAPTER_CONSTANT",
      explanation:
        "Decodes multi-encoding exports in RAM, unwraps 1,500+ level deep JSON iteratively, and writes UTF-8 outputs without BOM. API upload allowlist adds 5 quarantine preview extensions.",
      sourceLocation: "rakshak/io_utils.py:13-87 · rakshak/pipeline.py:1228-1274 · apps/api/rakshak_api/config.py:35-39",
      configurability: "Fixed in Stage 1 & Phase 2A",
    },
    {
      key: "quarantine_fail_safe_policy",
      domain: "Formats & Quarantine",
      actualValue: "Fail-closed (output: null in report.json; never copied to sanitized/)",
      provenance: "FROZEN",
      statusLabel: "FIXED FAIL-CLOSED",
      enforcementMode: "FIXED_ADAPTER_CONSTANT",
      explanation:
        "Unsupported binary extensions (.pdf/.jpg/.png/.xml), zero-byte files, undecodable bytes, malformed JSON, and recursion/CSV errors are isolated from sanitized research outputs.",
      sourceLocation: "rakshak/pipeline.py:336-376,1253-1274",
      configurability: "Fixed fail-closed invariant",
    },
    {
      key: "fhir_r4_bundle_validation",
      domain: "Formats & Quarantine",
      actualValue: "FHIR R4 preservation + Phase 2A structural validator",
      provenance: "FROZEN",
      statusLabel: "FIXED IN CODE",
      enforcementMode: "FIXED_ADAPTER_CONSTANT",
      explanation:
        "Stage 1 cleans FHIR XHTML divs, base64 attachments, extensions, and omits suppressed birthDate cleanly; Phase 2A analyzer validates Bundle entries, refs, and ISO dates post-run.",
      sourceLocation: "rakshak/fhir_handler.py:120-357 · apps/api/rakshak_api/analyzer.py:71-108",
      configurability: "Fixed structural validator",
    },
    {
      key: "upload_and_batch_limits",
      domain: "API & Security",
      actualValue: `${BACKEND_CONTRACT.maxFilesPerRun} files · 5 MiB/file · 25 MiB/batch · depth <= ${BACKEND_CONTRACT.maxPathDepth}`,
      provenance: "FROZEN",
      statusLabel: "FIXED IN PHASE 2A API",
      enforcementMode: "FIXED_ADAPTER_CONSTANT",
      explanation:
        "Enforced via Content-Length pre-check and 64 KiB chunk streaming; rejects >180 char names, absolute paths, drive prefixes, dot-segments, and non-allowlisted extensions.",
      sourceLocation: "apps/api/rakshak_api/config.py:41-44 · apps/api/rakshak_api/security.py:141-179 · runner.py:206-260",
      configurability: "Fixed Phase 2A adapter constants (not exposed in /api/policy)",
    },
    {
      key: "concurrency_ttl_and_policy_path_note",
      domain: "API & Security",
      actualValue: `max ${healthResp?.max_concurrent_runs ?? 2} concurrent · ${BACKEND_CONTRACT.subprocessTimeoutSeconds}s CLI timeout · ${BACKEND_CONTRACT.jobTtlSeconds}s TTL · 10 retained`,
      provenance: "FROZEN",
      statusLabel: "FIXED IN PHASE 2A · ENV NOTE",
      enforcementMode: "FIXED_ADAPTER_CONSTANT",
      explanation:
        "Bounded asyncio semaphore, 60s subprocess timeout, and 900s workspace reaper. Note: Stage 1 main() reads repo config/policy.yaml directly rather than RAKSHAK_POLICY env.",
      sourceLocation: "apps/api/rakshak_api/config.py:45-49 · rakshak/pipeline.py:1929-1931",
      configurability: "Fixed Phase 2A settings · Direct repo policy path",
    },
  );

  return rows;
}

/** Exact execution order verified in rakshak/pipeline.py:271-415 (differs from naive linear flows). */
export const STAGE1_PIPELINE_PASSES: PipelinePassSpec[] = [
  {
    passId: "pass-1",
    orderNumber: 1,
    title: "Pass 1: Sorted Ingestion & Global Name Gazetteer",
    moduleRef: "rakshak/pipeline.py:277-312",
    summary:
      "Walks all input paths deterministically (sorted_walk), decodes supported text formats in RAM, and builds a global patient-name gazetteer before linking or masking.",
    details: [
      "Excludes clean/ documents and Dr. clinician spans from name collection.",
      "Extracts non-institution patient tokens from filenames (Pass 1b) and structured headers.",
      "Compiles longest-first regex gazetteer (_gazetteer_rx) for consistent downstream scrubbing.",
    ],
    cryptoHooks: ["None in Pass 1 — raw bytes remain in child process RAM."],
  },
  {
    passId: "pass-2",
    orderNumber: 2,
    title: "Pass 2: Two-Phase Cross-Script Patient Linking",
    moduleRef: "rakshak/pipeline.py:315 · rakshak/linker.py",
    summary:
      "Extracts RecordEvidence across CSV/JSON/FHIR/TXT, transliterates Devanagari to Latin aksharas, links exact strong IDs first, then merges corroborated records with compatibility guards.",
    details: [
      "Isolates multi-patient index dictionaries (_is_multi_patient_index) so distinct patients are never over-merged.",
      "Outputs canonical cluster patient_key strings (e.g. PH:<phone>|N:<tokens> or MRN:<mrn>|N:<tokens>).",
    ],
    cryptoHooks: ["Prepares deterministic canonical patient_key input for keyed HMAC."],
  },
  {
    passId: "pass-2b",
    orderNumber: 3,
    title: "Pass 2b: Adaptive Corpus k-Anonymity & Rarity Planner",
    moduleRef: "rakshak/pipeline.py:318 · rakshak/k_anonymity.py",
    summary:
      "Inspects all linked clusters prior to Pass 3 export to measure cell sizes across (district, pin3, gender, age_band) and detect rare diagnoses or age >= 80.",
    details: [
      "Targets min_group_size = 5 under adaptive_k_mixed without using any external registry.",
      "Produces immutable per-cluster ClusterPrivacyPlan controlling DOB/age/PIN/district granularity.",
    ],
    cryptoHooks: ["Purely deterministic corpus statistics; zero secret dependency."],
  },
  {
    passId: "pass-3",
    orderNumber: 4,
    title: "Pass 3: Validation/Quarantine, HMAC Pseudonymization, Detection & Export",
    moduleRef: "rakshak/pipeline.py:328-414 · crypto.py · fhir_handler.py · text_sanitizer.py",
    summary:
      "Processes each sorted file: quarantines unsupported/broken inputs, computes keyed PSN-XXXXXX + date shifts on demand, performs context-safe PII masking & QI widening, and writes sanitized/, records.jsonl, and report.json.",
    details: [
      "Quarantine check runs per file (_process_file): unsupported extensions, empty files, undecodable bytes, invalid JSON, or CSV errors get output: null.",
      "Masking preserves doctors, dosages, labs, vitals, and diagnosis terms via medical_spans + doctor_spans.",
      "Rewrites PII filenames (sanitize_filename), cleans base64/hex payloads, and preserves valid FHIR R4 bundles.",
    ],
    cryptoHooks: [
      "pseudonym(patient_key): HMAC-SHA256(RAKSHA_SECRET, key) with \\x00rej|{c}|{key} rejection sampling -> PSN-XXXXXX (>=1 alpha).",
      "shift_date_string: HMAC-SHA256(RAKSHA_SECRET, b'shift|'+key) -> non-zero ±180d offset preserving clinical intervals.",
      "file_hash(raw): SHA-256 hex digest recorded in report.json instead of raw filenames.",
    ],
  },
];

export const TRUST_BOUNDARY_TIERS: TrustTierSpec[] = [
  {
    tierId: "browser",
    name: "React + Vite Console (Frontend)",
    runtime: "Browser Sandbox (Offline bundled assets & ECharts)",
    privilege: "Zero secrets · Zero raw PII after form submit · Read-only policy UI",
    owns: [
      "Client upload pre-validation (extensions, 5 MiB / 25 MiB caps, traversal/dotfile rejection).",
      "CSRF double-submit calls via same-origin fetch on loopback ports (:5173 -> :8000).",
      "Renders sanitized records, cohort stats, and provenance badges (LIVE / DERIVED / FROZEN / UNAVAILABLE).",
    ],
    explicitlyExcluded: [
      "Implements ZERO cryptography (no HMAC-SHA256, no key derivation, no local pseudonym generation).",
      "Never receives RAKSHA_SECRET or unmasked server filesystem paths.",
      "Never writes anything to localStorage (only optional 16-hex run_id in sessionStorage).",
    ],
  },
  {
    tierId: "adapter",
    name: "FastAPI Local Privacy Adapter (apps/api)",
    runtime: "Loopback HTTP (127.0.0.1:8000) · Asyncio + Thread subprocess runner",
    privilege: "Holds server RAKSHA_SECRET in env/RAM · Stages temporary in/ & out/",
    owns: [
      "Enforces loopback Host header, strict Origin allowlist, signed CSRF tokens, and upload bounds.",
      "Resolves configured RAKSHA_SECRET or per-run CSPRNG secret without ever logging/returning it.",
      "Purges raw staged input directory (shutil.rmtree(raw_in)) immediately after CLI exit and runs TTL reaper.",
    ],
    explicitlyExcluded: [
      "Never imports or calls Stage 1 Pipeline() in-process.",
      "Never serves raw uploaded files back to GET endpoints; error strings scrubbed via scrub_sensitive_text().",
      "Does not expose mutable policy endpoints or Swagger/ReDoc external CDN assets.",
    ],
  },
  {
    tierId: "cli",
    name: "RAKSHAK Stage 1 Engine (rakshak/)",
    runtime: "Isolated Child Subprocess · Python stdlib only · CPU-only",
    privilege: "Reads run_<id>/in once, writes run_<id>/out, exits with zero network",
    owns: [
      "Runs deterministic 4-pass pipeline (PYTHONHASHSEED=0, UTF-8 I/O, iterative deep JSON walker).",
      "Computes HMAC-SHA256 Crockford alpha PSNs + ±180d date shifts inside child memory only.",
      "Outputs sanitized/ mirror tree, records.jsonl, and SHA-256 report.json contract.",
    ],
    explicitlyExcluded: [
      "Zero external network libraries, zero LLMs/cloud calls, zero temp side-channel writes.",
      "Never persists RAKSHA_SECRET to report.json, records.jsonl, stdout, or sanitized/ files.",
    ],
  },
];

export const SECURITY_BOUNDARIES_MATRIX: SecurityBoundaryItem[] = [
  {
    id: "sec-offline-cpu",
    classification: "VERIFIED_BEHAVIOR",
    title: "Offline-First & CPU-Only Execution",
    provenance: "FROZEN",
    detail:
      "Stage 1 requires zero third-party pip packages (stdlib only), API Swagger/ReDoc external URLs are disabled (docs_url=None), and the frontend bundles Inter, JetBrains Mono, and ECharts locally with zero external network calls verified in Vite dist scan and Playwright.",
    sourceRef: "requirements.txt · apps/api/rakshak_api/main.py:59-64 · apps/web/dist scan",
  },
  {
    id: "sec-secret-isolation",
    classification: "VERIFIED_BEHAVIOR",
    title: "Process-Isolated Secret Injection & Scrubbing",
    provenance: "FROZEN",
    detail:
      "RAKSHA_SECRET is injected strictly into child subprocess env (_build_child_env), checked as a boolean in /api/health, scrubbed from error messages by scrub_sensitive_text(), and verified absent from logs/outputs by check_submission.py.",
    sourceRef: "apps/api/rakshak_api/runner.py:50-63 · security.py:36-48 · check_submission.py",
  },
  {
    id: "sec-host-origin-csrf",
    classification: "VERIFIED_BEHAVIOR",
    title: "Loopback Host, Origin Allowlist & Signed CSRF",
    provenance: "FROZEN",
    detail:
      "LocalApiSecurityMiddleware enforces loopback Host headers (127.0.0.1/localhost/[::1]), rejects cross-site origins with 403, and verifies HMAC-SHA256 signed double-submit CSRF tokens on every POST/PUT/PATCH/DELETE request.",
    sourceRef: "apps/api/rakshak_api/security.py:51-149 · tests_phase2/test_api_security.py",
  },
  {
    id: "sec-upload-path-guards",
    classification: "VERIFIED_BEHAVIOR",
    title: "Upload Extension, Depth, Traversal & Streaming Size Bounds",
    provenance: "FROZEN",
    detail:
      "Rejects absolute paths, Windows drive prefixes, .. segments, hidden dotfiles, >3 directory depth, control chars, >50 files, >5 MiB per file, and >25 MiB batches via streaming chunk accounting and .resolve().is_relative_to() checks.",
    sourceRef: "apps/api/rakshak_api/security.py:152-179 · runner.py:158-260",
  },
  {
    id: "sec-browser-state",
    classification: "VERIFIED_BEHAVIOR",
    title: "No Raw Patient Records Held in Browser State",
    provenance: "FROZEN",
    detail:
      "Browser memory holds only upload File handles pre-submit and sanitized API outputs post-run. sanitizedRegistryParser applies defense-in-depth regex blocking before populating React state; localStorage stays empty.",
    sourceRef: "apps/web/src/lib/sanitizedRegistryParser.ts:9-109 · apps/web/src/stores/runStore.ts",
  },
  {
    id: "sec-policy-yaml-choices",
    classification: "CONFIG_CHOICE",
    title: "Policy Selection (adaptive_k_mixed, min_group_size=5)",
    provenance: "LIVE",
    detail:
      "Choosing adaptive_k_mixed over destructive global wipeout preserves 99.32% clinical probes (0 lost diagnoses/medications/labs/vitals) while reducing outlier re-identification risk from 1.000 to 0.0085 in Phase 1D/1E dev simulator tests.",
    sourceRef: "config/policy.yaml · rakshak/k_anonymity.py:393-411",
  },
  {
    id: "sec-assumption-client-vs-host",
    classification: "DESIGN_ASSUMPTION",
    title: "Single-User Trusted Workstation Threat Model",
    provenance: "FROZEN",
    detail:
      "Assumes the local OS user running uvicorn and Chromium is trusted inside the enclave, that configured RAKSHA_SECRET has high entropy when supplied in production, and that local temporary OS storage is access-controlled.",
    sourceRef: "phase-2-architecture-spec.md · apps/api/rakshak_api/runner.py:41-47",
  },
  {
    id: "sec-limit-no-forensic-wipe",
    classification: "KNOWN_LIMITATION",
    title: "Logical Cleanup Only (No Claim of Forensic Secure Erasure)",
    provenance: "FROZEN",
    detail:
      "Immediate raw_in purge, 900s TTL expiration, and DELETE /api/runs/{id} call shutil.rmtree() — standard OS filesystem unlink rather than physical block/SSD wear-level overwrite or locked memory zeroization.",
    sourceRef: "apps/api/rakshak_api/runner.py:306-309",
  },
  {
    id: "sec-limit-collision-space",
    classification: "KNOWN_LIMITATION",
    title: "Finite 30-Bit Pseudonym Space (Birthday-Bound Collisions)",
    provenance: "FROZEN",
    detail:
      "PSN-XXXXXX draws uniformly from 32^6 - 10^6 = 1,072,741,824 non-all-digit codes (~4.66 expected collisions at N=100,000 keys; measured 99,996/100,000 distinct on test_phase1e.py). There is no mathematical guarantee of zero collisions across arbitrarily large populations.",
    sourceRef: "rakshak/crypto.py:14-31 · phase-1e-technical-report.md",
  },
  {
    id: "sec-limit-policy-path-fixed",
    classification: "KNOWN_LIMITATION",
    title: "Read-Only API Policy & Direct config/policy.yaml Load",
    provenance: "FROZEN",
    detail:
      "Phase 2A provides no policy mutation endpoint, and Stage 1 main() reads repo config/policy.yaml directly rather than RAKSHAK_POLICY env var; additionally 5 YAML location/PIN strings are fixed in Stage 1 code rather than branched at runtime.",
    sourceRef: "rakshak/pipeline.py:1929-1931 · apps/api/rakshak_api/main.py",
  },
];

export const FORMAT_SUPPORT_MATRIX: FormatSupportRow[] = [
  {
    extensionOrFormat: ".csv / .tsv",
    stage1Handling: "Processed (UTF-8-BOM / UTF-16 / UTF-8 / CP1252 -> UTF-8); auto delimiter & column inference",
    phase2aUploadStatus: "Process (.sanitized)",
    notes: "Row-level loc='row:N'; headers scrubbed; empty or unparseable rows fall back cleanly or quarantine.",
    sourceRef: "rakshak/io_utils.py:13-70 · pipeline.py:1321-1379",
  },
  {
    extensionOrFormat: ".json (Nested & FHIR R4)",
    stage1Handling: "Processed via iterative depth unwrapper (1,500+ nesting safe) & structural FHIR R4 sanitizer",
    phase2aUploadStatus: "Process (.sanitized)",
    notes: "FHIR Bundles retain R4 structure & resolvable refs; malformed JSON returns None -> quarantined.",
    sourceRef: "rakshak/io_utils.py:73-88 · pipeline.py:1478-1599 · fhir_handler.py",
  },
  {
    extensionOrFormat: ".txt (Notes / Reports)",
    stage1Handling: "Processed via TextSanitizer across English, Devanagari, and Hinglish + inline base64/hex decode",
    phase2aUploadStatus: "Process (.sanitized)",
    notes: "Preserves doctors, dosages, labs, vitals while redacting patient/relative PII & generalizing age/PIN.",
    sourceRef: "rakshak/text_sanitizer.py · pipeline.py:1889-1899",
  },
  {
    extensionOrFormat: ".pdf, .jpg, .jpeg, .png, .xml",
    stage1Handling: "Quarantined cleanly (zero OCR/parse attempt; output: null in report.json, never copied to sanitized/)",
    phase2aUploadStatus: "Quarantine Test (Accepted)",
    notes: "Accepted by Phase 2A upload filter strictly to verify Stage 1 fail-closed quarantine behavior.",
    sourceRef: "rakshak/constants.py:58-59 · pipeline.py:1253-1255 · apps/api/rakshak_api/config.py:36",
  },
  {
    extensionOrFormat: ".gif, .bmp, .tiff, .docx, .xlsx, .zip, .rar",
    stage1Handling: "Quarantined if present inside direct Stage 1 CLI input directory",
    phase2aUploadStatus: "Rejected (HTTP 415)",
    notes: "Direct Stage 1 CLI quarantines these extensions; Phase 2A HTTP upload rejects them upfront with 415 UNSUPPORTED_MEDIA_TYPE.",
    sourceRef: "rakshak/constants.py:58-59 · apps/api/rakshak_api/config.py:37-39 · security.py:177-178",
  },
];
