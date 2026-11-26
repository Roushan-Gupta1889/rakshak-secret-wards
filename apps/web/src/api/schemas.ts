import { z } from "zod";

export const ProvenanceSchema = z.enum(["LIVE", "FROZEN", "DERIVED"]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const SecretModeSchema = z.enum(["auto", "configured", "ephemeral"]);
export type SecretMode = z.infer<typeof SecretModeSchema>;

export const SecretSourceSchema = z.enum(["configured", "ephemeral"]);
export type SecretSource = z.infer<typeof SecretSourceSchema>;

export const RunIdSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{16}$/i, "Run ID must be a 16-character hexadecimal identifier.");

export const CsrfResponseSchema = z.object({
  csrf_token: z.string().min(1),
  header_name: z.string().min(1),
});
export type CsrfResponse = z.infer<typeof CsrfResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  provenance: z.literal("LIVE"),
  engine_tag: z.string(),
  engine_version: z.string(),
  stdlib_stage1: z.boolean(),
  offline_mode: z.boolean(),
  secret_configured: z.boolean(),
  active_runs: z.number().int().nonnegative(),
  retained_runs: z.number().int().nonnegative(),
  max_concurrent_runs: z.number().int().positive(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const PolicyResponseSchema = z.object({
  provenance: z.literal("LIVE"),
  policy_sha256: z.string(),
  policy: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type PolicyResponse = z.infer<typeof PolicyResponseSchema>;

export const RunCountsSchema = z.object({
  files_total: z.number().int().nonnegative(),
  files_sanitized: z.number().int().nonnegative(),
  files_quarantined: z.number().int().nonnegative(),
  records_processed: z.number().int().nonnegative(),
  identifiers_detected: z.number().int().nonnegative(),
  records_linked: z.number().int().nonnegative(),
  records_generalized: z.number().int().nonnegative(),
  records_suppressed: z.number().int().nonnegative(),
  records_quarantined: z.number().int().nonnegative(),
});
export type RunCounts = z.infer<typeof RunCountsSchema>;

export const ManifestFileEntrySchema = z.object({
  input_sha256: z.string(),
  output: z.string().nullable().optional().default(null),
  status: z.enum(["sanitized", "quarantined"]),
  reason: z.string().nullable().optional().default(null),
  size_bytes: z.number().int().nonnegative().nullable().optional().default(null),
});
export type ManifestFileEntry = z.infer<typeof ManifestFileEntrySchema>;

export const PlaceholderSummarySchema = z.object({
  provenance: z.literal("DERIVED"),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  psn_count: z.number().int().nonnegative(),
  all_alpha_psn_valid: z.boolean(),
});
export type PlaceholderSummary = z.infer<typeof PlaceholderSummarySchema>;

export const FhirValidationSummarySchema = z.object({
  provenance: z.literal("DERIVED"),
  bundles_total: z.number().int().nonnegative(),
  bundles_valid: z.number().int().nonnegative(),
  bundles_invalid: z.number().int().nonnegative(),
});
export type FhirValidationSummary = z.infer<typeof FhirValidationSummarySchema>;

export const CohortKSummarySchema = z.object({
  provenance: z.literal("DERIVED"),
  generalized_district_markers: z.number().int().nonnegative(),
  suppressed_pin_markers: z.number().int().nonnegative(),
  suppressed_dob_markers: z.number().int().nonnegative(),
  suppressed_age_markers: z.number().int().nonnegative(),
});
export type CohortKSummary = z.infer<typeof CohortKSummarySchema>;

export const RunSummaryResponseSchema = z.object({
  run_id: z.string().min(1),
  created_at: z.string(),
  expires_at: z.string(),
  status: z.literal("completed"),
  secret_source: SecretSourceSchema,
  provenance: z.literal("LIVE"),
  schema_version: z.string(),
  counts: RunCountsSchema,
  entities: z.record(z.string(), z.number().int().nonnegative()),
  timing: z.object({
    seconds: z.number().nonnegative(),
  }),
  resources: z.object({
    peak_rss_mb: z.number().nonnegative(),
  }),
  files: z.array(ManifestFileEntrySchema),
  placeholder_summary: PlaceholderSummarySchema,
  fhir_validation: FhirValidationSummarySchema,
  cohort_summary: CohortKSummarySchema,
});
export type RunSummaryResponse = z.infer<typeof RunSummaryResponseSchema>;

export const BenchmarkResponseSchema = z.object({
  provenance: ProvenanceSchema,
  milestones: z.array(
    z.object({
      tag: z.string(),
      total: z.number(),
      privacy: z.number(),
      utility: z.number(),
    }),
  ),
});
export type BenchmarkResponse = z.infer<typeof BenchmarkResponseSchema>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string().nullable().optional(),
  }),
});
