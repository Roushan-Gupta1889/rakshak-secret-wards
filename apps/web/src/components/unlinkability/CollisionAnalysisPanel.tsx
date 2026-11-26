import { useMemo } from "react";
import { Info } from "lucide-react";
import { EChartBox } from "@/components/charts/EChartBox";
import { KpiCard } from "@/components/common/KpiCard";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state-views";
import {
  BIRTHDAY_THEORETICAL_CURVE,
  FROZEN_PHASE_1E_CRYPTO_BENCHMARK,
  NUMERIC_ONLY_SUBSPACE,
  TOTAL_RAW_SPACE,
  VALID_ALPHA_PSN_SPACE,
  type LiveCollisionReport,
} from "@/lib/unlinkabilityAnalyzer";

export function CollisionAnalysisPanel({
  liveCollision,
}: {
  liveCollision: LiveCollisionReport | null;
}) {
  const chartOption = useMemo(
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
        itemGap: 12,
        textStyle: { color: "#94A3B8", fontSize: 11 },
      },
      grid: { left: 48, right: 20, top: 32, bottom: 64 },
      xAxis: {
        type: "category",
        data: BIRTHDAY_THEORETICAL_CURVE.map((pt) =>
          pt.sampleSize >= 1000 ? `${pt.sampleSize / 1000}k` : String(pt.sampleSize),
        ),
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#CBD5E1", fontFamily: "JetBrains Mono, monospace", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        name: "Expected Collisions",
        nameTextStyle: { color: "#94A3B8", fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
        axisLabel: { color: "#94A3B8", fontSize: 11 },
      },
      series: [
        {
          name: "Theoretical Expected Collisions",
          type: "line",
          smooth: true,
          symbolSize: 6,
          lineStyle: { width: 2, color: "#22D3EE" },
          itemStyle: { color: "#22D3EE" },
          areaStyle: { color: "rgba(34, 211, 238, 0.08)" },
          data: BIRTHDAY_THEORETICAL_CURVE.map((pt) => pt.expectedDuplicates),
        },
        {
          name: "Frozen Phase 1E Observed (N=100k)",
          type: "scatter",
          symbolSize: 11,
          itemStyle: { color: "#F59E0B" },
          data: BIRTHDAY_THEORETICAL_CURVE.map((pt) =>
            pt.sampleSize === 100_000 ? FROZEN_PHASE_1E_CRYPTO_BENCHMARK.duplicateCount : null,
          ),
        },
      ],
    }),
    [],
  );

  const bench = FROZEN_PHASE_1E_CRYPTO_BENCHMARK;

  return (
    <Panel className="min-w-0" data-testid="scenario-collision-analysis">
      <PanelHeader>
        <div className="min-w-0">
          <PanelTitle>D. Finite Output Space &amp; Collision Analysis</PanelTitle>
          <PanelDescription>
            Deterministic 256-bit HMAC-SHA256 outputs truncated to 30 Crockford bits ({VALID_ALPHA_PSN_SPACE.toLocaleString()} valid alpha codes) follow birthday-bound collision statistics—never global uniqueness.
          </PanelDescription>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProvenanceBadge kind={liveCollision ? "LIVE" : "EMPTY"} label={liveCollision ? "LIVE SAMPLE" : "NO LIVE SAMPLE"} />
          <ProvenanceBadge kind="FROZEN" label="100K PHASE 1E BENCHMARK" />
        </div>
      </PanelHeader>

      <PanelContent className="space-y-5">
        {/* Live Sample Collision Summary */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Live Verification Batch Collision Telemetry
            </span>
            {liveCollision ? (
              <Badge variant="live">{liveCollision.sourceLabel}</Badge>
            ) : null}
          </div>

          {!liveCollision ? (
            <EmptyState
              title="No live batch collision metrics yet"
              description="Run the live suite above to measure exact unique vs duplicate pseudonyms across actual Stage 1 engine output."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Records Tested"
                value={String(liveCollision.recordsTested)}
                sublabel="Non-null patient clusters"
                provenance="LIVE"
                tone="cyan"
              />
              <KpiCard
                label="Unique Pseudonyms"
                value={String(liveCollision.uniqueCount)}
                sublabel="Distinct PSN-XXXXXX emitted"
                provenance="LIVE"
                tone="emerald"
              />
              <KpiCard
                label="Duplicate Pseudonyms"
                value={String(liveCollision.duplicateCount)}
                sublabel={`Expected ~${liveCollision.expectedBirthdayCollisions.toExponential(2)}`}
                provenance="LIVE"
              />
              <KpiCard
                label="Observed Collision Rate"
                value={`${(liveCollision.collisionRate * 100).toFixed(4)}%`}
                sublabel="duplicate / tested sample"
                provenance="LIVE"
              />
            </div>
          )}
        </div>

        {/* Chart + Frozen 100k Phase 1E Evidence */}
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="min-w-0 rounded-lg border border-slate-800/80 bg-[#080E1C] p-3.5 lg:col-span-7">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-200">
                Birthday-Paradox Collision Expectation Across Output Space
              </span>
              <ProvenanceBadge kind="DERIVED" label="DERIVED · MATHEMATICAL CURVE" />
            </div>
            <EChartBox option={chartOption} height={240} />
          </div>

          <div className="min-w-0 space-y-3 rounded-lg border border-slate-800/80 bg-[#080E1C] p-3.5 lg:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-200">
                Phase 1E `crypto.py` Large-Sample Audit
              </span>
              <ProvenanceBadge kind="FROZEN" label="FROZEN · PHASE 1E" />
            </div>

            <div className="space-y-2 font-mono text-[11px]">
              <div className="flex justify-between gap-2 border-b border-slate-800/70 pb-1.5">
                <span className="text-slate-400">Raw 6-char Base-32 space</span>
                <span className="text-slate-200">{TOTAL_RAW_SPACE.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800/70 pb-1.5">
                <span className="text-slate-400">Rejected all-digit codes</span>
                <span className="text-amber-300">−{NUMERIC_ONLY_SUBSPACE.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-slate-800/70 pb-1.5">
                <span className="text-slate-400">Valid alpha-PSN space</span>
                <span className="text-cyan-300">{VALID_ALPHA_PSN_SPACE.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2 pt-1">
                <span className="text-slate-400">Tested sample (test_phase1e.py)</span>
                <span className="text-slate-100">{bench.sampleSize.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Unique / Duplicate</span>
                <span className="text-emerald-300">
                  {bench.uniqueCount.toLocaleString()} / {bench.duplicateCount}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Collision rate (expected)</span>
                <span className="text-slate-200">
                  {(bench.collisionRate * 100).toFixed(4)}% (~{bench.expectedBirthdayPairs.toFixed(2)})
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 text-[11px] leading-snug text-amber-200/90">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>
                The 4 collisions at N=100,000 reflect expected 30-bit truncation collisions (not flawed HMAC randomness). Running N=100k live from the API requires the proposed isolated crypto-benchmark endpoint.
              </span>
            </div>
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}
