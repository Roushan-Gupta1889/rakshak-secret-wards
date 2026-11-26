import { Clock, Database, FileCheck2, Files, ScanSearch, ShieldBan } from "lucide-react";
import { useHealthQuery } from "@/api/queries";
import { KpiCard } from "@/components/common/KpiCard";
import { EmptyState, SectionHeader } from "@/components/ui/state-views";

export function CoreKpisSection() {
  const healthQuery = useHealthQuery();
  const health = healthQuery.data?.data;

  const loading = healthQuery.isLoading;
  const retainedRuns = health?.retained_runs ?? 0;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Core Sanitization Run KPIs"
        subtitle="Live job execution counters. Values populate strictly from actual run responses—never simulated."
        provenance="EMPTY"
        provenanceLabel="NO ACTIVE RUN LOADED"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Total Processed Files"
          value="—"
          sublabel={retainedRuns > 0 ? `${retainedRuns} retained in API` : "Awaiting run"}
          provenance="EMPTY"
          provenanceLabel="NO RUN SELECTED"
          icon={<Files className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          label="Sanitized Files"
          value="—"
          sublabel="Exported clean tree"
          provenance="EMPTY"
          provenanceLabel="NO RUN SELECTED"
          icon={<FileCheck2 className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          label="Quarantined Files"
          value="—"
          sublabel="Isolated broken inputs"
          provenance="EMPTY"
          provenanceLabel="NO RUN SELECTED"
          icon={<ShieldBan className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          label="Records Processed"
          value="—"
          sublabel="records.jsonl units"
          provenance="EMPTY"
          provenanceLabel="NO RUN SELECTED"
          icon={<Database className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          label="Identifiers Detected"
          value="—"
          sublabel="Scrubbed PII mentions"
          provenance="EMPTY"
          provenanceLabel="NO RUN SELECTED"
          icon={<ScanSearch className="h-4 w-4" />}
          loading={loading}
        />
        <KpiCard
          label="Processing Time"
          value="—"
          sublabel="Subprocess wall time"
          provenance="EMPTY"
          provenanceLabel="NO RUN SELECTED"
          icon={<Clock className="h-4 w-4" />}
          loading={loading}
        />
      </div>

      <EmptyState
        title="No live sanitization run selected in Overview"
        description={
          health
            ? `Phase 2A API currently tracks ${health.retained_runs} retained run(s) and exposes per-run telemetry at GET /api/runs/{run_id} without an aggregate run-list endpoint. Interactive upload and run telemetry workflows launch in Phase 2C.`
            : "Connect the local API adapter to monitor runtime slots and prepare Phase 2C run execution."
        }
      />
    </div>
  );
}
