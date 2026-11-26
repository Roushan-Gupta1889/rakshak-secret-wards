import { z } from "zod";
import type { SelectedUploadFile } from "@/config/backendContract";
import {
  ApiErrorBodySchema,
  BenchmarkResponseSchema,
  CsrfResponseSchema,
  HealthResponseSchema,
  PolicyResponseSchema,
  RecordsPageResponseSchema,
  RunSummaryResponseSchema,
  type BenchmarkResponse,
  type CsrfResponse,
  type HealthResponse,
  type PolicyResponse,
  type RecordsPageResponse,
  type RunSummaryResponse,
  type SanitizedRecordItem,
  type SecretMode,
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

export type SubmitRunPhase = "acquiring_csrf" | "uploading" | "processing";

export interface UploadProgressInfo {
  loadedBytes: number;
  totalBytes: number;
  percent: number | null;
}

function parseErrorPayload(path: string, status: number, payload: unknown): ApiRequestError {
  const parsedErr = ApiErrorBodySchema.safeParse(payload);
  const code = parsedErr.success ? parsedErr.data.error.code : `HTTP_${status}`;
  const msg = parsedErr.success
    ? parsedErr.data.error.message
    : `Endpoint ${path} returned HTTP ${status}.`;
  return new ApiRequestError(msg, { status, code });
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
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiRequestError(
      isTimeout
        ? `Request to ${path} timed out after ${timeoutMs}ms.`
        : `Local API unreachable (${path}).`,
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
    throw parseErrorPayload(path, resp.status, jsonPayload);
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

export async function fetchCsrfToken(): Promise<CsrfResponse> {
  const { data } = await fetchJsonValidated("/api/csrf", CsrfResponseSchema, 5000);
  return data;
}

export async function fetchRunSummary(runId: string): Promise<RunSummaryResponse> {
  const path = `/api/runs/${encodeURIComponent(runId)}`;
  const { data } = await fetchJsonValidated(path, RunSummaryResponseSchema, 8000);
  return data;
}

export async function fetchRecordsPage(
  runId: string,
  opts: {
    page?: number;
    pageSize?: number;
    status?: string;
    patientPsn?: string;
    fileQ?: string;
  } = {},
): Promise<RecordsPageResponse> {
  const params = new URLSearchParams();
  params.set("page", String(opts.page ?? 1));
  params.set("page_size", String(opts.pageSize ?? 100));
  if (opts.status) params.set("status", opts.status);
  if (opts.patientPsn) params.set("patient_psn", opts.patientPsn);
  if (opts.fileQ) params.set("file_q", opts.fileQ);

  const path = `/api/runs/${encodeURIComponent(runId)}/records?${params.toString()}`;
  const { data } = await fetchJsonValidated(path, RecordsPageResponseSchema, 8000);
  return data;
}

export async function fetchAllRunRecordsIndex(
  runId: string,
  maxPages = 50,
): Promise<{ total: number; records: SanitizedRecordItem[] }> {
  const first = await fetchRecordsPage(runId, { page: 1, pageSize: 100 });
  const records: SanitizedRecordItem[] = [...first.items];
  const total = first.total;

  let page = 2;
  while (records.length < total && page <= maxPages && first.items.length > 0) {
    const next = await fetchRecordsPage(runId, { page, pageSize: 100 });
    if (!next.items.length) break;
    records.push(...next.items);
    if (next.items.length < 100) break;
    page += 1;
  }

  return { total, records };
}

export async function fetchSanitizedTextFile(runId: string, outputRelPath: string): Promise<string> {
  const url = buildSanitizedFileDownloadUrl(runId, outputRelPath, false);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "text/plain" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiRequestError(
      isTimeout ? `Timed out reading sanitized file ${outputRelPath}.` : `Local API unreachable (${url}).`,
      { code: isTimeout ? "TIMEOUT" : "NETWORK_UNREACHABLE", isNetworkOrTimeout: true },
    );
  }

  if (!resp.ok) {
    let payload: unknown = null;
    try {
      payload = await resp.json();
    } catch {
      payload = null;
    }
    throw parseErrorPayload(url, resp.status, payload);
  }

  return resp.text();
}

export async function submitSanitizationRun(opts: {
  files: SelectedUploadFile[];
  secretMode: SecretMode;
  onPhaseChange?: (phase: SubmitRunPhase) => void;
  onUploadProgress?: (progress: UploadProgressInfo) => void;
}): Promise<RunSummaryResponse> {
  const { files, secretMode, onPhaseChange, onUploadProgress } = opts;
  if (!files.length) {
    throw new ApiRequestError("Select at least one valid file before submitting.", {
      code: "NO_FILES_SELECTED",
    });
  }

  onPhaseChange?.("acquiring_csrf");
  const csrf = await fetchCsrfToken();

  const formData = new FormData();
  for (const item of files) {
    formData.append("files", item.file, item.relPath);
  }
  formData.append("secret_mode", secretMode);

  let currentPhase: SubmitRunPhase = "acquiring_csrf";
  const emitPhase = (next: SubmitRunPhase) => {
    if (currentPhase !== next) {
      currentPhase = next;
      onPhaseChange?.(next);
    }
  };

  emitPhase("uploading");
  onUploadProgress?.({ loadedBytes: 0, totalBytes: files.reduce((s, f) => s + f.sizeBytes, 0), percent: 0 });

  return new Promise<RunSummaryResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/runs", true);
    xhr.withCredentials = true;
    xhr.timeout = 75_000;
    xhr.setRequestHeader(csrf.header_name || "X-CSRF-Token", csrf.csrf_token);
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = (ev: ProgressEvent) => {
      if (ev.lengthComputable && ev.total > 0) {
        const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
        onUploadProgress?.({ loadedBytes: ev.loaded, totalBytes: ev.total, percent: pct });
        if (pct >= 100) {
          emitPhase("processing");
        }
      } else {
        onUploadProgress?.({ loadedBytes: ev.loaded, totalBytes: 0, percent: null });
      }
    };

    xhr.upload.onload = () => {
      emitPhase("processing");
    };

    xhr.onerror = () => {
      reject(
        new ApiRequestError("Network error while communicating with POST /api/runs.", {
          code: "NETWORK_UNREACHABLE",
          isNetworkOrTimeout: true,
        }),
      );
    };

    xhr.ontimeout = () => {
      reject(
        new ApiRequestError(
          "Sanitization request timed out waiting for the Stage 1 CLI subprocess.",
          { code: "TIMEOUT", isNetworkOrTimeout: true },
        ),
      );
    };

    xhr.onabort = () => {
      reject(new ApiRequestError("Upload request was aborted.", { code: "ABORTED" }));
    };

    xhr.onload = () => {
      let jsonPayload: unknown = null;
      try {
        jsonPayload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        jsonPayload = null;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(parseErrorPayload("/api/runs", xhr.status, jsonPayload));
        return;
      }

      const validated = RunSummaryResponseSchema.safeParse(jsonPayload);
      if (!validated.success) {
        reject(
          new ApiRequestError("Backend /api/runs response failed schema validation.", {
            status: xhr.status,
            code: "SCHEMA_VALIDATION_FAILED",
          }),
        );
        return;
      }

      resolve(validated.data);
    };

    xhr.send(formData);
  });
}

