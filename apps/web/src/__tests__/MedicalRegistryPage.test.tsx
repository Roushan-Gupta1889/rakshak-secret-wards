import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MedicalRegistryPage } from "@/pages/MedicalRegistryPage";
import { useRunStore } from "@/stores/runStore";
import { SAMPLE_RUN_SUMMARY } from "@/test/fixtures";

function renderRegistry() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MedicalRegistryPage />
    </QueryClientProvider>,
  );
}

function buildMultiRunFixtures() {
  const run1Id = "11111111aaaaaaaa";
  const run2Id = "22222222bbbbbbbb";

  const csvRows = [
    "uhid,age_sex,department,hospital,diagnosis,admission_date,discharge_date",
    "PSN-AAAAAA,45-49/M,Cardiology,Arogya Seva Sadan,Hypertension (I10),2026-02-01,2026-02-05",
    "PSN-BBBBBB,25-29/F,Surgery,Sanjeevani Hospital,Appendicitis,2026-03-10,2026-03-14",
    "PSN-CCCCCC,65-69/M,Cardiology,Arogya Seva Sadan,Diabetes Type 2,2026-04-01,2026-04-04",
    "PSN-DDDDDD,10-14/F,Pediatrics,Sanjeevani Hospital,Dengue Fever,2026-05-01,2026-05-06",
    "PSN-EEEEEE,85+/M,Medicine,Arogya Seva Sadan,Hypertension (I10),2026-05-10,2026-05-12",
    "PSN-FFFFFF,30-34/F,Obstetrics,Jeevan Jyoti Hospital,Anaemia,2026-06-01,2026-06-03",
    "PSN-GGGGGG,50-54/M,Medicine,Arogya Seva Sadan,COPD,2026-06-05,2026-06-09",
    "PSN-HHHHHH,40-44/F,Surgery,Sanjeevani Hospital,Cholecystitis,2026-07-01,2026-07-04",
    "PSN-JJJJJJ,20-24/M,Orthopedics,Jeevan Jyoti Hospital,Radius Fracture,2026-07-12,2026-07-15",
    "PSN-KKKKKK,55-59/F,Cardiology,Arogya Seva Sadan,Arrhythmia,2026-08-01,2026-08-04",
    "PSN-MMMMMM,70-74/M,Medicine,Sanjeevani Hospital,Typhoid Fever,2026-08-10,2026-08-18",
  ];

  const run1Summary = {
    ...SAMPLE_RUN_SUMMARY,
    run_id: run1Id,
    files: [
      {
        input_sha256: "a".repeat(64),
        output: "sanitized/ward.csv",
        status: "sanitized" as const,
        reason: null,
        size_bytes: 900,
      },
    ],
  };

  const run1Records = csvRows.slice(1).map((line, index) => ({
    index,
    file: "sanitized/ward.csv",
    loc: `row:${index}`,
    patient: line.split(",")[0],
    status: "generalized",
    preview: `SHOULD_NEVER_DISPLAY_PREVIEW_${index}`,
  }));

  const run2Summary = {
    ...SAMPLE_RUN_SUMMARY,
    run_id: run2Id,
    files: [
      {
        input_sha256: "f".repeat(64),
        output: "sanitized/sparse.csv",
        status: "sanitized" as const,
        reason: null,
        size_bytes: 200,
      },
    ],
  };

  const run2Csv = "uhid,diagnosis\nPSN-ZZZZ99,Migraine\n";
  const run2Records = [
    {
      index: 0,
      file: "sanitized/sparse.csv",
      loc: "row:0",
      patient: "PSN-ZZZZ99",
      status: null,
      preview: "SPARSE_PREVIEW_IGNORED",
    },
  ];

  return {
    run1Id,
    run2Id,
    run1Summary,
    run1Csv: csvRows.join("\n"),
    run1Records,
    run2Summary,
    run2Csv,
    run2Records,
  };
}

