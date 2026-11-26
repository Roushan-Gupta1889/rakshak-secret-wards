import { ArrowRight, Clock, Database, FileCheck2, Files, ScanSearch, ShieldBan } from "lucide-react";
import { useHealthQuery } from "@/api/queries";
import { KpiCard } from "@/components/common/KpiCard";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeader } from "@/components/ui/state-views";
import { useRunStore } from "@/stores/runStore";
import { useUiStore } from "@/stores/uiStore";

export function CoreKpisSection() {
  const healthQuery = useHealthQuery();
  const health = healthQuery.data?.data;
  const activeRun = useRunStore((s) => s.activeRun);
  const setActivePage = useUiStore((s) => s.setActivePage);

  const loading = healthQuery.isLoading;
  const retainedRuns = health?.retained_runs ?? 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Core Sanitization Run KPIs"
        subtitle="Live job execution counters. Values populate strictly from actual run responses—never simulated."
        provenance={activeRun ? "LIVE" : "EMPTY"}
        provenanceLabel={activeRun ? `LIVE · RUN ${activeRun.run_id.slice(0, 8)}` : "NO ACTIVE RUN LOADED"}
        rightSlot={
          <Button size="sm" variant="secondary" onClick={() => setActivePage("studio")}>
            Open Sanitization Studio
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Total Processed Files"
          value={activeRun ? String(activeRun.counts.files_total) : "—"}
          sublabel={
            activeRun
              ? `Run ${activeRun.run_id.slice(0, 8)}`
              : retainedRuns > 0
                ? `${retainedRuns} retained in API`
                : "Awaiting run"
          }
          provenance={activeRun ? "LIVE" : "EMPTY"}
          provenanceLabel={activeRun ? "LIVE" : "NO RUN SELECTED"}
          icon={<Files className="h-4 w-4" />}
          loading={loading}
          tone={activeRun ? "cyan" : "neutral"}
        />
        <KpiCard
          label="Sanitized Files"
          value={activeRun ? String(activeRun.counts.files_sanitized) : "—"}
          sublabel="Exported clean tree"
          provenance={activeRun ? "LIVE" : "EMPTY"}
          provenanceLabel={activeRun ? "LIVE" : "NO RUN SELECTED"}
          icon={<FileCheck2 className="h-4 w-4" />}
          loading={loading}
          tone={activeRun ? "emerald" : "neutral"}
        />
        <KpiCard
          label="Quarantined Files"
          value={activeRun ? String(activeRun.counts.files_quarantined) : "—"}
          sublabel="Isolated broken inputs"
          provenance={activeRun ? "LIVE" : "EMPTY"}
          provenanceLabel={activeRun ? "LIVE" : "NO RUN SELECTED"}
          icon={<ShieldBan className="h-4 w-4" />}
          loading={loading}
          tone={activeRun && activeRun.counts.files_quarantined > 0 ? "amber" : "neutral"}
        />
        <KpiCard
          label="Records Processed"
          value={activeRun ? String(activeRun.counts.records_processed) : "—"}
          sublabel="records.jsonl units"
          provenance={activeRun ? "LIVE" : "EMPTY"}
          provenanceLabel={activeRun ? "LIVE" : "NO RUN SELECTED"}
          icon={<Database className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          label="Identifiers Detected"
          value={activeRun ? String(activeRun.counts.identifiers_detected) : "—"}
          sublabel="Scrubbed PII mentions"
          provenance={activeRun ? "LIVE" : "EMPTY"}
          provenanceLabel={activeRun ? "LIVE" : "NO RUN SELECTED"}
          icon={<ScanSearch className="h-4 w-4" />}
          loading={loading}
          tone={activeRun ? "cyan" : "neutral"}
        />
        <KpiCard
          label="Processing Time"
          value={activeRun ? `${activeRun.timing.seconds.toFixed(2)}s` : "—"}
          sublabel="Subprocess wall time"
          provenance={activeRun ? "LIVE" : "EMPTY"}
          provenanceLabel={activeRun ? "LIVE" : "NO RUN SELECTED"}
          icon={<Clock className="h-4 w-4" />}
          loading={loading}
        />
      </div>

      {!activeRun ? (
        <EmptyState
          title="No live sanitization run selected in Overview"
          description={
            health
              ? `Phase 2A API currently tracks ${health.retained_runs} retained run(s) and exposes per-run telemetry at GET /api/runs/{run_id} without an aggregate run-list endpoint. Open Sanitization Studio to submit files or load a retained run.`
              : "Connect the local API adapter to monitor runtime slots and run sanitization batches in Sanitization Studio."
          }
        />
      ) : null}
    </div>
  );
}
