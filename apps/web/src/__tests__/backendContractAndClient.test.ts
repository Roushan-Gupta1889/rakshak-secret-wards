import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError,
  buildRunBundleDownloadUrl,
  buildSanitizedFileDownloadUrl,
  deleteSanitizationRun,
  downloadRunArtifact,
  fetchRunSummary,
  submitSanitizationRun,
} from "@/api/client";
import type { RunSummaryResponse } from "@/api/schemas";
import { BACKEND_CONTRACT, mergeValidatedBatch } from "@/config/backendContract";
import { SAMPLE_RUN_SUMMARY } from "@/test/fixtures";

const _UNUSED_TYPE_CHECK: RunSummaryResponse | null = null;
void _UNUSED_TYPE_CHECK;

function makeFakeFile(name: string, sizeBytes: number, content = "sample"): File {
  const f = new File([content], name, { type: "text/plain" });
  Object.defineProperty(f, "size", { value: sizeBytes });
  return f;
}

describe("backendContract upload validation", () => {
  it("accepts valid multi-file selections and classifies process vs quarantine extensions", () => {
    const res = mergeValidatedBatch([], [
      makeFakeFile("ward_a.csv", 1200),
      makeFakeFile("notes.txt", 800),
      makeFakeFile("scan.pdf", 2400),
    ]);
    expect(res.errors).toHaveLength(0);
    expect(res.accepted).toHaveLength(3);
    expect(res.processCount).toBe(2);
    expect(res.quarantineCount).toBe(1);
    expect(res.totalBytes).toBe(4400);
  });

  it("rejects unsupported extensions, traversal filenames, duplicates, oversized files, and batch overflow", () => {
    const tooBig = makeFakeFile("huge.csv", BACKEND_CONTRACT.maxFileBytes + 1);
    const badExt = makeFakeFile("payload.exe", 50);
    const traversal = makeFakeFile("../secret.csv", 50);
    const hidden = makeFakeFile(".env", 50);
    const good1 = makeFakeFile("valid.csv", 100);
    const dup1 = makeFakeFile("valid.csv", 100);

    const r1 = mergeValidatedBatch([], [tooBig, badExt, traversal, hidden, good1, dup1]);
    expect(r1.accepted).toHaveLength(1);
    expect(r1.errors.map((e) => e.code)).toEqual([
      "FILE_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "PATH_TRAVERSAL",
      "PATH_TRAVERSAL",
      "DUPLICATE_FILENAME",
    ]);

    const nearFull = Array.from({ length: 6 }, (_, i) =>
      makeFakeFile(`chunk_${i}.csv`, 4 * 1024 * 1024),
    );
    const rBatch = mergeValidatedBatch([], [...nearFull, makeFakeFile("overflow.csv", 2 * 1024 * 1024)]);
    expect(rBatch.accepted).toHaveLength(6);
    expect(rBatch.errors).toHaveLength(1);
    expect(rBatch.errors[0].code).toBe("BATCH_TOO_LARGE");
  });
});

