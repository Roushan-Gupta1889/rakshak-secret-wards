import { useState } from "react";
import { Loader2, Play, ShieldCheck, Trash2 } from "lucide-react";
import { useHealthQuery } from "@/api/queries";
import { CollisionAnalysisPanel } from "@/components/unlinkability/CollisionAnalysisPanel";
import { CryptoArchitecturePanel } from "@/components/unlinkability/CryptoArchitecturePanel";
import { FormatValidatorPanel } from "@/components/unlinkability/FormatValidatorPanel";
import { ScenarioVerificationPanels } from "@/components/unlinkability/ScenarioVerificationPanels";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ErrorState, OfflineApiBanner, SectionHeader } from "@/components/ui/state-views";
import { useUnlinkabilityVerification } from "@/hooks/useUnlinkabilityVerification";
import { formatTimestampIso } from "@/lib/utils";

export function UnlinkabilityLabPage() {
  const healthQuery = useHealthQuery();
  const health = healthQuery.data?.data;

  const [sampleSize, setSampleSize] = useState<20 | 40>(20);
  const { isRunning, progressLabel, error, report, runSuite, clearReport } =
    useUnlinkabilityVerification(health);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Unlinkability Lab & Cryptographic Verification"
        subtitle="Evidence-based verification of RAKSHAK Stage 1 HMAC-SHA256 pseudonym determinism, cross-secret unlinkability, Crockford format compliance, and collision bounds."
        provenance={report ? "LIVE" : "EMPTY"}
        provenanceLabel={report ? "LIVE · REAL ENGINE RUNS" : "AWAITING LIVE VERIFICATION"}
      />

      {healthQuery.isError ? (
        <OfflineApiBanner onRetry={() => void healthQuery.refetch()} />
      ) : null}

      {/* Verification Runner Control Bar */}
      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <PanelTitle>Live Verification Execution Control</PanelTitle>
              {health ? (
                <Badge variant={health.secret_configured ? "live" : "frozen"}>
                  {health.secret_configured
                    ? "Server RAKSHA_SECRET Configured"
                    : "Server Secret Unset (Determinism Blocked)"}
                </Badge>
              ) : null}
            </div>
            <PanelDescription>
              Submits a labeled synthetic CSV fixture (<code className="font-mono">SYNTST-26-*</code>) through the isolated Phase 1E CLI subprocess via <code className="font-mono">POST /api/runs</code> and purges all temporary run workspaces on completion.
            </PanelDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="font-mono text-[10px] uppercase text-slate-400">Sample:</span>
              <select
                aria-label="Synthetic patient key sample size"
                disabled={isRunning}
                value={sampleSize}
                onChange={(e) => setSampleSize(Number(e.target.value) as 20 | 40)}
                className="h-8 rounded-md border border-slate-700/80 bg-[#080E1C] px-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                <option value={20}>20 synthetic keys</option>
                <option value={40}>40 synthetic keys</option>
              </select>
            </label>

            <Button
              type="button"
              variant="primary"
              disabled={isRunning}
              onClick={() => void runSuite(sampleSize)}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verifying Engine...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Run Cryptographic Verification
                </>
              )}
            </Button>

            {report ? (
              <Button
                type="button"
                variant="secondary"
                disabled={isRunning}
                onClick={clearReport}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Result
              </Button>
            ) : null}
          </div>
        </PanelHeader>

        {isRunning && progressLabel ? (
          <PanelContent className="border-t border-slate-800/70 py-3">
            <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-cyan-200">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              <span>{progressLabel}</span>
            </div>
          </PanelContent>
        ) : report ? (
          <PanelContent className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 py-2.5 text-[11px] text-slate-300">
            <span className="font-mono">
              Verified {report.sampleSize} canonical synthetic keys across {report.runsExecutedCount} isolated Stage 1 runs at {formatTimestampIso(report.executedAtIso)}
            </span>
            <ProvenanceBadge
              kind={report.cleanupCompleted ? "LIVE" : "FROZEN"}
              label={report.cleanupCompleted ? "TEMP WORKSPACES CLEANED" : "CLEANUP WARNING"}
            />
          </PanelContent>
        ) : null}
      </Panel>

      {error ? (
        <ErrorState
          title={`Cryptographic verification failed (${error.code})`}
          message={error.message}
          onRetry={() => void runSuite(sampleSize)}
        />
      ) : null}

      <ScenarioVerificationPanels report={report} />

      <FormatValidatorPanel liveFormat={report?.format ?? null} />

      <CollisionAnalysisPanel liveCollision={report?.collision ?? null} />

      <CryptoArchitecturePanel />
    </div>
  );
}
