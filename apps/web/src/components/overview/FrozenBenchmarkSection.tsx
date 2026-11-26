import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { History, Search, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useBenchmarkQuery } from "@/api/queries";
import { ApiRequestError } from "@/api/client";
import { EChartBox } from "@/components/charts/EChartBox";
import { KpiCard } from "@/components/common/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/state-views";
import {
  FROZEN_PHASE_1E_BASELINE_SEC_A,
  FROZEN_PROGRESSION_AUDIT_SEC_A,
  FROZEN_VERIFICATION_LEDGER,
  type FrozenCheckLedgerRow,
} from "@/data/frozenBenchmarks";
import { useUiStore } from "@/stores/uiStore";

const FilterSchema = z.object({
  query: z.string().max(48, "Filter must be 48 characters or fewer"),
});

type FilterForm = z.infer<typeof FilterSchema>;

export function FrozenBenchmarkSection() {
  const benchmarkQuery = useBenchmarkQuery();
  const { frozenProfile, setFrozenProfile } = useUiStore();
  const [ledgerFilter, setLedgerFilter] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FilterForm>({
    resolver: zodResolver(FilterSchema),
    defaultValues: { query: "" },
  });

  const phase1eAudit = FROZEN_PROGRESSION_AUDIT_SEC_A[2];
  const activeSnapshot =
    frozenProfile === "audit-sec-A" ? phase1eAudit : FROZEN_PHASE_1E_BASELINE_SEC_A;
  const baseline1c = FROZEN_PROGRESSION_AUDIT_SEC_A[0];

  const progressionOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0B1222",
        borderColor: "#334155",
        textStyle: { color: "#E2E8F0", fontSize: 12 },
      },
      legend: {
        top: 4,
        textStyle: { color: "#94A3B8", fontSize: 11 },
      },
      grid: { left: 42, right: 20, top: 52, bottom: 28 },
      xAxis: {
        type: "category",
        data: FROZEN_PROGRESSION_AUDIT_SEC_A.map((m) => m.tag),
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#CBD5E1", fontFamily: "JetBrains Mono, monospace", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        min: 65,
        max: 100,
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
        axisLabel: { color: "#94A3B8", fontSize: 11 },
      },
      series: [
        {
          name: "Composite Score",
          type: "bar",
          barMaxWidth: 26,
          itemStyle: { color: "#22D3EE", borderRadius: [3, 3, 0, 0] },
          data: FROZEN_PROGRESSION_AUDIT_SEC_A.map((m) => m.total),
        },
        {
          name: "Privacy Resistance (%)",
          type: "bar",
          barMaxWidth: 26,
          itemStyle: { color: "#10B981", borderRadius: [3, 3, 0, 0] },
          data: FROZEN_PROGRESSION_AUDIT_SEC_A.map((m) => Number((m.privacy * 100).toFixed(2))),
        },
        {
          name: "Clinical Utility (%)",
          type: "line",
          smooth: false,
          symbolSize: 7,
          lineStyle: { width: 2, color: "#94A3B8" },
          itemStyle: { color: "#E2E8F0" },
          data: FROZEN_PROGRESSION_AUDIT_SEC_A.map((m) => Number((m.utility * 100).toFixed(2))),
        },
      ],
    }),
    [],
  );

  const attackOption = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0B1222",
        borderColor: "#334155",
        textStyle: { color: "#E2E8F0", fontSize: 12 },
      },
      legend: {
        top: 4,
        textStyle: { color: "#94A3B8", fontSize: 11 },
      },
      grid: { left: 46, right: 20, top: 40, bottom: 28 },
      xAxis: {
        type: "category",
        data: ["A1 Direct", "A2/A3 Link", "A4 Re-id", "A5 Target", "A6 Invert", "A7 Cross"],
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#CBD5E1", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 1,
        interval: 0.2,
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
        axisLabel: { color: "#94A3B8", fontSize: 11 },
      },
      series: [
        {
          name: "phase-1c-v1 Risk",
          type: "bar",
          barMaxWidth: 22,
          itemStyle: { color: "rgba(245, 158, 11, 0.72)", borderRadius: [3, 3, 0, 0] },
          data: [baseline1c.a1, baseline1c.a23, baseline1c.a4, baseline1c.a5, baseline1c.a6, baseline1c.a7],
        },
        {
          name: `phase-1e-v1 (${frozenProfile}) Risk`,
          type: "bar",
          barMaxWidth: 22,
          itemStyle: { color: "#06B6D4", borderRadius: [3, 3, 0, 0] },
          data: [
            activeSnapshot.a1,
            activeSnapshot.a23,
            activeSnapshot.a4,
            activeSnapshot.a5,
            activeSnapshot.a6,
            activeSnapshot.a7,
          ],
        },
      ],
    }),
    [activeSnapshot, baseline1c, frozenProfile],
  );

  const ledgerColumns = useMemo<ColumnDef<FrozenCheckLedgerRow, unknown>[]>(
    () => [
      {
        accessorKey: "suite",
        header: "Verifier / Suite",
        cell: (info) => (
          <span className="font-mono text-[11px] font-medium text-slate-100">
            {String(info.getValue())}
          </span>
        ),
      },
      {
        accessorKey: "evaluatorType",
        header: "Class",
        cell: (info) => <Badge>{String(info.getValue())}</Badge>,
      },
      {
        accessorKey: "resultSummary",
        header: "Verified Result",
        cell: (info) => (
          <span className="font-mono text-[11px] text-cyan-200">{String(info.getValue())}</span>
        ),
      },
      {
        accessorKey: "contextNote",
        header: "Scope & Conditions",
        cell: (info) => <span className="text-slate-400">{String(info.getValue())}</span>,
      },
      {
        accessorKey: "provenance",
        header: "Provenance",
        cell: () => <ProvenanceBadge kind="FROZEN" />,
      },
    ],
    [],
  );

  const filteredLedger = useMemo(() => {
    const q = ledgerFilter.trim().toLowerCase();
    if (!q) return FROZEN_VERIFICATION_LEDGER;
    return FROZEN_VERIFICATION_LEDGER.filter(
      (row) =>
        row.suite.toLowerCase().includes(q) ||
        row.evaluatorType.toLowerCase().includes(q) ||
        row.resultSummary.toLowerCase().includes(q) ||
        row.contextNote.toLowerCase().includes(q),
    );
  }, [ledgerFilter]);

  const apiBenchmarkStatus = (() => {
    if (benchmarkQuery.isLoading) return "Probing GET /api/analytics/benchmark...";
    if (benchmarkQuery.data) return "GET /api/analytics/benchmark · LIVE 200";
    if (benchmarkQuery.error instanceof ApiRequestError && benchmarkQuery.error.status === 404) {
      return "GET /api/analytics/benchmark · HTTP 404 (Not Implemented in Phase 2A)";
    }
    return "GET /api/analytics/benchmark · Unavailable (API Offline / Error)";
  })();

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Frozen Phase 1E Verification Benchmark"
        subtitle="Historical audit results from frozen Phase 1E technical reports and local simulator evaluations — never presented as live run scores or official hidden-data grading."
        provenance="FROZEN"
        provenanceLabel="FROZEN · HISTORICAL PHASE 1E"
        rightSlot={
          <div className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#090F1D] p-1">
            <Button
              size="sm"
              variant={frozenProfile === "audit-sec-A" ? "primary" : "ghost"}
              onClick={() => setFrozenProfile("audit-sec-A")}
            >
              audit-sec-A
            </Button>
            <Button
              size="sm"
              variant={frozenProfile === "baseline-sec-A" ? "primary" : "ghost"}
              onClick={() => setFrozenProfile("baseline-sec-A")}
            >
              baseline-sec-A
            </Button>
          </div>
        }
      />

      {/* Honest API Boundary Disclosure Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2 text-amber-200">
          <History className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            Showing <strong className="font-semibold">FROZEN</strong> static Phase 1E audit baseline (
            <code className="font-mono text-amber-300">b5c258a</code>, secret profile{" "}
            <code className="font-mono text-amber-300">{activeSnapshot.secretContext}</code>).
          </span>
        </div>
        <span className="font-mono text-[11px] text-amber-300/90">{apiBenchmarkStatus}</span>
      </div>

      {/* Historical Snapshot KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Simulator Composite"
          value={activeSnapshot.total.toFixed(2)}
          sublabel="eval_arena.py / 100 pts"
          provenance="FROZEN"
          tone="amber"
          icon={<ShieldCheck className="h-4 w-4 text-amber-300" />}
        />
        <KpiCard
          label="Privacy Resistance"
          value={`${(activeSnapshot.privacy * 100).toFixed(2)}%`}
          sublabel={`A4=${activeSnapshot.a4.toFixed(4)} · PT35/46=${activeSnapshot.trapPt35.toFixed(4)}`}
          provenance="FROZEN"
          tone="amber"
        />
        <KpiCard
          label="LF-Exact PII Leaks"
          value="0 / 3,230"
          sublabel="check_dev.py (200/200 LF SHAs)"
          provenance="FROZEN"
          tone="amber"
        />
        <KpiCard
          label="Clinical & Integrity"
          value="4,763 / 4,855"
          sublabel={`0 false merges · FHIR ${activeSnapshot.fhirValid} · Chaos ${activeSnapshot.chaosPass}`}
          provenance="FROZEN"
          tone="amber"
        />
      </div>

      {/* ECharts Row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>Stage 1 Optimization Progression (audit-sec-A)</PanelTitle>
              <PanelDescription>
                Composite score & privacy-vs-utility progression across frozen tags 1C → 1D → 1E
              </PanelDescription>
            </div>
            <ProvenanceBadge kind="FROZEN" />
          </PanelHeader>
          <PanelContent>
            <EChartBox option={progressionOption} height={270} />
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader>
            <div>
              <PanelTitle>A1–A7 Simulated Attack Risk Reduction</PanelTitle>
              <PanelDescription>
                Lower risk is stronger · Comparing phase-1c-v1 against phase-1e-v1 ({frozenProfile})
              </PanelDescription>
            </div>
            <ProvenanceBadge kind="FROZEN" />
          </PanelHeader>
          <PanelContent>
            <EChartBox option={attackOption} height={270} />
          </PanelContent>
        </Panel>
      </div>

      {/* Verification Ledger (TanStack Table + RHF/Zod Filter) */}
      <Panel>
        <PanelHeader className="items-center">
          <div>
            <PanelTitle>Phase 1E Verification & Audit Ledger</PanelTitle>
            <PanelDescription>
              Reconciled outputs across official submission checks, LF-exact dev checks, and attacker simulator runs
            </PanelDescription>
          </div>

          <form
            onSubmit={handleSubmit((v) => setLedgerFilter(v.query))}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter ledger..."
                aria-label="Filter frozen verification ledger"
                {...register("query", {
                  onChange: (e) => setLedgerFilter(String(e.target.value)),
                })}
                className="h-7.5 w-48 rounded-md border border-slate-700/80 bg-[#070B14] pr-2.5 pl-8 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
              />
            </div>
            {errors.query ? (
              <span className="text-[11px] text-red-400">{errors.query.message}</span>
            ) : null}
          </form>
        </PanelHeader>
        <PanelContent>
          <DataTable
            data={filteredLedger}
            columns={ledgerColumns}
            emptyTitle="No matching verification records"
            emptyDescription="Clear the search filter to inspect all Phase 1E audit records."
          />
        </PanelContent>
      </Panel>
    </div>
  );
}
