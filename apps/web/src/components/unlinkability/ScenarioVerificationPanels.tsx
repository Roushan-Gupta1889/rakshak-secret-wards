import { AlertTriangle, CheckCircle2, Info, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state-views";
import type { UnlinkabilitySuiteReport } from "@/hooks/useUnlinkabilityVerification";
import type { ComparisonPairSample } from "@/lib/unlinkabilityAnalyzer";

function PairsPreviewTable({
  samples,
  leftCol,
  rightCol,
  expectEqual,
}: {
  samples: ComparisonPairSample[];
  leftCol: string;
  rightCol: string;
  expectEqual: boolean;
}) {
  if (!samples.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-slate-800/80">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-[#090F1E] text-[10px] uppercase tracking-wider text-slate-400">
          <tr className="border-b border-slate-800/80">
            <th className="px-2.5 py-2 font-medium">Row</th>
            <th className="px-2.5 py-2 font-medium">{leftCol}</th>
            <th className="px-2.5 py-2 font-medium">{rightCol}</th>
            <th className="px-2.5 py-2 font-medium text-right">Check</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70 bg-[#0D1424]/70">
          {samples.slice(0, 6).map((s) => {
            const ok = expectEqual ? s.equal : !s.equal;
            return (
              <tr key={`${s.loc}-${s.psnA}-${s.psnB}`}>
                <td className="px-2.5 py-1.5 font-mono text-[11px] text-slate-400">{s.loc}</td>
                <td className="px-2.5 py-1.5 font-mono text-[11px] text-cyan-200">{s.psnA}</td>
                <td className="px-2.5 py-1.5 font-mono text-[11px] text-slate-200">{s.psnB}</td>
                <td className="px-2.5 py-1.5 text-right">
                  <Badge variant={ok ? "live" : "danger"}>
                    {s.equal ? "MATCH" : "DISTINCT"}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ScenarioVerificationPanels({
  report,
}: {
  report: UnlinkabilitySuiteReport | null;
}) {
  if (!report) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="min-w-0">
          <PanelHeader>
            <div>
              <PanelTitle>A. Deterministic Pseudonymization</PanelTitle>
              <PanelDescription>
                Same canonical key + same secret + same algorithm version.
              </PanelDescription>
            </div>
            <ProvenanceBadge kind="EMPTY" label="NOT EXECUTED" />
          </PanelHeader>
          <PanelContent>
            <EmptyState
              title="No live determinism run executed"
              description="Run the live verification suite above to invoke two Stage 1 CLI subprocesses with identical canonical patient keys and compare outputs."
            />
          </PanelContent>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader>
            <div>
              <PanelTitle>B. Cross-Secret Unlinkability</PanelTitle>
              <PanelDescription>
                Same canonical key under independent server secrets.
              </PanelDescription>
            </div>
            <ProvenanceBadge kind="EMPTY" label="NOT EXECUTED" />
          </PanelHeader>
          <PanelContent>
            <EmptyState
              title="No live cross-secret comparison executed"
              description="Run the live suite to compare Stage 1 pseudonyms across independent server-side secrets without revealing secret values."
            />
          </PanelContent>
        </Panel>
      </div>
    );
  }

  const { determinism: det, crossSecret: cross } = report;

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="verification-scenarios-grid">
      {/* Scenario A: Determinism */}
      <Panel className="min-w-0" data-testid="scenario-determinism">
        <PanelHeader>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <RefreshCw className="h-4 w-4 text-cyan-400" />
              <PanelTitle>A. Deterministic Pseudonymization</PanelTitle>
            </div>
            <PanelDescription>
              Paired outputs across identical Stage 1 CLI runs using server <code className="font-mono">RAKSHA_SECRET</code>.
            </PanelDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ProvenanceBadge kind="LIVE" label="LIVE · SUBPROCESS" />
            <Badge
              variant={
                det.status === "VERIFIED"
                  ? "live"
                  : det.status === "BLOCKED"
                    ? "frozen"
                    : "danger"
              }
            >
              {det.status}
            </Badge>
          </div>
        </PanelHeader>

        <PanelContent className="space-y-4">
          {det.status === "BLOCKED" ? (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-3 text-xs text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span>{det.blockReason}</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                  <div className="font-mono text-[10px] uppercase text-slate-500">Test Cases</div>
                  <div className="mt-0.5 font-mono text-lg font-semibold text-slate-100 tabular-nums">
                    {det.pairCount}
                  </div>
                </div>
                <div className="rounded border border-emerald-500/25 bg-[#080E1C] p-2.5">
                  <div className="font-mono text-[10px] uppercase text-slate-500">Matching</div>
                  <div className="mt-0.5 font-mono text-lg font-semibold text-emerald-300 tabular-nums">
                    {det.matchingCount}
                  </div>
                </div>
                <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                  <div className="font-mono text-[10px] uppercase text-slate-500">Mismatches</div>
                  <div
                    className={
                      det.mismatchCount === 0
                        ? "mt-0.5 font-mono text-lg font-semibold text-slate-200 tabular-nums"
                        : "mt-0.5 font-mono text-lg font-semibold text-red-300 tabular-nums"
                    }
                  >
                    {det.mismatchCount}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  Run A ({det.runAId}) vs Run B ({det.runBId}) · ephem workspaces purged after verify
                </span>
              </div>

              <PairsPreviewTable
                samples={det.samples}
                leftCol="Run A PSN"
                rightCol="Run B PSN"
                expectEqual
              />
            </>
          )}
        </PanelContent>
      </Panel>

      {/* Scenario B: Cross-Secret Unlinkability */}
      <Panel className="min-w-0" data-testid="scenario-cross-secret">
        <PanelHeader>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Lock className="h-4 w-4 text-cyan-400" />
              <PanelTitle>B. Cross-Secret Unlinkability</PanelTitle>
            </div>
            <PanelDescription>
              Same canonical keys under secret S1 vs isolated CSPRNG secret S2.
            </PanelDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ProvenanceBadge kind="LIVE" label="LIVE · SUBPROCESS" />
            <Badge
              variant={
                cross.status === "VERIFIED"
                  ? "live"
                  : cross.status === "WARNING"
                    ? "frozen"
                    : "danger"
              }
            >
              {cross.status}
            </Badge>
          </div>
        </PanelHeader>

        <PanelContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
              <div className="font-mono text-[10px] uppercase text-slate-500">Test Pairs</div>
              <div className="mt-0.5 font-mono text-lg font-semibold text-slate-100 tabular-nums">
                {cross.pairCount}
              </div>
            </div>
            <div className="rounded border border-cyan-500/25 bg-[#080E1C] p-2.5">
              <div className="font-mono text-[10px] uppercase text-slate-500">Different</div>
              <div className="mt-0.5 font-mono text-lg font-semibold text-cyan-300 tabular-nums">
                {cross.differentCount}
              </div>
            </div>
            <div className="rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
              <div className="font-mono text-[10px] uppercase text-slate-500">Matching</div>
              <div
                className={
                  cross.matchingCount === 0
                    ? "mt-0.5 font-mono text-lg font-semibold text-emerald-300 tabular-nums"
                    : "mt-0.5 font-mono text-lg font-semibold text-amber-300 tabular-nums"
                }
              >
                {cross.matchingCount}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2 text-[11px] leading-relaxed text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span>
              Provides <strong>empirical evidence</strong> on the tested {cross.pairCount}-key sample (Run {cross.runAId} vs CSPRNG Run {cross.runCId}). Because pseudonyms map into a finite 1.07 × 10⁹ space, random coincidental overlap across independent secrets has ~1 in 10⁹ probability per pair rather than strict impossibility.
            </span>
          </div>

          <PairsPreviewTable
            samples={cross.samples}
            leftCol="Secret S1 PSN"
            rightCol="Secret S2 PSN"
            expectEqual={false}
          />
        </PanelContent>
      </Panel>

      {report.cleanupWarnings.length > 0 ? (
        <div className="lg:col-span-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>{report.cleanupWarnings.join(" · ")}</span>
        </div>
      ) : null}
    </div>
  );
}
