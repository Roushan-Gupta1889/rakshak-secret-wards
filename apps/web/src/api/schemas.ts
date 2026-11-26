import { z } from "zod";

export const ProvenanceSchema = z.enum(["LIVE", "FROZEN", "DERIVED"]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

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
