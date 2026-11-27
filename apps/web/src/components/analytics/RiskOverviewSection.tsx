import { useMemo } from "react";
import { Activity, Files, Link2, ShieldAlert, ShieldBan, ShieldCheck, Tags } from "lucide-react";
import type { PolicyResponse, RunSummaryResponse } from "@/api/schemas";
import { EChartBox } from "@/components/charts/EChartBox";
import { KpiCard } from "@/components/common/KpiCard";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState, SectionHeader } from "@/components/ui/state-views";
import type { LiveRiskOverviewMetrics } from "@/lib/riskAnalyticsAnalyzer";

export function RiskOverviewSection({
  summary,
  overview,
  policy,
  isLoadingRegistry,
}: {
  summary: RunSummaryResponse | null;
  overview: LiveRiskOverviewMetrics | null;
  policy: PolicyResponse | null;
  isLoadingRegistry: boolean;
}) {
  const entityChartOption = useMemo(() => {
    if (!overview || overview.topEntities.length === 0) return null;
    const rows = [...overview.topEntities].reverse();
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0B1222",
        borderColor: "#334155",
        textStyle: { color: "#E2E8F0", fontSize: 12 },
      },
      grid: { left: 112, right: 24, top: 14, bottom: 26 },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
        axisLabel: { color: "#94A3B8", fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: rows.map((r) => r.type),
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#CBD5E1", fontFamily: "JetBrains Mono, monospace", fontSize: 10 },
      },
      series: [
        {
          name: "Detected Mentions",
          type: "bar",
          barMaxWidth: 16,
          itemStyle: { color: "#22D3EE", borderRadius: [0, 3, 3, 0] },
          data: rows.map((r) => r.count),
        },
      ],
    };
  }, [overview]);

  const markerChartOption = useMemo(() => {
    if (!overview || overview.markerBreakdown.length === 0) return null;
    const rows = [...overview.markerBreakdown].reverse();
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0B1222",
        borderColor: "#334155",
        textStyle: { color: "#E2E8F0", fontSize: 12 },
      },
      legend: {
        bottom: 0,
        left: "center",
        itemGap: 12,
        textStyle: { color: "#94A3B8", fontSize: 11 },
      },
      grid: { left: 94, right: 24, top: 14, bottom: 64 },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
        axisLabel: { color: "#94A3B8", fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: rows.map((r) => r.marker),
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#CBD5E1", fontFamily: "JetBrains Mono, monospace", fontSize: 10 },
      },
      series: [
        {
          name: "Direct PII",
          type: "bar",
          stack: "markers",
          barMaxWidth: 16,
          itemStyle: { color: "#10B981", borderRadius: [0, 3, 3, 0] },
          data: rows.map((r) =>
            r.category === "Direct PII Redaction" ? r.count : 0,
          ),
        },
        {
          name: "QI Mask / Gen.",
          type: "bar",
          stack: "markers",
          barMaxWidth: 16,
          itemStyle: { color: "#F59E0B", borderRadius: [0, 3, 3, 0] },
          data: rows.map((r) =>
            r.category === "Quasi-Identifier Generalization / Suppression" ? r.count : 0,
          ),
        },
      ],
    };
  }, [overview]);

  const minGroupSize = policy?.policy["min_group_size"];
  const privacyMode = policy?.policy["privacy_mode"];

  return (
    <section className="space-y-4" data-testid="risk-overview-section">
      <SectionHeader
        title="1. Privacy Risk Overview"
        subtitle="Active sanitization run transformation ratios and entity detection mix alongside explicit unmeasurable live-oracle boundaries."
        provenance={overview ? "LIVE" : "EMPTY"}
        provenanceLabel={
          overview
            ? `LIVE · RUN ${overview.runId.slice(0, 8)} (N=${overview.sampleRecords})`
            : "NO ACTIVE RUN SELECTED"
        }
        rightSlot={
          policy ? (
            <Badge variant="live">
              {String(privacyMode ?? "adaptive_k_mixed")} · k={String(minGroupSize ?? 5)}
            </Badge>
          ) : null
        }
      />

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="QI Generalization Ops"
          value={overview ? String(overview.generalizationOpsCount) : "—"}
          sublabel={
            overview
              ? `${overview.generalizationPerRecord.toFixed(2)} ops / record (N=${overview.sampleRecords})`
              : "QI widening transformations"
          }
          provenance={overview ? "LIVE" : "EMPTY"}
          provenanceLabel={overview ? `LIVE · N=${overview.sampleRecords} REC` : "NO RUN"}
          icon={<Tags className="h-4 w-4" />}
          tone={overview ? "cyan" : "neutral"}
        />
        <KpiCard
          label="Suppression Rate"
          value={overview ? `${(overview.suppressionRate * 100).toFixed(1)}%` : "—"}
          sublabel={
            summary
              ? `${summary.counts.records_suppressed}/${summary.counts.records_processed} records`
              : "Dropped sparse rows"
          }
          provenance={overview ? "DERIVED" : "EMPTY"}
          provenanceLabel={overview ? `DERIVED · N=${overview.sampleRecords}` : "NO RUN"}
          icon={<ShieldBan className="h-4 w-4" />}
        />
        <KpiCard
          label="Patient Linking Rate"
          value={overview ? `${(overview.linkedRecordRate * 100).toFixed(1)}%` : "—"}
          sublabel={
            summary
              ? `${summary.counts.records_linked} linked (${overview?.clinical?.linkedProfiles ?? "—"} PSNs)`
              : "PSN-assigned records"
          }
          provenance={overview ? "DERIVED" : "EMPTY"}
          provenanceLabel={overview ? `DERIVED · N=${overview.sampleRecords}` : "NO RUN"}
          icon={<Link2 className="h-4 w-4" />}
          tone={overview ? "emerald" : "neutral"}
        />
        <KpiCard
          label="File Quarantine Share"
          value={overview ? `${(overview.quarantineRate * 100).toFixed(1)}%` : "—"}
          sublabel={
            summary
              ? `${summary.counts.files_quarantined}/${summary.counts.files_total} isolated files`
              : "Broken/binary inputs"
          }
          provenance={overview ? "LIVE" : "EMPTY"}
          provenanceLabel={overview ? `LIVE · N=${overview.sampleFiles} files` : "NO RUN"}
          icon={<Files className="h-4 w-4" />}
          tone={summary && summary.counts.files_quarantined > 0 ? "amber" : "neutral"}
        />
        <KpiCard
          label="Client PII Safeguard Hits"
          value={
            overview?.clinical
              ? String(overview.clinical.safeguardScrubsCount)
              : isLoadingRegistry
                ? "..."
                : "—"
          }
          sublabel="Preview regex guard triggers"
          provenance={overview?.clinical ? "DERIVED" : "EMPTY"}
          provenanceLabel={
            overview?.clinical
              ? `DERIVED · N=${overview.clinical.parsedRecords}`
              : isLoadingRegistry
                ? "SCANNING"
                : "NO RUN"
          }
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={isLoadingRegistry}
          tone={overview?.clinical?.safeguardScrubsCount === 0 ? "emerald" : "neutral"}
        />
        <KpiCard
          label="Live Attacker Re-ID Score"
          value="N/A"
          sublabel="Requires truth & voter roll"
          provenance="UNAVAILABLE"
          provenanceLabel="UNAVAILABLE · NO ORACLE"
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      {/* Distributions & Clear Metric Definitions */}
      {!overview ? (
        <EmptyState
          title="No active sanitization run loaded for live risk distributions"
          description="Submit a batch in Sanitization Studio or load a retained 16-hex run ID above to inspect real Stage 1 entity detections and QI generalization distributions. Verified Phase 1E historical benchmarks and ATTACKS.md matrices remain inspectable below."
          icon={<Activity className="h-4 w-4" />}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="min-w-0">
            <PanelHeader>
              <div className="min-w-0">
                <PanelTitle>Detected Identifier Classes</PanelTitle>
                <PanelDescription>
                  Raw mention counts classified by Stage 1 NER/gazetteers before replacement (from{" "}
                  <code className="font-mono">report.json</code>, sample N={overview.entityTotal} mentions).
                </PanelDescription>
              </div>
              <ProvenanceBadge kind="LIVE" label={`LIVE · ${overview.topEntities.length} CLASSES`} />
            </PanelHeader>
            <PanelContent>
              {entityChartOption ? (
                <EChartBox
                  option={entityChartOption}
                  height={Math.max(150, Math.min(260, overview.topEntities.length * 42 + 64))}
                />
              ) : (
                <EmptyState
                  title="Zero PII entity mentions detected"
                  description="No personal identifier categories were reported in report.json for this batch."
                />
              )}
            </PanelContent>
          </Panel>

          <Panel className="min-w-0">
            <PanelHeader>
              <div className="min-w-0">
                <PanelTitle>Export Redaction &amp; QI Transformation Mix</PanelTitle>
                <PanelDescription>
                  Placeholder and generalization markers observed by Phase 2A scanning <code className="font-mono">sanitized/</code>.
                </PanelDescription>
              </div>
              <ProvenanceBadge kind="DERIVED" label="DERIVED · ARTIFACT SCAN" />
            </PanelHeader>
            <PanelContent>
              {markerChartOption ? (
                <EChartBox option={markerChartOption} height={260} />
              ) : (
                <EmptyState
                  title="No bracketed redaction markers observed"
                  description="Sanitized outputs in this batch did not contain bracketed placeholders (for example clean reference notes)."
                />
              )}
            </PanelContent>
          </Panel>
        </div>
      )}
    </section>
  );
}
