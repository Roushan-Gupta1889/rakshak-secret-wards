import { useMemo } from "react";
import { AlertTriangle, Info, Layers, Shield, ShieldCheck, Users } from "lucide-react";
import { EChartBox } from "@/components/charts/EChartBox";
import { KpiCard } from "@/components/common/KpiCard";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState, SectionHeader } from "@/components/ui/state-views";
import type { CohortAnalysisResult } from "@/lib/riskAnalyticsAnalyzer";

export function ReidentificationCohortSection({
  cohort,
  isLoading,
  runId,
}: {
  cohort: CohortAnalysisResult | null;
  isLoading: boolean;
  runId: string | null;
}) {
  const bucketChartOption = useMemo(() => {
    if (!cohort || cohort.linkedProfilesTotal === 0) return null;
    const colors = ["#F59E0B", "#FB7185", "#10B981", "#22D3EE"];
    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "#0B1222",
        borderColor: "#334155",
        textStyle: { color: "#E2E8F0", fontSize: 12 },
      },
      grid: { left: 46, right: 20, top: 28, bottom: 56 },
      xAxis: {
        type: "category",
        data: cohort.buckets.map((b) => b.bucket),
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: {
          color: "#CBD5E1",
          fontSize: 10,
          interval: 0,
          rotate: 12,
        },
      },
      yAxis: {
        type: "value",
        name: "Linked Profiles",
        nameTextStyle: { color: "#94A3B8", fontSize: 10 },
        minInterval: 1,
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
        axisLabel: { color: "#94A3B8", fontSize: 11 },
      },
      series: [
        {
          name: "Patient Profiles",
          type: "bar",
          barMaxWidth: 34,
          data: cohort.buckets.map((b, i) => ({
            value: b.count,
            itemStyle: { color: colors[i] ?? "#22D3EE", borderRadius: [3, 3, 0, 0] },
          })),
        },
      ],
    };
  }, [cohort]);

  return (
    <section className="space-y-4" data-testid="reidentification-cohort-section">
      <SectionHeader
        title="2. Re-identification Risk & Adaptive k-Anonymity"
        subtitle="Release-level equivalence-class analysis computed strictly across linked patient profiles in the active sanitized output."
        provenance={cohort ? "DERIVED" : isLoading ? "DERIVED" : "EMPTY"}
        provenanceLabel={
          cohort
            ? `DERIVED · ${cohort.linkedProfilesTotal} PROFILES`
            : isLoading
              ? "ANALYZING SANITIZED ARTIFACTS"
              : "REQUIRES ACTIVE RUN"
        }
      />

      {!runId || (!cohort && !isLoading) ? (
        <EmptyState
          title="No active sanitized output for k-anonymity cohort grouping"
          description="Select or execute a sanitization run to inspect equivalence-class sizes over surviving (gender, age_band, district, pin_prefix) attributes, generalization markers, and small/rare cohort alerts."
          icon={<Users className="h-4 w-4" />}
        />
      ) : (
        <div className="space-y-4">
          {/* Cohort KPI Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Policy min_group_size"
              value={cohort ? `k >= ${cohort.minGroupSizeTarget}` : "—"}
              sublabel="Configured corpus threshold"
              provenance="LIVE"
              provenanceLabel="LIVE · /API/POLICY"
              icon={<Shield className="h-4 w-4" />}
              loading={isLoading}
            />
            <KpiCard
              label="Unique Release Profiles (k=1)"
              value={cohort ? String(cohort.singletonUnmaskedCount) : "—"}
              sublabel={
                cohort
                  ? `of ${cohort.linkedProfilesTotal} linked PSNs with surviving QIs`
                  : "Scanning clusters"
              }
              provenance="DERIVED"
              provenanceLabel={cohort ? `DERIVED · P=${cohort.linkedProfilesTotal}` : "LOADING"}
              icon={<AlertTriangle className="h-4 w-4" />}
              loading={isLoading}
              tone={cohort && cohort.singletonUnmaskedCount > 0 ? "amber" : "emerald"}
            />
            <KpiCard
              label="All Demographic QIs Masked"
              value={cohort ? String(cohort.allQiMaskedCount) : "—"}
              sublabel="Gender/Age/District/PIN hidden or absent"
              provenance="DERIVED"
              provenanceLabel="DERIVED · RELEASE PARSE"
              icon={<ShieldCheck className="h-4 w-4" />}
              loading={isLoading}
              tone="cyan"
            />
            <KpiCard
              label="Batch-Unique Dx + Unmasked QI"
              value={cohort ? String(cohort.rareClinicalExposedCount) : "—"}
              sublabel={
                cohort
                  ? `${cohort.rareClinicalMaskedCount} unique dx profile(s) QI-masked`
                  : "Evaluating rare cohorts"
              }
              provenance="DERIVED"
              provenanceLabel="DERIVED · SMALL COHORT CHECK"
              icon={<Layers className="h-4 w-4" />}
              loading={isLoading}
              tone={cohort && cohort.rareClinicalExposedCount > 0 ? "amber" : "emerald"}
            />
          </div>

          {/* Chart + Generalization/Suppression Indicators */}
          <div className="grid gap-4 lg:grid-cols-12">
            <Panel className="min-w-0 lg:col-span-7">
              <PanelHeader>
                <div className="min-w-0">
                  <PanelTitle>Release Equivalence-Class Distribution (PSN Profiles)</PanelTitle>
                  <PanelDescription>
                    Grouped by exact surviving tuple <code className="font-mono">(gender | ageBand | district | pin3)</code> inside this run.
                  </PanelDescription>
                </div>
                <ProvenanceBadge kind="DERIVED" label="DERIVED · RELEASE K" />
              </PanelHeader>
              <PanelContent>
                {bucketChartOption ? (
                  <EChartBox option={bucketChartOption} height={260} />
                ) : (
                  <EmptyState
                    title="Insufficient linked patient profiles for cohort grouping"
                    description="No linked PSN-XXXXXX profiles were exported in records.jsonl for this run."
                  />
                )}
              </PanelContent>
            </Panel>

            <Panel className="min-w-0 lg:col-span-5">
              <PanelHeader>
                <div className="min-w-0">
                  <PanelTitle>Generalization, Suppression &amp; Limits</PanelTitle>
                  <PanelDescription>
                    Adaptive QI controls observed alongside structural data limits.
                  </PanelDescription>
                </div>
                <ProvenanceBadge kind="DERIVED" label="DERIVED + UNAVAILABLE" />
              </PanelHeader>
              <PanelContent className="space-y-3">
                {cohort ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                        <div className="font-mono text-[10px] text-slate-500">[DISTRICT] Generalized</div>
                        <div className="mt-0.5 font-mono text-sm font-semibold text-amber-300 tabular-nums">
                          {cohort.districtMarkers}
                        </div>
                      </div>
                      <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                        <div className="font-mono text-[10px] text-slate-500">[PIN] Suppressed</div>
                        <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                          {cohort.pinMarkers}
                        </div>
                      </div>
                      <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                        <div className="font-mono text-[10px] text-slate-500">[DOB] Suppressed</div>
                        <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                          {cohort.dobMarkers}
                        </div>
                      </div>
                      <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                        <div className="font-mono text-[10px] text-slate-500">[AGE] / [VILLAGE]</div>
                        <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                          {cohort.ageMarkers} / {cohort.villageMarkers}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 rounded border border-slate-800/80 bg-[#080E1C] p-3 text-[11px] text-slate-300">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase text-slate-400">
                          QI Observability Coverage
                        </span>
                        <Badge variant="derived">{cohort.observableQiFilesRatio}</Badge>
                      </div>
                      <p className="text-slate-400">
                        {cohort.oversizedOrFailedFilesCount > 0
                          ? `${cohort.oversizedOrFailedFilesCount} oversized (>512 KB) or unreadable file(s) excluded from client QI inspection.`
                          : "All exported patient-bearing text/CSV/JSON/FHIR files were parsed cleanly."}
                      </p>
                    </div>

                    <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-200/90">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <div>
                        <strong className="font-semibold">Measurement Boundary:</strong> In-corpus{" "}
                        <code className="font-mono">k_release</code> reflects batch size (P={cohort.linkedProfilesTotal}) and surviving columns—NOT hidden electoral-roll population{" "}
                        <code className="font-mono">k_registry</code> (<strong className="font-semibold">UNAVAILABLE</strong> without <code className="font-mono">attacker/registry.csv</code>).
                      </div>
                    </div>
                  </>
                ) : null}
              </PanelContent>
            </Panel>
          </div>

          {/* Small / Rare Cohort Table (Pseudonym + Masked Status ONLY — No raw PII or sensitive diagnosis pairing) */}
          {cohort && cohort.highAttentionCohorts.length > 0 ? (
            <Panel className="min-w-0">
              <PanelHeader>
                <div className="min-w-0">
                  <PanelTitle>Small &amp; Rare Cohort Diagnostics (Pseudonymized Index)</PanelTitle>
                  <PanelDescription>
                    Linked <code className="font-mono">PSN-XXXXXX</code> profiles with <code className="font-mono">k_release &lt; {cohort.minGroupSizeTarget}</code> or unique diagnosis flags. Raw PII and condition text are omitted from this table to prevent secondary pairing disclosure.
                  </PanelDescription>
                </div>
                <ProvenanceBadge kind="DERIVED" label={`TOP ${cohort.highAttentionCohorts.length}`} />
              </PanelHeader>
              <PanelContent>
                <div className="overflow-x-auto rounded-md border border-slate-800/80">
                  <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                    <thead className="bg-[#090F1E] text-[10px] uppercase tracking-wider text-slate-400">
                      <tr className="border-b border-slate-800/80">
                        <th className="px-3 py-2 font-medium">Patient PSN</th>
                        <th className="px-3 py-2 font-medium">Surviving Release QI Signature</th>
                        <th className="px-3 py-2 font-medium">Release k</th>
                        <th className="px-3 py-2 font-medium">Unique Dx Flag</th>
                        <th className="px-3 py-2 font-medium text-right">Engine Protections Applied</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 bg-[#0D1424]/70">
                      {cohort.highAttentionCohorts.map((row) => (
                        <tr key={row.pseudonym}>
                          <td className="px-3 py-2 font-mono text-[11px] font-medium text-cyan-200">
                            {row.pseudonym}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-300">
                            {row.qiSignature}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] tabular-nums text-slate-200">
                            {row.hasObservableQi ? `k=${row.cohortSize}` : "Masked"}
                          </td>
                          <td className="px-3 py-2">
                            {row.isRareDiagnosis ? (
                              <Badge variant="frozen">Batch-Unique ({row.rareDiagnoses.length})</Badge>
                            ) : (
                              <span className="text-[11px] text-slate-500">Shared / None</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              {row.hasDistrictMasked ? <Badge variant="live">[DISTRICT]</Badge> : null}
                              {row.hasPinMasked ? <Badge variant="live">[PIN]</Badge> : null}
                              {row.hasDobMasked ? <Badge variant="live">[DOB]</Badge> : null}
                              {row.hasAgeMasked ? <Badge variant="live">[AGE]</Badge> : null}
                              {!row.hasDistrictMasked &&
                              !row.hasPinMasked &&
                              !row.hasDobMasked &&
                              !row.hasAgeMasked ? (
                                <Badge variant="default">{row.recordCount} rec(s)</Badge>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PanelContent>
            </Panel>
          ) : null}
        </div>
      )}
    </section>
  );
}
