import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RiskAnalyticsPage } from "@/pages/RiskAnalyticsPage";
import { useRunStore } from "@/stores/runStore";

function renderAnalyticsPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RiskAnalyticsPage />
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
  retained_runs: 1,
  max_concurrent_runs: 2,
};

const POLICY_OK = {
  provenance: "LIVE",
  policy_sha256: "e".repeat(64),
  policy: {
    privacy_mode: "adaptive_k_mixed",
    min_group_size: 5,
    age_band_years: 5,
    date_shift_max_days: 180,
  },
};

const SAMPLE_SUMMARY = {
  run_id: "1111222233334444",
  created_at: "2026-11-27T00:00:00Z",
  expires_at: "2026-11-27T01:00:00Z",
  status: "completed",
  secret_source: "configured",
  provenance: "LIVE",
  schema_version: "raksha-report/1",
  counts: {
    files_total: 2,
    files_sanitized: 1,
    files_quarantined: 1,
    records_processed: 3,
    identifiers_detected: 9,
    records_linked: 3,
    records_generalized: 1,
    records_suppressed: 0,
    records_quarantined: 0,
  },
  entities: { PATIENT_NAME: 3, PHONE: 3, DISTRICT: 1 },
  timing: { seconds: 0.72 },
  resources: { peak_rss_mb: 29.4 },
  files: [
    { input_sha256: "a".repeat(64), output: "sanitized/cohort.csv", status: "sanitized", reason: null, size_bytes: 280 },
    { input_sha256: "b".repeat(64), output: null, status: "quarantined", reason: "unsupported_format", size_bytes: 40 },
  ],
  placeholder_summary: {
    provenance: "DERIVED",
    counts: { NAME: 3, PHONE: 3, DISTRICT: 1, PSN: 3 },
    psn_count: 3,
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
    suppressed_dob_markers: 1,
    suppressed_age_markers: 0,
  },
};

const SAMPLE_CSV = [
  "patient_ref,age_band,gender,district,pin_code,diagnosis,medication,admission_date,discharge_date",
  "PSN-AAAAAA,45-49,M,Lucknow,226***,Type 2 diabetes,Metformin,2026-01-10,2026-01-13",
  "PSN-BBBBBB,45-49,M,Lucknow,226***,Type 2 diabetes,Metformin,2026-02-02,2026-02-05",
  "PSN-CCCCCC,[AGE],M,[DISTRICT],[PIN],Visceral leishmaniasis,Amphotericin B,2026-03-01,2026-03-04",
].join("\n");

describe("RiskAnalyticsPage end-to-end provenance & cohort verification", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useRunStore.getState().clearActiveRunView();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("shows honest empty state without run, toggles frozen secret profiles, and hydrates live telemetry on run lookup", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/health") {
        return new Response(JSON.stringify(HEALTH_OK), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/policy") {
        return new Response(JSON.stringify(POLICY_OK), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/runs/1111222233334444") {
        return new Response(JSON.stringify(SAMPLE_SUMMARY), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/runs/1111222233334444/records")) {
        return new Response(
          JSON.stringify({
            provenance: "DERIVED",
            run_id: "1111222233334444",
            total: 3,
            page: 1,
            page_size: 100,
            items: [
              { index: 0, file: "sanitized/cohort.csv", loc: "row:0", patient: "PSN-AAAAAA", status: "sanitized", preview: "" },
              { index: 1, file: "sanitized/cohort.csv", loc: "row:1", patient: "PSN-BBBBBB", status: "sanitized", preview: "" },
              { index: 2, file: "sanitized/cohort.csv", loc: "row:2", patient: "PSN-CCCCCC", status: "generalized", preview: "" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/runs/1111222233334444/files/sanitized/cohort.csv")) {
        return new Response(SAMPLE_CSV, { status: 200, headers: { "Content-Type": "text/plain" } });
      }
      return new Response("Not Found", { status: 404 });
    });

    const user = userEvent.setup();
    renderAnalyticsPage();

    // Honest no-run empty state + UNAVAILABLE + FROZEN disclosure
    await waitFor(() => {
      expect(screen.getByText(/No active sanitization run loaded for live risk distributions/i)).toBeInTheDocument();
    });
    const attackSection = screen.getByTestId("attack-analysis-section");
    expect(within(attackSection).getByText("2.84%")).toBeInTheDocument();
    expect(within(attackSection).getByText(/A1–A5 LIVE ORACLE UNAVAILABLE/i)).toBeInTheDocument();

    // Toggle frozen simulator secret profile
    await user.click(within(attackSection).getByRole("button", { name: "baseline-sec-A" }));
    expect(within(attackSection).getByText("11.61%")).toBeInTheDocument();

    // Load retained 16-hex run ID via lookup
    const lookup = screen.getByLabelText("Retained run identifier lookup");
    await user.type(lookup, "1111222233334444");
    await user.click(screen.getByRole("button", { name: /Load Run Telemetry/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/PSN-CCCCCC/).length).toBeGreaterThanOrEqual(1);
    });

    const overviewSection = screen.getByTestId("risk-overview-section");
    expect(within(overviewSection).getByText("0.33 ops / record (N=3)")).toBeInTheDocument();
    expect(within(overviewSection).getByText("50.0%")).toBeInTheDocument();
    expect(within(overviewSection).getByText(/UNAVAILABLE · NO ORACLE/i)).toBeInTheDocument();

    // Rare disease condition string should NOT appear in cohort diagnostic table (no raw diagnosis pairing leak)
    const cohortSection = screen.getByTestId("reidentification-cohort-section");
    expect(within(cohortSection).getByText("PSN-CCCCCC")).toBeInTheDocument();
    expect(within(cohortSection).queryByText(/Visceral leishmaniasis/i)).not.toBeInTheDocument();
    expect(within(cohortSection).getByText(/Batch-Unique \(1\)/i)).toBeInTheDocument();

    // Utility section explicitly marks Live Clinical Probe Recall UNAVAILABLE
    const utilitySection = screen.getByTestId("utility-privacy-section");
    expect(within(utilitySection).getByText(/Live Medical Probe Recall/i)).toBeInTheDocument();

    // Verify localStorage untouched
    expect(window.localStorage.length).toBe(0);
  });

  it("renders offline API banner gracefully without crashing when local adapter is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    renderAnalyticsPage();
    await waitFor(() => {
      expect(screen.getByText(/Local API adapter unreachable/i)).toBeInTheDocument();
    });
    // Frozen findings & ATTACKS.md matrix still remain viewable safely
    expect(screen.getByTestId("attack-analysis-section")).toBeInTheDocument();
  });
});