describe("Phase 2C API client contracts", () => {
  const originalXhr = globalThis.XMLHttpRequest;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXhr;
    globalThis.fetch = originalFetch;
  });

  it("acquires CSRF token, streams upload progress, and parses RunSummaryResponse", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      if (String(input) === "/api/csrf") {
        return new Response(
          JSON.stringify({ csrf_token: "nonce.0123456789abcdef0123456789abcdef", header_name: "X-CSRF-Token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }) as typeof fetch;

    const capturedHeaders: Record<string, string> = {};
    let sentBody: unknown = null;

    class MockXHR {
      withCredentials = false;
      timeout = 0;
      status = 201;
      responseText = JSON.stringify(SAMPLE_RUN_SUMMARY);
      upload = {
        onprogress: null as ((e: ProgressEvent) => void) | null,
        onload: null as (() => void) | null,
      };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open() {}
      setRequestHeader(k: string, v: string) {
        capturedHeaders[k] = v;
      }
      send(body: unknown) {
        sentBody = body;
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 } as ProgressEvent);
        this.upload.onload?.();
        this.onload?.();
      }
    }

    globalThis.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;

    const phases: string[] = [];
    const percents: Array<number | null> = [];
    const batch = mergeValidatedBatch([], [makeFakeFile("patients.csv", 100)]);

    const summary = await submitSanitizationRun({
      files: batch.accepted,
      secretMode: "auto",
      onPhaseChange: (p) => phases.push(p),
      onUploadProgress: (u) => percents.push(u.percent),
    });

    expect(summary.run_id).toBe(SAMPLE_RUN_SUMMARY.run_id);
    expect(capturedHeaders["X-CSRF-Token"]).toBe("nonce.0123456789abcdef0123456789abcdef");
    expect(sentBody instanceof FormData).toBe(true);
    expect(phases).toEqual(["acquiring_csrf", "uploading", "processing"]);
    expect(percents).toEqual([0, 50, 100]);
  });

  it("surfaces CSRF rejection (403 INVALID_CSRF_TOKEN) without swallowing error", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ csrf_token: "stale.token", header_name: "X-CSRF-Token" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as typeof fetch;

    class RejectCsrfXHR {
      withCredentials = false;
      timeout = 0;
      status = 403;
      responseText = JSON.stringify({
        error: { code: "INVALID_CSRF_TOKEN", message: "Missing or invalid CSRF token.", request_id: "r1" },
      });
      upload = { onprogress: null, onload: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send() {
        this.onload?.();
      }
    }
    globalThis.XMLHttpRequest = RejectCsrfXHR as unknown as typeof XMLHttpRequest;

    const batch = mergeValidatedBatch([], [makeFakeFile("a.txt", 12)]);
    await expect(
      submitSanitizationRun({ files: batch.accepted, secretMode: "auto" }),
    ).rejects.toMatchObject({ status: 403, code: "INVALID_CSRF_TOKEN" });
  });

  it("retrieves run status, deletes run with CSRF header, and builds safe download URLs", async () => {
    const calls: Array<{ url: string; method: string; csrf: string | null }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const hdrs = new Headers(init?.headers);
      calls.push({ url, method, csrf: hdrs.get("X-CSRF-Token") });

      if (url === "/api/csrf") {
        return new Response(
          JSON.stringify({ csrf_token: "fresh.csrf", header_name: "X-CSRF-Token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "/api/runs/0123456789abcdef" && method === "GET") {
        return new Response(JSON.stringify(SAMPLE_RUN_SUMMARY), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/runs/0123456789abcdef" && method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url === "/api/runs/0123456789abcdef/bundle.zip") {
        return new Response("PK\x03\x04dummyzip", {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="rakshak_0123456789abcdef.zip"',
          },
        });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const fetched = await fetchRunSummary("0123456789abcdef");
    expect(fetched.counts.records_processed).toBe(3);

    expect(buildRunBundleDownloadUrl("0123456789abcdef")).toBe("/api/runs/0123456789abcdef/bundle.zip");
    expect(buildSanitizedFileDownloadUrl("0123456789abcdef", "sanitized/sub dir/out.csv")).toBe(
      "/api/runs/0123456789abcdef/files/sanitized/sub%20dir/out.csv?download=true",
    );

    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      const savedName = await downloadRunArtifact(
        "/api/runs/0123456789abcdef/bundle.zip",
        "fallback.zip",
      );
      expect(savedName).toBe("rakshak_0123456789abcdef.zip");
      expect(clickSpy).toHaveBeenCalledTimes(1);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }

    await deleteSanitizationRun("0123456789abcdef");
    const delCall = calls.find((c) => c.method === "DELETE");
    expect(delCall?.csrf).toBe("fresh.csrf");
  });

  it("handles backend unreachable state cleanly", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    await expect(fetchRunSummary("0123456789abcdef")).rejects.toBeInstanceOf(ApiRequestError);
    await expect(fetchRunSummary("0123456789abcdef")).rejects.toMatchObject({
      code: "NETWORK_UNREACHABLE",
      isNetworkOrTimeout: true,
    });
  });
});