describe("MedicalRegistryPage exploration, filtering, sorting, pagination & privacy", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useRunStore.getState().clearActiveRunView();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("renders honest empty state when no run is active and persists no fabricated records", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      if (String(input) === "/api/health") {
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
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    renderRegistry();

    expect(screen.getByText("No active sanitization run selected")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.getItem("rakshak.session_run_id")).toBeNull();
  });

  it("supports listing, search, dynamic attribute filters, sorting, pagination, detail view, and run switching", async () => {
    const fx = buildMultiRunFixtures();

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
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
            retained_runs: 2,
            max_concurrent_runs: 2,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/api/runs/${fx.run1Id}`) {
        return new Response(JSON.stringify(fx.run1Summary), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith(`/api/runs/${fx.run1Id}/records`)) {
        return new Response(
          JSON.stringify({
            provenance: "DERIVED",
            run_id: fx.run1Id,
            total: fx.run1Records.length,
            page: 1,
            page_size: 100,
            items: fx.run1Records,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/api/runs/${fx.run1Id}/files/sanitized/ward.csv`) {
        return new Response(fx.run1Csv, { status: 200 });
      }
      if (url === `/api/runs/${fx.run2Id}`) {
        return new Response(JSON.stringify(fx.run2Summary), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith(`/api/runs/${fx.run2Id}/records`)) {
        return new Response(
          JSON.stringify({
            provenance: "DERIVED",
            run_id: fx.run2Id,
            total: fx.run2Records.length,
            page: 1,
            page_size: 100,
            items: fx.run2Records,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/api/runs/${fx.run2Id}/files/sanitized/sparse.csv`) {
        return new Response(fx.run2Csv, { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    useRunStore.getState().setActiveRun(fx.run1Summary);
    const user = userEvent.setup();
    renderRegistry();

    // Wait for records table (11 rows, page size 10 -> Page 1 / 2)
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
    expect(within(screen.getByRole("table")).getByText("PSN-AAAAAA")).toBeInTheDocument();
    expect(screen.getByText("Page 1 / 2")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("SHOULD_NEVER_DISPLAY_PREVIEW");

    // Verify no medical records stored in localStorage/sessionStorage (only 16-hex run_id)
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.getItem("rakshak.session_run_id")).toBe(fx.run1Id);

    // Pagination Next -> page 2 shows 11th row PSN-MMMMMM
    await user.click(screen.getByRole("button", { name: /Next/i }));
    expect(within(screen.getByRole("table")).getByText("PSN-MMMMMM")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Prev/i }));

    // Sorting by Age Band ascending -> pediatric "10-14" comes first before "20-24" and "85+"
    await user.click(screen.getByRole("button", { name: /Age Band/i }));
    const bodyRows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("PSN-DDDDDD");
    expect(bodyRows[0]).toHaveTextContent("10-14");

    // Select a row -> inspect RecordDetailPanel
    await user.click(within(screen.getByRole("table")).getByText("PSN-DDDDDD"));
    const detail = screen.getByTestId("record-detail-panel");
    expect(within(detail).getAllByText("PSN-DDDDDD").length).toBeGreaterThanOrEqual(1);
    expect(within(detail).getAllByText("Pediatrics").length).toBeGreaterThanOrEqual(1);
    expect(within(detail).getByText(/not globally unique/i)).toBeInTheDocument();

    // Facet filtering by Department + Pseudonym Search
    await user.selectOptions(screen.getByLabelText("Department"), "Cardiology");
    expect(screen.getByText("Showing 3 / 11 records")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search by pseudonym"), "PSN-CCCCCC");
    expect(screen.getByText("Showing 1 / 11 records")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("PSN-CCCCCC")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Clear Filters/i }));
    expect(screen.getByText("Showing 11 / 11 records")).toBeInTheDocument();

    // Run switching to sparse dataset (missing gender, age, dept, hospital)
    await user.type(screen.getByLabelText("Retrieve run ID"), fx.run2Id);
    await user.click(screen.getByRole("button", { name: /Load Run/i }));

    await waitFor(() => {
      expect(within(screen.getByRole("table")).getByText("PSN-ZZZZ99")).toBeInTheDocument();
    });
    // Missing facet selects must NOT render when dataset lacks those attributes
    expect(screen.queryByLabelText("Department")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hospital")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Gender")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Age Range")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Diagnosis")).toBeInTheDocument();

    // Detail panel explicitly displays "Not available" for missing attributes
    const sparseDetail = screen.getByTestId("record-detail-panel");
    expect(within(sparseDetail).getAllByText("Not available").length).toBeGreaterThanOrEqual(4);
  });

  it("handles invalid API schema responses, empty index runs, and backend offline states gracefully", async () => {
    const emptyRunId = "33333333cccccccc";
    const badSchemaRunId = "44444444dddddddd";

    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === "/api/health") {
        throw new TypeError("Failed to fetch");
      }
      if (url === `/api/runs/${emptyRunId}`) {
        return new Response(JSON.stringify({ ...SAMPLE_RUN_SUMMARY, run_id: emptyRunId, files: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith(`/api/runs/${emptyRunId}/records`)) {
        return new Response(
          JSON.stringify({
            provenance: "DERIVED",
            run_id: emptyRunId,
            total: 0,
            page: 1,
            page_size: 100,
            items: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/api/runs/${badSchemaRunId}`) {
        return new Response(JSON.stringify({ ...SAMPLE_RUN_SUMMARY, run_id: badSchemaRunId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith(`/api/runs/${badSchemaRunId}/records`)) {
        return new Response(JSON.stringify({ corrupted: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    useRunStore.getState().setActiveRun({ ...SAMPLE_RUN_SUMMARY, run_id: emptyRunId, files: [] });
    const user = userEvent.setup();
    renderRegistry();

    await waitFor(() => {
      expect(screen.getByText(/Local API adapter unreachable/i)).toBeInTheDocument();
      expect(screen.getByText("No patient-linked records in this run")).toBeInTheDocument();
    });

    // Switch to invalid-schema response run -> shows validation error, zero fake rows
    await user.type(screen.getByLabelText("Retrieve run ID"), badSchemaRunId);
    await user.click(screen.getByRole("button", { name: /Load Run/i }));

    await waitFor(() => {
      expect(screen.getByText("Failed to build sanitized registry")).toBeInTheDocument();
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
