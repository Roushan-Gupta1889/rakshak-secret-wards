import type { RunSummaryResponse } from "@/api/schemas";

export const SAMPLE_RUN_SUMMARY: RunSummaryResponse = {
  run_id: "0123456789abcdef",
  created_at: "2026-11-26T23:10:00Z",
  expires_at: "2026-11-26T23:25:00Z",
  status: "completed",
  secret_source: "configured",
  provenance: "LIVE",
  schema_version: "raksha-report/1",
  counts: {
    files_total: 2,
    files_sanitized: 1,
    files_quarantined: 1,
    records_processed: 3,
    identifiers_detected: 7,
    records_linked: 2,
    records_generalized: 1,
    records_suppressed: 1,
    records_quarantined: 1,
  },
  entities: { NAME: 3, PHONE: 2, UHID: 2 },
  timing: { seconds: 0.42 },
  resources: { peak_rss_mb: 24.5 },
  files: [
    {
      input_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      output: "sanitized/patients.csv",
      status: "sanitized",
      reason: null,
      size_bytes: 512,
    },
    {
      input_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      output: null,
      status: "quarantined",
      reason: "UNSUPPORTED_MEDIA_TYPE",
      size_bytes: 1024,
    },
  ],
  placeholder_summary: {
    provenance: "DERIVED",
    counts: { PSN: 2, NAME: 3, PHONE: 2 },
    psn_count: 2,
    all_alpha_psn_valid: true,
  },
  fhir_validation: {
    provenance: "DERIVED",
    bundles_total: 0,
    bundles_valid: 0,
    bundles_invalid: 0,
  },
  cohort_summary: {
    provenance: "DERIVED",
    generalized_district_markers: 1,
    suppressed_pin_markers: 1,
    suppressed_dob_markers: 0,
    suppressed_age_markers: 0,
  },
};

