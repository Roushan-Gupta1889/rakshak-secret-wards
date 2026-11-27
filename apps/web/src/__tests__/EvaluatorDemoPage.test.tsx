import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleLayout } from "@/layouts/ConsoleLayout";
import { EvaluatorDemoPage } from "@/pages/EvaluatorDemoPage";
import { useRunStore } from "@/stores/runStore";
import { useUiStore } from "@/stores/uiStore";

function renderDemoWithShell() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ConsoleLayout>
        <EvaluatorDemoPage />
      </ConsoleLayout>
    </QueryClientProvider>,
  );
}

const HEALTH_OK = {
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
};

const DEMO_SUMMARY = {
  run_id: "fedcba9876543210",
  created_at: "2026-11-27T00:00:00Z",
  expires_at: "2026-11-27T01:00:00Z",
  status: "completed",
  secret_source: "configured",
  provenance: "LIVE",
  schema_version: "raksha-report/1",
  counts: {
    files_total: 6,
    files_sanitized: 5,
    files_quarantined: 1,
    records_processed: 12,
    identifiers_detected: 42,
    records_linked: 12,
    records_generalized: 10,
    records_suppressed: 0,
    records_quarantined: 0,
  },
  entities: { PATIENT_NAME: 42 },
  timing: { seconds: 0.55 },
  resources: { peak_rss_mb: 30.2 },
  files: [
    { input_sha256: "a".repeat(64), output: "sanitized/syn_ward_reg_en.csv", status: "sanitized", reason: null, size_bytes: 900 },
    { input_sha256: "b".repeat(64), output: null, status: "quarantined", reason: "processing_failed", size_bytes: 70 },
  ],
  placeholder_summary: {
    provenance: "DERIVED",
    counts: { PSN: 12, NAME: 12, PHONE: 10 },
    psn_count: 7,
    all_alpha_psn_valid: true,
  },
  fhir_validation: {
    provenance: "DERIVED",
    bundles_total: 1,
    bundles_valid: 1,
    bundles_invalid: 0,
  },
  cohort_summary: {
    provenance: "DERIVED",
    generalized_district_markers: 2,
    suppressed_pin_markers: 2,
    suppressed_dob_markers: 2,
    suppressed_age_markers: 0,
  },
};

describe("EvaluatorDemoPage walkthrough, live demo execution & readiness", () => {
  const origFetch = globalThis.fetch;
  const origXhr = globalThis.XMLHttpRequest;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useRunStore.getState().clearActiveRunView();
    useUiStore.setState({
      activePage: "demo",
      demoBarOpen: false,
      activeDemoStep: 1,
      completedDemoSteps: [],
    });
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    globalThis.XMLHttpRequest = origXhr;
  });

  it("inspects synthetic batch, executes real CSRF-protected demo pipeline, pins walkthrough bar, and deletes run cleanly", async () => {
    const deletedRuns: string[] = [];

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url === "/api/health") {
        return new Response(JSON.stringify(HEALTH_OK), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/csrf") {
        return new Response(JSON.stringify({ csrf_token: "csrf.demo", header_name: "X-CSRF-Token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `/api/runs/${DEMO_SUMMARY.run_id}` && method === "DELETE") {
        deletedRuns.push(DEMO_SUMMARY.run_id);
        return new Response(null, { status: 204 });
      }
      return new Response("Not Found", { status: 404 });
    });

    class MockXhr {
      status = 201;
      responseText = JSON.stringify(DEMO_SUMMARY);
      withCredentials = false;
      timeout = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      upload = {
        addEventListener: vi.fn(),
        onprogress: null as ((ev: ProgressEvent) => void) | null,
        onload: null as (() => void) | null,
      };
      listeners: Record<string, () => void> = {};
      open = vi.fn();
      setRequestHeader = vi.fn();
      addEventListener = vi.fn((ev: string, cb: () => void) => {
        this.listeners[ev] = cb;
      });
      send = vi.fn(() => {
        this.upload.onload?.();
        this.onload?.();
        this.listeners["load"]?.();
      });
    }
    globalThis.XMLHttpRequest = MockXhr as unknown as typeof XMLHttpRequest;

    const user = userEvent.setup();
    renderDemoWithShell();

    expect(screen.getByText(/SYNTHETIC DEMONSTRATION DATASET/i)).toBeInTheDocument();
    expect(screen.queryByTestId("evaluator-guide-bar")).not.toBeInTheDocument();

    // Preview Hindi TSV synthetic fixture
    const inspectButtons = screen.getAllByRole("button", { name: /Inspect Fixture/i });
    await user.click(inspectButtons[1]);
    expect(screen.getByTestId("synthetic-source-preview")).toHaveTextContent("आरव कुमार");

    // Pin non-intrusive Guide Bar
    await user.click(screen.getByRole("button", { name: /Pin Walkthrough Bar/i }));
    expect(screen.getByTestId("evaluator-guide-bar")).toBeInTheDocument();

    // Execute live demo pipeline
    await user.click(screen.getByRole("button", { name: /Run Synthetic Demo Pipeline \(6 Files\)/i }));

    await waitFor(() => {
      expect(screen.getByTestId("live-demo-run-card")).toBeInTheDocument();
    });

    const card = screen.getByTestId("live-demo-run-card");
    expect(within(card).getByText("5 / 6")).toBeInTheDocument();
    expect(within(card).getByText("12 / 12")).toBeInTheDocument();
    expect(within(card).getByText("PASS")).toBeInTheDocument();

    // Steps 2 & 3 auto-marked complete
    expect(screen.getByText("2 / 10 VERIFIED")).toBeInTheDocument();

    // Cleanly delete demo run from backend
    await user.click(within(card).getByRole("button", { name: /Delete Run/i }));
    await waitFor(() => {
      expect(deletedRuns).toEqual([DEMO_SUMMARY.run_id]);
    });

    // Readiness explicitly shows confidential competition score unpublished
    const readiness = screen.getByTestId("submission-readiness-section");
    expect(within(readiness).getByText(/Official Hidden-Dataset Competition Score/i)).toBeInTheDocument();
    expect(within(readiness).getByText(/Not yet published/i)).toBeInTheDocument();

    expect(window.localStorage.length).toBe(0);
  });

  it("handles offline API cleanly without fake run completion", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    renderDemoWithShell();
    await waitFor(() => {
      expect(screen.getByText(/Local API adapter unreachable/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("live-demo-run-card")).not.toBeInTheDocument();
  });
});
