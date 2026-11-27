import { useMemo } from "react";
import { AlertCircle, CheckCircle2, FileCheck2, Info, Scale, ShieldCheck } from "lucide-react";
import type { RunSummaryResponse } from "@/api/schemas";
import { EChartBox } from "@/components/charts/EChartBox";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState, SectionHeader } from "@/components/ui/state-views";
import {
  FROZEN_ABLATION_FRONTIER,
  FROZEN_DISTRICT_PROBE_AUDIT,
  type LiveRiskOverviewMetrics,
  type RiskFindingItem,
} from "@/lib/riskAnalyticsAnalyzer";

export function UtilityPrivacyAndFindingsSection({
  summary,
  overview,
  findings,
}: {
  summary: RunSummaryResponse | null;
  overview: LiveRiskOverviewMetrics | null;
  findings: RiskFindingItem[];
}) {
  const frontierChartOption = useMemo(
    () => ({
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
        itemGap: 10,
        textStyle: { color: "#94A3B8", fontSize: 11 },
      },
      grid: { left: 48, right: 20, top: 24, bottom: 78 },
      xAxis: {
        type: "category",
        data: ["Base (1C)", "Keep Dist", "Global k", "Adapt DOB", "Adapt Mixed", "Band 20"],
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#CBD5E1", fontFamily: "JetBrains Mono, monospace", fontSize: 10, interval: 0, rotate: 16 },
      },
      yAxis: {
        type: "value",
        name: "Score (%)",
        nameTextStyle: { color: "#94A3B8", fontSize: 10 },
        min: 70,
        max: 100,
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
        axisLabel: { color: "#94A3B8", fontSize: 11 },
      },
      series: [
        {
          name: "Privacy Res. (%)",
          type: "bar",
          barMaxWidth: 20,
          itemStyle: { color: "#10B981", borderRadius: [3, 3, 0, 0] },
          data: FROZEN_ABLATION_FRONTIER.map((p) => p.privacyResistance),
        },
        {
          name: "Clinical Utility (%)",
          type: "line",
          symbolSize: 7,
          lineStyle: { width: 2, color: "#22D3EE" },
          itemStyle: { color: "#22D3EE" },
          data: FROZEN_ABLATION_FRONTIER.map((p) => p.clinicalUtility),
        },
        {
          name: "Composite Score",
          type: "line",
          symbolSize: 7,
          lineStyle: { width: 2, type: "dashed", color: "#F59E0B" },
          itemStyle: { color: "#F59E0B" },
          data: FROZEN_ABLATION_FRONTIER.map((p) => p.compositeScore),
        },
      ],
    }),
    [],
  );

  return (
    <div className="space-y-8">
      {/* 4. Utility vs Privacy */}
      <section className="space-y-4" data-testid="utility-privacy-section">
        <SectionHeader
          title="4. Clinical Utility vs Privacy Trade-offs"
          subtitle="Separates clinical preservation from demographic generalization so utility never sacrifices patient care."
          provenance={summary ? "DERIVED" : "FROZEN"}
          provenanceLabel={summary ? "LIVE RUN STRUCTURE + FROZEN ABLATION" : "FROZEN ABLATION FRONTIER"}
        />

        {/* SCORING.md non-destructive rule banner */}
        <div className="flex items-start gap-2.5 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-xs text-slate-300">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <div className="space-y-1">
            <div>
              <strong className="font-semibold text-slate-100">Anti-Over-Redaction Principle (SCORING.md):</strong>{" "}
              Adversarial privacy credit is coupled to utility via{" "}
              <code className="font-mono text-cyan-300">privacy = (1 − risk) × min(1, utility / 0.40)</code>. Destructive suppression (such as <code className="font-mono">redact_all</code>, scoring <code className="font-mono">21.70</code> in calibration) destroys medical signal and fails; RAKSHAK targets demographic QIs only on sparse/outlier cohorts.
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          {/* FROZEN Ablation Chart */}
          <Panel className="min-w-0 lg:col-span-7">
            <PanelHeader>
              <div className="min-w-0">
                <PanelTitle>Policy Ablation Frontier (Non-Destructive Strategies)</PanelTitle>
                <PanelDescription>
                  Verified Phase 1D/1E comparison across <code className="font-mono">ablate_1d</code> and <code className="font-mono">phase-1e-v1 (audit-sec-A)</code>.
                </PanelDescription>
              </div>
              <ProvenanceBadge kind="FROZEN" label="FROZEN · ABLATION" />
            </PanelHeader>
            <PanelContent className="space-y-4">
              <EChartBox option={frontierChartOption} height={290} />

              <div className="rounded-md border border-slate-800/80 bg-[#080E1C] p-3 text-[11px] text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-100">
                    92 [DISTRICT] Generalization Probe Accounting
                  </span>
                  <ProvenanceBadge kind="FROZEN" label="4,763 / 4,855 PROBES" />
                </div>
                <p className="mt-1.5 leading-relaxed text-slate-400">
                  Phase 1D/1E clinical probes measured <code className="font-mono text-slate-200">{FROZEN_DISTRICT_PROBE_AUDIT.retainedIn1dAnd1e} / {FROZEN_DISTRICT_PROBE_AUDIT.totalClinicalProbes}</code> (0.9932): diagnoses ({FROZEN_DISTRICT_PROBE_AUDIT.diagnosisProbes}), ICD-10 ({FROZEN_DISTRICT_PROBE_AUDIT.icdCodeProbes}), medications ({FROZEN_DISTRICT_PROBE_AUDIT.medicationProbes}), doses/freq ({FROZEN_DISTRICT_PROBE_AUDIT.doseAndFreqProbes}), and labs/vitals ({FROZEN_DISTRICT_PROBE_AUDIT.labAndVitalProbes}) remained untouched; only <code className="font-mono text-amber-300">92</code> sparse district mentions were coarsened to <code className="font-mono">[DISTRICT]</code>.
                </p>
              </div>
            </PanelContent>
          </Panel>

          {/* LIVE Active Run Clinical Preservation Card */}
          <Panel className="min-w-0 lg:col-span-5">
            <PanelHeader>
              <div className="min-w-0">
                <PanelTitle>Active Run Clinical &amp; Structural Retention</PanelTitle>
                <PanelDescription>
                  Extracted strictly from sanitized exports of the selected run.
                </PanelDescription>
              </div>
              <ProvenanceBadge
                kind={overview?.clinical ? "LIVE" : "EMPTY"}
                label={overview?.clinical ? "LIVE + DERIVED" : "NO ACTIVE RUN"}
              />
            </PanelHeader>
            <PanelContent className="space-y-3">
              {!summary || !overview ? (
                <EmptyState
                  title="No active run loaded for utility inspection"
                  description="Run or load a batch to inspect surviving FHIR R4 validity, records suppressed vs retained, and extracted clinical diagnoses/medications/labs."
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                      <div className="font-mono text-[10px] text-slate-500">Diagnoses / Unique</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-cyan-200 tabular-nums">
                        {overview.clinical ? `${overview.clinical.diagnosesMentions} / ${overview.clinical.uniqueDiagnosesCount}` : "—"}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                      <div className="font-mono text-[10px] text-slate-500">Medications Mentions</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-emerald-300 tabular-nums">
                        {overview.clinical ? overview.clinical.medicationsMentions : "—"}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                      <div className="font-mono text-[10px] text-slate-500">Labs &amp; Vitals Kept</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                        {overview.clinical
                          ? overview.clinical.observationsCount + overview.clinical.vitalsCount
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                      <div className="font-mono text-[10px] text-slate-500">Stay Intervals Intact</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                        {overview.clinical ? overview.clinical.stayDurationIntervals : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>FHIR R4 Bundles Valid</span>
                    </div>
                    <span className="font-mono text-emerald-300">
                      {summary.fhir_validation.bundles_valid} / {summary.fhir_validation.bundles_total}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Records Preserved (Non-Suppressed)</span>
                    </div>
                    <span className="font-mono text-slate-100">
                      {summary.counts.records_processed - summary.counts.records_suppressed} /{" "}
                      {summary.counts.records_processed}
                    </span>
                  </div>

                  <div className="rounded-md border border-slate-700/80 bg-[#090F1E] p-3 text-[11px] leading-relaxed text-slate-300">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-200">Live Medical Probe Recall &amp; TVD</span>
                      <ProvenanceBadge kind="UNAVAILABLE" />
                    </div>
                    <p className="text-slate-400">
                      Measuring exact clinical probe recall (%) or diagnosis TVD requires pre-sanitization raw clinical ground truth, which Phase 2A excludes from browser responses.
                    </p>
                  </div>
                </>
              )}
            </PanelContent>
          </Panel>
        </div>
      </section>

      {/* 5. Risk Findings */}
      <section className="space-y-4" data-testid="risk-findings-section">
        <SectionHeader
          title="5. Risk Findings & Methodological Disclosures"
          subtitle="Evidence-backed findings combining live active-run cohort telemetry (when loaded) with verified Phase 1D/1E audit conclusions."
          provenance={summary ? "DERIVED" : "FROZEN"}
          provenanceLabel={summary ? "LIVE + DERIVED + FROZEN FINDINGS" : "FROZEN AUDIT FINDINGS"}
        />

        <div className="grid gap-4 md:grid-cols-2">
          {findings.map((f) => {
            const Icon =
              f.severity === "HIGH" || f.severity === "MODERATE"
                ? AlertCircle
                : f.severity === "LOW"
                  ? CheckCircle2
                  : Info;
            const sevVariant =
              f.severity === "HIGH"
                ? ("danger" as const)
                : f.severity === "MODERATE"
                  ? ("frozen" as const)
                  : f.severity === "LOW"
                    ? ("live" as const)
                    : ("default" as const);
            return (
              <Panel key={f.id} className="min-w-0">
                <PanelHeader>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                    <PanelTitle className="text-xs leading-snug">{f.title}</PanelTitle>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant={sevVariant}>{f.severity}</Badge>
                    <ProvenanceBadge kind={f.provenance} label={f.provenance} />
                  </div>
                </PanelHeader>
                <PanelContent className="space-y-2 text-[11px] leading-relaxed text-slate-300">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      Evidence:{" "}
                    </span>
                    {f.evidence}
                  </div>
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      Methodology:{" "}
                    </span>
                    <span className="text-slate-400">{f.methodology}</span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      Limitation:{" "}
                    </span>
                    <span className="text-amber-200/85">{f.limitation}</span>
                  </div>
                </PanelContent>
              </Panel>
            );
          })}
        </div>
      </section>
    </div>
  );
}
