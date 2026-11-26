import { z } from "zod";
import {
  ApiErrorBodySchema,
  BenchmarkResponseSchema,
  HealthResponseSchema,
  PolicyResponseSchema,
  type BenchmarkResponse,
  type HealthResponse,
  type PolicyResponse,
} from "./schemas";

export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly isNetworkOrTimeout: boolean;

  constructor(
    message: string,
    opts: { status?: number | null; code: string; isNetworkOrTimeout?: boolean },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = opts.status ?? null;
    this.code = opts.code;
    this.isNetworkOrTimeout = opts.isNetworkOrTimeout ?? false;
  }
}

async function fetchJsonValidated<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  timeoutMs = 6000,
): Promise<{ data: z.infer<T>; latencyMs: number }> {
  const start = performance.now();
  let resp: Response;
  try {
    resp = await fetch(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiRequestError(
      isTimeout ? `Request to ${path} timed out after ${timeoutMs}ms.` : `Local API unreachable (${path}).`,
      { code: isTimeout ? "TIMEOUT" : "NETWORK_UNREACHABLE", isNetworkOrTimeout: true },
    );
  }

  const latencyMs = Math.round(performance.now() - start);
  let jsonPayload: unknown = null;
  try {
    jsonPayload = await resp.json();
  } catch {
    jsonPayload = null;
  }

  if (!resp.ok) {
    const parsedErr = ApiErrorBodySchema.safeParse(jsonPayload);
    const code = parsedErr.success ? parsedErr.data.error.code : `HTTP_${resp.status}`;
    const msg = parsedErr.success
      ? parsedErr.data.error.message
      : `Endpoint ${path} returned HTTP ${resp.status}.`;
    throw new ApiRequestError(msg, { status: resp.status, code });
  }

  const validated = schema.safeParse(jsonPayload);
  if (!validated.success) {
    throw new ApiRequestError(`Invalid response schema from ${path}.`, {
      status: resp.status,
      code: "SCHEMA_VALIDATION_FAILED",
    });
  }
  return { data: validated.data, latencyMs };
}

export function fetchHealth(): Promise<{ data: HealthResponse; latencyMs: number }> {
  return fetchJsonValidated("/api/health", HealthResponseSchema);
}

export function fetchPolicy(): Promise<{ data: PolicyResponse; latencyMs: number }> {
  return fetchJsonValidated("/api/policy", PolicyResponseSchema);
}

export function fetchBenchmark(): Promise<{ data: BenchmarkResponse; latencyMs: number }> {
  return fetchJsonValidated("/api/analytics/benchmark", BenchmarkResponseSchema, 4000);
}