export async function deleteSanitizationRun(runId: string): Promise<void> {
  const csrf = await fetchCsrfToken();
  const path = `/api/runs/${encodeURIComponent(runId)}`;
  let resp: Response;
  try {
    resp = await fetch(path, {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        [csrf.header_name || "X-CSRF-Token"]: csrf.csrf_token,
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiRequestError(
      isTimeout ? `Request to DELETE ${path} timed out.` : `Local API unreachable (${path}).`,
      { code: isTimeout ? "TIMEOUT" : "NETWORK_UNREACHABLE", isNetworkOrTimeout: true },
    );
  }

  if (resp.status === 204) {
    return;
  }

  let jsonPayload: unknown = null;
  try {
    jsonPayload = await resp.json();
  } catch {
    jsonPayload = null;
  }
  throw parseErrorPayload(path, resp.status, jsonPayload);
}

export function buildRunBundleDownloadUrl(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/bundle.zip`;
}

export function buildSanitizedFileDownloadUrl(
  runId: string,
  outputRelPath: string,
  download = true,
): string {
  const encodedPath = outputRelPath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/api/runs/${encodeURIComponent(runId)}/files/${encodedPath}${download ? "?download=true" : ""}`;
}

function parseFilenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename="?([^";]+)"?/i.exec(header);
  return m?.[1]?.trim() || fallback;
}

export async function downloadRunArtifact(url: string, fallbackFilename: string): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiRequestError(
      isTimeout ? "Download timed out." : "Local API unreachable while downloading artifact.",
      { code: isTimeout ? "TIMEOUT" : "NETWORK_UNREACHABLE", isNetworkOrTimeout: true },
    );
  }

  if (!resp.ok) {
    let payload: unknown = null;
    try {
      payload = await resp.json();
    } catch {
      payload = null;
    }
    throw parseErrorPayload(url, resp.status, payload);
  }

  const blob = await resp.blob();
  const resolvedName = parseFilenameFromDisposition(
    resp.headers.get("Content-Disposition"),
    fallbackFilename,
  );
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = resolvedName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  return resolvedName;
}
