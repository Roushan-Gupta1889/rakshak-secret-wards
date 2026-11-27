import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileCode2,
  FlaskConical,
  Loader2,
  Play,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  ApiRequestError,
  deleteSanitizationRun,
  submitSanitizationRun,
  type SubmitRunPhase,
} from "@/api/client";
import type { HealthResponse } from "@/api/schemas";
import { KpiCard } from "@/components/common/KpiCard";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ErrorState, SectionHeader } from "@/components/ui/state-views";
import { formatBytes } from "@/config/backendContract";
import {
  buildSyntheticDemoUploadBatch,
  SYNTHETIC_DEMO_FILES,
  SYNTHETIC_DEMO_NOTICE,
} from "@/lib/syntheticDemoDataset";
import { useRunStore } from "@/stores/runStore";
import { useUiStore } from "@/stores/uiStore";

function downloadSyntheticFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function SyntheticDatasetAndRunnerPanel({
  health,
}: {
  health: HealthResponse | null;
}) {
  const queryClient = useQueryClient();
  const { activeRun, setActiveRun, markRunDeleted } = useRunStore();
  const { setActivePage, markDemoStepCompleted } = useUiStore();

  const runLockRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<SubmitRunPhase | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const previewSpec = SYNTHETIC_DEMO_FILES.find((f) => f.fileName === previewFileName) ?? null;

  async function handleRunDemoPipeline() {
    if (runLockRef.current) return;
    runLockRef.current = true;
    setIsRunning(true);
    setError(null);
    setPhase("acquiring_csrf");

    try {
      const { accepted, errorCount } = buildSyntheticDemoUploadBatch();
      if (errorCount > 0 || accepted.length === 0) {
        throw new ApiRequestError("Synthetic batch failed client pre-validation.", {
          code: "INVALID_DEMO_BATCH",
        });
      }
      const summary = await submitSanitizationRun({
        files: accepted,
        secretMode: "auto",
        onPhaseChange: setPhase,
      });
      setActiveRun(summary);
      markDemoStepCompleted("step-upload");
      markDemoStepCompleted("step-execute");
      void queryClient.invalidateQueries({ queryKey: ["api", "health"] });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err);
      } else {
        setError(
          new ApiRequestError("Failed to execute synthetic demo pipeline.", {
            code: "DEMO_RUN_FAILED",
          }),
        );
      }
    } finally {
      runLockRef.current = false;
      setIsRunning(false);
      setPhase(null);
    }
  }

  async function handleDeleteDemoRun(runId: string) {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteSanitizationRun(runId);
      markRunDeleted(runId);
      void queryClient.invalidateQueries({ queryKey: ["api", "health"] });
    } catch (err) {
      if (err instanceof ApiRequestError) setError(err);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="space-y-4" data-testid="synthetic-demo-section">
      <SectionHeader
        title="Synthetic Multilingual Hospital Batch & Live Execution"
        subtitle="Non-sensitive 6-file demonstration dataset processed through the real Stage 1 privacy firewall via Phase 2A HTTP upload."
        provenance={activeRun ? "LIVE" : "DERIVED"}
        provenanceLabel={activeRun ? `LIVE RUN · ${activeRun.run_id.slice(0, 8)}` : "SYNTHETIC FIXTURE READY"}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={isRunning}
              onClick={() => void handleRunDemoPipeline()}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {phase === "acquiring_csrf"
                    ? "Acquiring CSRF..."
                    : phase === "uploading"
                      ? "Uploading Batch..."
                      : "Executing Stage 1 CLI..."}
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Run Synthetic Demo Pipeline (6 Files)
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Synthetic Notice Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-4 py-2.5 text-xs text-cyan-200">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          <span>{SYNTHETIC_DEMO_NOTICE}</span>
        </div>
        {health ? (
          <Badge variant={health.secret_configured ? "live" : "frozen"}>
            {health.secret_configured ? "Secret: Configured" : "Secret: CSPRNG Auto"}
          </Badge>
        ) : null}
      </div>

      {error ? (
        <ErrorState
          title={`Demo execution failed (${error.code})`}
          message={error.message}
          onRetry={() => void handleRunDemoPipeline()}
        />
      ) : null}

      {/* Synthetic File Inventory Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {SYNTHETIC_DEMO_FILES.map((file) => {
          const byteSize = new TextEncoder().encode(file.content).length;
          const isOpen = previewFileName === file.fileName;
          return (
            <Panel key={file.fileName} className="min-w-0">
              <PanelHeader>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    <PanelTitle className="truncate font-mono text-xs">{file.fileName}</PanelTitle>
                  </div>
                  <PanelDescription>
                    {file.formatLabel} · {formatBytes(byteSize)}
                  </PanelDescription>
                </div>
                <Badge variant={file.classification === "process" ? "live" : "frozen"}>
                  {file.classification === "process" ? "Process" : "Quarantine Test"}
                </Badge>
              </PanelHeader>
              <PanelContent className="space-y-3">
                <ul className="space-y-1 text-[11px] leading-relaxed text-slate-300">
                  {file.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400/80" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/70 pt-2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={isOpen ? "primary" : "secondary"}
                    onClick={() => setPreviewFileName(isOpen ? null : file.fileName)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {isOpen ? "Hide Source" : "Inspect Fixture"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadSyntheticFile(file.fileName, file.content, file.mimeType)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Save File
                  </Button>
                </div>
              </PanelContent>
            </Panel>
          );
        })}
      </div>

      {previewSpec ? (
        <Panel className="min-w-0" data-testid="synthetic-source-preview">
          <PanelHeader>
            <div className="min-w-0">
              <PanelTitle className="font-mono text-xs">
                Synthetic Input Fixture · {previewSpec.fileName}
              </PanelTitle>
              <PanelDescription>
                Static fabricated input text (zero real patient data) staged solely for pre-run demonstration inspection.
              </PanelDescription>
            </div>
            <Badge variant="derived">SYNTHETIC INPUT</Badge>
          </PanelHeader>
          <PanelContent>
            <pre className="max-h-60 overflow-auto rounded-md border border-slate-800/80 bg-[#080E1C] p-3 font-mono text-[11px] leading-relaxed text-slate-200">
              {previewSpec.content}
            </pre>
          </PanelContent>
        </Panel>
      ) : null}

      {/* Live Demo Output Telemetry Card */}
      {activeRun ? (
        <Panel className="min-w-0 border-emerald-500/30" data-testid="live-demo-run-card">
          <PanelHeader>
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <PanelTitle>Live Sanitization Run Completed · {activeRun.run_id}</PanelTitle>
                <PanelDescription>
                  Shared across Studio, Medical Registry, and Risk Analytics ({activeRun.timing.seconds.toFixed(2)}s · {activeRun.resources.peak_rss_mb.toFixed(1)} MB peak RSS · secret_source: {activeRun.secret_source}).
                </PanelDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge kind="LIVE" label="LIVE SUBPROCESS" />
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={isDeleting}
                onClick={() => void handleDeleteDemoRun(activeRun.run_id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeleting ? "Purging..." : "Delete Run"}
              </Button>
            </div>
          </PanelHeader>
          <PanelContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label="Files Sanitized"
                value={`${activeRun.counts.files_sanitized} / ${activeRun.counts.files_total}`}
                sublabel="Mirrored UTF-8 exports"
                provenance="LIVE"
                tone="emerald"
              />
              <KpiCard
                label="Files Quarantined"
                value={String(activeRun.counts.files_quarantined)}
                sublabel="Fail-closed binary isolation"
                provenance="LIVE"
                tone="amber"
              />
              <KpiCard
                label="Records Linked"
                value={`${activeRun.counts.records_linked} / ${activeRun.counts.records_processed}`}
                sublabel={`${activeRun.placeholder_summary.psn_count} distinct PSNs`}
                provenance="LIVE"
                tone="cyan"
              />
              <KpiCard
                label="Identifiers Detected"
                value={String(activeRun.counts.identifiers_detected)}
                sublabel="NER + gazetteer mentions"
                provenance="LIVE"
              />
              <KpiCard
                label="FHIR R4 Valid"
                value={`${activeRun.fhir_validation.bundles_valid} / ${activeRun.fhir_validation.bundles_total}`}
                sublabel="Phase 2A structural check"
                provenance="DERIVED"
                tone="emerald"
              />
              <KpiCard
                label="Alpha-PSN Contract"
                value={activeRun.placeholder_summary.all_alpha_psn_valid ? "PASS" : "FAIL"}
                sublabel="Zero all-digit PSNs"
                provenance="DERIVED"
                tone="emerald"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setActivePage("studio")}>
                <FlaskConical className="h-3.5 w-3.5" />
                Open Sanitization Studio
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setActivePage("registry")}>
                <Database className="h-3.5 w-3.5" />
                Explore Medical Registry
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setActivePage("privacy")}>
                Inspect Risk Analytics
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </PanelContent>
        </Panel>
      ) : null}
    </section>
  );
}
