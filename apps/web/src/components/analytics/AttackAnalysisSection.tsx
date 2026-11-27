import { useMemo, useState } from "react";
import { Info, ShieldAlert } from "lucide-react";
import { EChartBox } from "@/components/charts/EChartBox";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/state-views";
import {
  FROZEN_PHASE_1E_BASELINE_SEC_A,
  FROZEN_PROGRESSION_AUDIT_SEC_A,
  type FrozenSecretProfile,
} from "@/data/frozenBenchmarks";
import { getAttackMatrix } from "@/lib/riskAnalyticsAnalyzer";
import { useUiStore } from "@/stores/uiStore";

export function AttackAnalysisSection() {
  const [profile, setProfile] = useState<FrozenSecretProfile>("audit-sec-A");
  const setActivePage = useUiStore((s) => s.setActivePage);

  const m1c = FROZEN_PROGRESSION_AUDIT_SEC_A[0];
  const m1d = FROZEN_PROGRESSION_AUDIT_SEC_A[1];
  const m1eAudit = FROZEN_PROGRESSION_AUDIT_SEC_A[2];
  const active1e = profile === "audit-sec-A" ? m1eAudit : FROZEN_PHASE_1E_BASELINE_SEC_A;
  const rows = useMemo(() => getAttackMatrix(profile), [profile]);

  const attackChartOption = useMemo(
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
      grid: { left: 48, right: 20, top: 24, bottom: 64 },
      xAxis: {
        type: "category",
        data: ["A1 Direct", "A2/A3 Link", "A4 Re-ID", "A5 Target", "A6 Invert", "A7 Cross"],
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#CBD5E1", fontSize: 11 },
      },
      yAxis: {
        type: "value",
        name: "Attack Risk Ratio",
        nameTextStyle: { color: "#94A3B8", fontSize: 10 },
        min: 0,
        max: 1,
        interval: 0.2,
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
        axisLabel: { color: "#94A3B8", fontSize: 11 },
      },
      series: [
        {
          name: "Phase 1C (Base)",
          type: "bar",
          barMaxWidth: 16,
          itemStyle: { color: "rgba(245, 158, 11, 0.72)", borderRadius: [3, 3, 0, 0] },
          data: [m1c.a1, m1c.a23, m1c.a4, m1c.a5, m1c.a6, m1c.a7],
        },
        {
          name: "Phase 1D (Adaptive k)",
          type: "bar",
          barMaxWidth: 16,
          itemStyle: { color: "#64748B", borderRadius: [3, 3, 0, 0] },
          data: [m1d.a1, m1d.a23, m1d.a4, m1d.a5, m1d.a6, m1d.a7],
        },
        {
          name: `Phase 1E (${profile})`,
          type: "bar",
          barMaxWidth: 16,
          itemStyle: { color: "#22D3EE", borderRadius: [3, 3, 0, 0] },
          data: [
            active1e.a1,
            active1e.a23,
            active1e.a4,
            active1e.a5,
            active1e.a6,
            active1e.a7,
          ],
        },
      ],
    }),
    [active1e, m1c, m1d, profile],
  );

  return (
    <section className="space-y-4" data-testid="attack-analysis-section">
      <SectionHeader
        title="3. Privacy Attack Analysis (ATTACKS.md Scenarios A1–A7)"
        subtitle="Mapping adversary models from Secret-Wards-ToolKit/docs/ATTACKS.md to verified Phase 1C/1D/1E simulator runs vs. unavailable live user-batch probes."
        provenance="FROZEN"
        provenanceLabel="FROZEN · SIMULATOR DATA + UNAVAILABLE LIVE ORACLE"
        rightSlot={
          <div className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#090F1D] p-1">
            <Button
              size="sm"
              variant={profile === "audit-sec-A" ? "primary" : "ghost"}
              onClick={() => setProfile("audit-sec-A")}
            >
              audit-sec-A
            </Button>
            <Button
              size="sm"
              variant={profile === "baseline-sec-A" ? "primary" : "ghost"}
              onClick={() => setProfile("baseline-sec-A")}
            >
              baseline-sec-A
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-2.5 text-xs">
        <div className="flex items-start gap-2 text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>
            Chart and table scores below reflect <strong className="font-semibold">FROZEN</strong> local{" "}
            <code className="font-mono">eval_arena.py</code> simulator benchmarks on the practice corpus—never executed against live uploaded files (which lack hidden electoral-roll registries and ground truth).
          </span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setActivePage("unlinkability")}>
          Open Unlinkability Lab (A6/A7)
        </Button>
      </div>

      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <PanelTitle>Adversarial Risk Reduction Trajectory (A1–A7)</PanelTitle>
            </div>
            <PanelDescription>
              Lower bars indicate lower attacker probability/exposure (<code className="font-mono">0.0</code> = zero attack success on tested dev corpus under <code className="font-mono">{profile}</code>).
            </PanelDescription>
          </div>
          <ProvenanceBadge kind="FROZEN" label={`FROZEN · ${profile}`} />
        </PanelHeader>
        <PanelContent>
          <EChartBox option={attackChartOption} height={290} />
        </PanelContent>
      </Panel>

      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0">
            <PanelTitle>ATTACKS.md Threat Catalog &amp; Live Reproducibility Boundary</PanelTitle>
            <PanelDescription>
              Explicit accounting of historical simulator results (<code className="font-mono">FROZEN</code>) versus live Phase 2A batch testability.
            </PanelDescription>
          </div>
          <ProvenanceBadge kind="UNAVAILABLE" label="A1–A5 LIVE ORACLE UNAVAILABLE" />
        </PanelHeader>
        <PanelContent>
          <div className="overflow-x-auto rounded-md border border-slate-800/80">
            <table className="w-full min-w-[660px] border-collapse text-left text-xs">
              <thead className="bg-[#090F1E] text-[10px] uppercase tracking-wider text-slate-400">
                <tr className="border-b border-slate-800/80">
                  <th className="px-3 py-2 font-medium">Attack</th>
                  <th className="px-3 py-2 font-medium">Adversary Knowledge &amp; Engine Defense</th>
                  <th className="px-3 py-2 font-medium">Frozen 1C → 1D → 1E</th>
                  <th className="px-3 py-2 font-medium">Live Batch Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 bg-[#0D1424]/70">
                {rows.map((r) => (
                  <tr key={r.code}>
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-mono text-xs font-semibold text-cyan-300">{r.code}</div>
                      <div className="mt-0.5 font-medium text-slate-200">{r.name}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-[11px] leading-relaxed text-slate-300">
                      <div>
                        <span className="font-medium text-slate-400">Adversary:</span> {r.adversarySource}
                      </div>
                      <div className="mt-1">
                        <span className="font-medium text-slate-400">Control:</span> {r.engineControl}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="mb-1">
                        <ProvenanceBadge kind="FROZEN" label="FROZEN" />
                      </div>
                      <div className="font-mono text-[11px] text-slate-200">
                        {r.frozen1cRisk} → {r.frozen1dRisk} →{" "}
                        <span className="font-semibold text-emerald-300">{r.frozen1eRisk}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-[11px]">
                      <div className="mb-1">
                        {r.liveStatus === "UNAVAILABLE" ? (
                          <ProvenanceBadge kind="UNAVAILABLE" />
                        ) : (
                          <Badge variant="derived">PARTIAL · CRYPTO LAB</Badge>
                        )}
                      </div>
                      <p className="max-w-xs text-slate-400">{r.liveStatusReason}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelContent>
      </Panel>
    </section>
  );
}
