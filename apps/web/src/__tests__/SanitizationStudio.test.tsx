import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND_CONTRACT } from "@/config/backendContract";
import { SanitizationStudioPage } from "@/pages/SanitizationStudioPage";
import { useRunStore } from "@/stores/runStore";
import { SAMPLE_RUN_SUMMARY } from "@/test/fixtures";

function renderStudio() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SanitizationStudioPage />
    </QueryClientProvider>,
  );
}

function makeFile(name: string, bytes = 64): File {
  const f = new File(["patient,diagnosis\nA,HTN\n"], name, { type: "text/csv" });
  if (bytes !== f.size) {
    Object.defineProperty(f, "size", { value: bytes });
  }
  return f;
}

describe("SanitizationStudioPage end-to-end UI workflows", () => {
  const origFetch = globalThis.fetch;
  const origXhr = globalThis.XMLHttpRequest;

  beforeEach(() => {
    window.sessionStorage.clear();
    useRunStore.getState().clearActiveRunView();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    globalThis.XMLHttpRequest = origXhr;
  });

  it("supports multi-file selection, drag-and-drop validation errors, and clearing", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: "ok",
          provenance: "LIVE",
          engine_tag: "phase-1e-v1",
          engine_version: "1.0.0",
          stdlib_stage1: true,
          offline_mode: true,
          secret_configured: true,
          active_runs: 0,
          retained_runs: 0,
          max_concurrent_runs: 2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as typeof fetch;

    const user = userEvent.setup();
    renderStudio();

    expect(screen.getByText("No completed sanitization run loaded")).toBeInTheDocument();

    const fileInput = screen.getByLabelText("Upload files for sanitization");
    await user.upload(fileInput, [makeFile("ward.csv", 120), makeFile("scan.pdf", 300)]);

    expect(screen.getByText("ward.csv")).toBeInTheDocument();
    expect(screen.getByText("scan.pdf")).toBeInTheDocument();
    expect(screen.getByText("Process: 1")).toBeInTheDocument();
    expect(screen.getByText("Quarantine: 1")).toBeInTheDocument();

    const dropzone = screen.getByTestId("studio-dropzone");
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [
          makeFile("malware.exe", 100),
          makeFile("too_large.csv", BACKEND_CONTRACT.maxFileBytes + 10),
        ],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("[UNSUPPORTED_MEDIA_TYPE]");
    expect(screen.getByRole("alert")).toHaveTextContent("[FILE_TOO_LARGE]");

    await user.click(screen.getByRole("button", { name: /Clear Selected/i }));
    expect(screen.queryByText("ward.csv")).not.toBeInTheDocument();
  });

  it("executes CSRF-protected submission, renders results without fabricated data, downloads bundle, and deletes run", async () => {
    let fetchCalls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      fetchCalls.push({ url, method });

      if (url === "/api/health") {
        return new Response(
          JSON.stringify({
            status: "ok",
            provenance: "LIVE",
            engine_tag: "phase-1e-v1",
            engine_version: "1.0.0",
            stdlib_stage1: true,
            offline_mode: true,
            secret_configured: true,
            active_runs: 0,
            retained_runs: 0,
            max_concurrent_runs: 2,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "/api/csrf") {
        return new Response(
          JSON.stringify({ csrf_token: "csrf.tok123", header_name: "X-CSRF-Token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/api/runs/${SAMPLE_RUN_SUMMARY.run_id}/bundle.zip`) {
        return new Response("PK\x03\x04zipdata", {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="rakshak_${SAMPLE_RUN_SUMMARY.run_id}.zip"`,
          },
        });
      }
      if (url === `/api/runs/${SAMPLE_RUN_SUMMARY.run_id}` && method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    let xhrCount = 0;
    class ControlledXHR {
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
      setRequestHeader() {}
      send() {
        xhrCount += 1;
        this.upload.onprogress?.({ lengthComputable: true, loaded: 64, total: 64 } as ProgressEvent);
        this.upload.onload?.();
        setTimeout(() => this.onload?.(), 20);
      }
    }
    globalThis.XMLHttpRequest = ControlledXHR as unknown as typeof XMLHttpRequest;

    const user = userEvent.setup();
    renderStudio();

    const fileInput = screen.getByLabelText("Upload files for sanitization");
    await user.upload(fileInput, [makeFile("patients.csv", 64)]);

    const submitBtn = screen.getByRole("button", { name: /Run Sanitization Pipeline/i });
    await user.click(submitBtn);

    // Wait for results
    await waitFor(() => {
      expect(screen.getByTestId("run-results-panel")).toBeInTheDocument();
    });
    expect(xhrCount).toBe(1);
    expect(screen.getByText(/Sanitization Run Summary/i)).toHaveTextContent(SAMPLE_RUN_SUMMARY.run_id);
    expect(screen.getByText(/No FHIR R4 bundles present in this run/i)).toBeInTheDocument();
    expect(screen.getByText("sanitized/patients.csv")).toBeInTheDocument();
    expect(screen.getByText(/Not available \(quarantined input/i)).toBeInTheDocument();

    // Bundle download
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:studio-zip");
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await user.click(screen.getByRole("button", { name: /Download Bundle/i }));
      await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }

    // Logical deletion dialog & execution
    await user.click(screen.getByRole("button", { name: /Delete Run/i }));
    expect(screen.getByText(/not constitute forensic cryptographic wipe/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Confirm Delete Run/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("run-results-panel")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/DELETED ON SERVER/i)).toBeInTheDocument();
    expect(fetchCalls.some((c) => c.method === "DELETE" && c.url.includes(SAMPLE_RUN_SUMMARY.run_id))).toBe(true);
  });

  it("displays CSRF rejection, run lookup failure/success, and offline banner without fake metrics", async () => {
    const emptyEntityRun = {
      ...SAMPLE_RUN_SUMMARY,
      entities: {},
      fhir_validation: { provenance: "DERIVED" as const, bundles_total: 1, bundles_valid: 1, bundles_invalid: 0 },
    };

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/health") {
        throw new TypeError("Network unreachable");
      }
      if (url === "/api/csrf") {
        return new Response(
          JSON.stringify({ csrf_token: "bad.tok", header_name: "X-CSRF-Token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/api/runs/${SAMPLE_RUN_SUMMARY.run_id}`) {
        return new Response(JSON.stringify(emptyEntityRun), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    class CsrfFailXHR {
      withCredentials = false;
      timeout = 0;
      status = 403;
      responseText = JSON.stringify({
        error: { code: "INVALID_CSRF_TOKEN", message: "Missing or invalid CSRF token." },
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
    globalThis.XMLHttpRequest = CsrfFailXHR as unknown as typeof XMLHttpRequest;

    const user = userEvent.setup();
    renderStudio();

    await waitFor(() => {
      expect(screen.getByText(/Local API adapter unreachable/i)).toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText("Upload files for sanitization");
    await user.upload(fileInput, [makeFile("visit.txt", 40)]);
    await user.click(screen.getByRole("button", { name: /Run Sanitization Pipeline/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sanitization run rejected \(INVALID_CSRF_TOKEN\)/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("run-results-panel")).not.toBeInTheDocument();

    // Retrieve run via lookup bar and confirm empty entities shows "Not available"
    await user.type(screen.getByLabelText("Retrieve run ID"), SAMPLE_RUN_SUMMARY.run_id);
    await user.click(screen.getByRole("button", { name: /Load Run/i }));

    await waitFor(() => {
      expect(screen.getByTestId("run-results-panel")).toBeInTheDocument();
    });
    expect(screen.getByText(/Not available — zero entity types reported/i)).toBeInTheDocument();
  });
});
