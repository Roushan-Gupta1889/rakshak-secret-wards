import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnlinkabilityLabPage } from "@/pages/UnlinkabilityLabPage";
import { SAMPLE_RUN_SUMMARY } from "@/test/fixtures";

function renderLab() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <UnlinkabilityLabPage />
    </QueryClientProvider>,
  );
}

function makeRecs(runId: string, psns: string[]) {
  return {
    provenance: "DERIVED",
    run_id: runId,
    total: psns.length,
    page: 1,
    page_size: 100,
    items: psns.map((patient, index) => ({
      index,
      file: "sanitized/synthetic_unlinkability_fixture.csv",
      loc: `row:${index}`,
      patient,
      status: "generalized",
      preview: "",
    })),
  };
}

describe("UnlinkabilityLabPage live cryptographic verification UI", () => {
  const origFetch = globalThis.fetch;
  const origXhr = globalThis.XMLHttpRequest;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    globalThis.XMLHttpRequest = origXhr;
  });

  it("starts in honest empty state, runs full 3-run verification with CSRF + DELETE cleanup, and validates format", async () => {
    const deletedIds: string[] = [];
    const runIds = ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "cccccccccccccccc"];
    const secretModesPosted: string[] = [];

    const psnSetA = ["PSN-7JNJ5S", "PSN-PK22AR", "PSN-5BDBT8"];
    const psnSetB = ["PSN-7JNJ5S", "PSN-PK22AR", "PSN-5BDBT8"];
    const psnSetC = ["PSN-9G98B7", "PSN-04NFMC", "PSN-CRZ70P"];

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
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
          JSON.stringify({ csrf_token: "csrf.tok", header_name: "X-CSRF-Token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith(`/api/runs/${runIds[0]}/records`)) {
        return new Response(JSON.stringify(makeRecs(runIds[0], psnSetA)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith(`/api/runs/${runIds[1]}/records`)) {
        return new Response(JSON.stringify(makeRecs(runIds[1], psnSetB)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith(`/api/runs/${runIds[2]}/records`)) {
        return new Response(JSON.stringify(makeRecs(runIds[2], psnSetC)), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "DELETE" && url.startsWith("/api/runs/")) {
        deletedIds.push(url.split("/").pop() ?? "");
        return new Response(null, { status: 204 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    let callIdx = 0;
    class MockSuiteXHR {
      withCredentials = false;
      timeout = 0;
      status = 201;
      responseText = "";
      upload = { onprogress: null, onload: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send(body: FormData) {
        const mode = String(body.get("secret_mode") ?? "auto");
        secretModesPosted.push(mode);
        const rid = runIds[callIdx++];
        this.responseText = JSON.stringify({
          ...SAMPLE_RUN_SUMMARY,
          run_id: rid,
          secret_source: mode === "ephemeral" ? "ephemeral" : "configured",
        });
        this.onload?.();
      }
    }
    globalThis.XMLHttpRequest = MockSuiteXHR as unknown as typeof XMLHttpRequest;

    const user = userEvent.setup();
    renderLab();

    // Empty state before execution
    expect(screen.getByText("No live determinism run executed")).toBeInTheDocument();
    expect(screen.getByText("No backend verification history endpoint exists in Phase 2A")).toBeInTheDocument();

    // Test interactive Format Validator rejecting Phase 1D all-digit vector PSN-975397
    expect(screen.getByTestId("format-check-badge")).toHaveTextContent("REJECTED");
    expect(screen.getByText(/ALL_DIGIT_NUMERIC_COLLISION/i)).toBeInTheDocument();

    // Run full suite
    await user.click(screen.getByRole("button", { name: /Run Cryptographic Verification/i }));

    await waitFor(() => {
      expect(screen.getByTestId("verification-scenarios-grid")).toBeInTheDocument();
    });

    expect(secretModesPosted).toEqual(["configured", "configured", "ephemeral"]);
    expect(deletedIds).toEqual(runIds);

    const detPanel = screen.getByTestId("scenario-determinism");
    expect(within(detPanel).getByText("VERIFIED")).toBeInTheDocument();
    expect(within(detPanel).getAllByText("MATCH")).toHaveLength(3);

    const crossPanel = screen.getByTestId("scenario-cross-secret");
    expect(within(crossPanel).getByText("VERIFIED")).toBeInTheDocument();
    expect(within(crossPanel).getAllByText("DISTINCT")).toHaveLength(3);

    // Zero secret leakage in DOM or browser storage
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("handles unset RAKSHA_SECRET, invalid API responses, and backend offline states gracefully", async () => {
    const runIds = ["eeeeeeeeeeeeeeee", "ffffffffffffffff"];
    let callIdx = 0;

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/health") {
        return new Response(
          JSON.stringify({
            status: "ok",
            provenance: "LIVE",
            engine_tag: "phase-1e-v1",
            engine_version: "1.0.0",
            stdlib_stage1: true,
            offline_mode: true,
            secret_configured: false,
            active_runs: 0,
            retained_runs: 0,
            max_concurrent_runs: 2,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "/api/csrf") {
        return new Response(
          JSON.stringify({ csrf_token: "csrf.tok", header_name: "X-CSRF-Token" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith(`/api/runs/${runIds[0]}/records`)) {
        return new Response(JSON.stringify(makeRecs(runIds[0], ["PSN-7JNJ5S"])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith(`/api/runs/${runIds[1]}/records`)) {
        return new Response(JSON.stringify(makeRecs(runIds[1], ["PSN-9G98B7"])), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    class UnconfiguredSecretXHR {
      withCredentials = false;
      timeout = 0;
      status = 201;
      responseText = "";
      upload = { onprogress: null, onload: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send() {
        const rid = runIds[callIdx++];
        this.responseText = JSON.stringify({
          ...SAMPLE_RUN_SUMMARY,
          run_id: rid,
          secret_source: "ephemeral",
        });
        this.onload?.();
      }
    }
    globalThis.XMLHttpRequest = UnconfiguredSecretXHR as unknown as typeof XMLHttpRequest;

    const user = userEvent.setup();
    renderLab();

    await waitFor(() => {
      expect(screen.getByText(/Server Secret Unset/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Run Cryptographic Verification/i }));

    await waitFor(() => {
      expect(screen.getByTestId("scenario-determinism")).toBeInTheDocument();
    });
    expect(within(screen.getByTestId("scenario-determinism")).getByText("BLOCKED")).toBeInTheDocument();
    expect(within(screen.getByTestId("scenario-cross-secret")).getByText("VERIFIED")).toBeInTheDocument();

    // Simulate invalid schema response / offline backend -> displays ErrorState cleanly
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    await user.click(screen.getByRole("button", { name: /Run Cryptographic Verification/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/NETWORK_UNREACHABLE/i);
    });
    expect(screen.queryByTestId("verification-scenarios-grid")).not.toBeInTheDocument();
  });
});
