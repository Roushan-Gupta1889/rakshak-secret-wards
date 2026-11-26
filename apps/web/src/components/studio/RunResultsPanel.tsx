import { useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Archive,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileCheck2,
  Files,
  Loader2,
  ScanSearch,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  ApiRequestError,
  buildRunBundleDownloadUrl,
  buildSanitizedFileDownloadUrl,
  downloadRunArtifact,
} from "@/api/client";
import type { ManifestFileEntry, RunSummaryResponse } from "@/api/schemas";
import { KpiCard } from "@/components/common/KpiCard";
import { DataTable } from "@/components/tables/DataTable";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state-views";
import { formatBytes } from "@/config/backendContract";
import { formatTimestampIso, shortSha } from "@/lib/utils";
import type { DeletedRunNotice } from "@/stores/runStore";

export function RunResultsPanel({
  run,
  deletedNotice,
  sessionNotice,
  isDeleting,
  onDeleteRun,
}: {
  run: RunSummaryResponse | null;
  deletedNotice: DeletedRunNotice | null;
  sessionNotice: string | null;
  isDeleting: boolean;
  onDeleteRun: (runId: string) => Promise<void>;
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDownload = async (key: string, url: string, fallbackName: string) => {
    setDownloadError(null);
    setDownloadingKey(key);
    try {
      await downloadRunArtifact(url, fallbackName);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setDownloadError(`${err.code}: ${err.message}`);
      } else {
        setDownloadError("Failed to download sanitized artifact.");
      }
    } finally {
      setDownloadingKey(null);
    }
  };

  const manifestColumns = useMemo<ColumnDef<ManifestFileEntry, unknown>[]>(
    () => [
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const st = String(getValue());
          return (
            <Badge variant={st === "sanitized" ? "live" : "frozen"}>
              {st === "sanitized" ? "sanitized" : "quarantined"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "output",
        header: "Sanitized Output Path",
        cell: ({ row }) => {
          const out = row.original.output;
          return out ? (
            <span className="break-all font-mono text-[11px] text-slate-100">{out}</span>
          ) : (
            <span className="text-[11px] italic text-slate-400">
              Not available (quarantined input — SHA-256 only)
            </span>
          );
        },
      },
      {
        accessorKey: "input_sha256",
        header: "Input SHA-256",
        cell: ({ getValue }) => (
          <span className="font-mono text-[11px] text-slate-300">
            {shortSha(String(getValue()), 16)}
          </span>
        ),
      },
      {
        accessorKey: "size_bytes",
        header: "Size",
        cell: ({ getValue }) => {
          const val = getValue();
          return (
            <span className="font-mono text-[11px] text-slate-300 tabular-nums">
              {typeof val === "number" ? formatBytes(val) : "Not available"}
            </span>
          );
        },
      },
      {
        accessorKey: "reason",
        header: "Quarantine Reason",
        cell: ({ getValue }) => {
          const reason = getValue();
          return reason ? (
            <span className="text-[11px] text-amber-200">{String(reason)}</span>
          ) : (
            <span className="text-[11px] text-slate-500">—</span>
          );
        },
      },
      {
        id: "action",
        header: "Download",
        cell: ({ row }) => {
          const entry = row.original;
          if (!run || entry.status !== "sanitized" || !entry.output) {
            return <span className="text-[11px] text-slate-500">—</span>;
          }
          const key = `file:${entry.output}`;
          const busy = downloadingKey === key;
          const fileName = entry.output.split("/").pop() || "sanitized.txt";
          return (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || isDeleting}
              onClick={() =>
                void handleDownload(
                  key,
                  buildSanitizedFileDownloadUrl(run.run_id, entry.output!, true),
                  fileName,
                )
              }
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Download
            </Button>
          );
        },
      },
    ],
    [downloadingKey, isDeleting, run],
  );

  if (!run) {
    return (
      <div className="space-y-3">
        {deletedNotice ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-200"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                Run <code className="font-mono text-emerald-300">{deletedNotice.runId}</code> was removed from the local API workspace (<code className="font-mono">DELETE /api/runs/{deletedNotice.runId}</code> · 204). Server directory unlinked via logical deletion.
              </span>
            </div>
            <ProvenanceBadge kind="LIVE" label="DELETED ON SERVER" />
          </div>
        ) : null}

        {sessionNotice ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{sessionNotice}</span>
          </div>
        ) : null}

        <EmptyState
          title="No completed sanitization run loaded"
          description="Select files above and run the Stage 1 pipeline, or load a retained 16-hex run identifier to inspect real sanitization telemetry, FHIR validation, and exportable bundles."
        />
      </div>
    );
  }

  const entityEntries = Object.entries(run.entities).sort((a, b) => b[1] - a[1]);
  const placeholderEntries = Object.entries(run.placeholder_summary.counts).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="space-y-5" data-testid="run-results-panel">
      {/* Run Metadata & Export/Delete Bar */}
      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <PanelTitle>Sanitization Run Summary · {run.run_id}</PanelTitle>
              <ProvenanceBadge kind="LIVE" label={`STATUS · ${run.status.toUpperCase()}`} />
              <Badge variant={run.secret_source === "configured" ? "cyan" : "default"}>
                secret_source: {run.secret_source}
              </Badge>
            </div>
            <PanelDescription className="font-mono text-[11px]">
              schema: {run.schema_version} · created: {formatTimestampIso(run.created_at)} · expires: {formatTimestampIso(run.expires_at)}
            </PanelDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={downloadingKey === "bundle" || isDeleting}
              onClick={() =>
                void handleDownload(
                  "bundle",
                  buildRunBundleDownloadUrl(run.run_id),
                  `rakshak_${run.run_id}.zip`,
                )
              }
            >
              {downloadingKey === "bundle" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              Download Bundle (.zip)
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isDeleting || downloadingKey !== null}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Run
            </Button>
          </div>
        </PanelHeader>

        {downloadError ? (
          <PanelContent className="pt-3 pb-0">
            <ErrorState title="Artifact download failed" message={downloadError} />
          </PanelContent>
        ) : null}

        <PanelContent className="space-y-4">
          {/* Primary Live Counters */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Input Files"
              value={String(run.counts.files_total)}
              sublabel={`${run.counts.files_sanitized} sanitized · ${run.counts.files_quarantined} quarantined`}
              provenance="LIVE"
              icon={<Files className="h-4 w-4" />}
              tone="cyan"
            />
            <KpiCard
              label="Sanitized Outputs"
              value={String(run.counts.files_sanitized)}
              sublabel="Exported clean tree"
              provenance="LIVE"
              icon={<FileCheck2 className="h-4 w-4" />}
              tone="emerald"
            />
            <KpiCard
              label="Quarantined Inputs"
              value={String(run.counts.files_quarantined)}
              sublabel={`${run.counts.records_quarantined} record units`}
              provenance="LIVE"
              icon={<ShieldBan className="h-4 w-4" />}
              tone={run.counts.files_quarantined > 0 ? "amber" : "neutral"}
            />
            <KpiCard
              label="Records Processed"
              value={String(run.counts.records_processed)}
              sublabel={`${run.counts.records_linked} linked clusters`}
              provenance="LIVE"
              icon={<Database className="h-4 w-4" />}
            />
            <KpiCard
              label="Identifiers Detected"
              value={String(run.counts.identifiers_detected)}
              sublabel="Report entity total"
              provenance="LIVE"
              icon={<ScanSearch className="h-4 w-4" />}
              tone="cyan"
            />
            <KpiCard
              label="Engine Runtime"
              value={`${run.timing.seconds.toFixed(2)}s`}
              sublabel={`Peak RSS ${run.resources.peak_rss_mb.toFixed(1)} MB`}
              provenance="LIVE"
              icon={<Clock className="h-4 w-4" />}
            />
          </div>

          {/* Secondary LIVE/DERIVED Cards */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Detected Entities */}
            <div className="min-w-0 rounded-lg border border-slate-800/80 bg-[#080E1C] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-100">Detected Entities</p>
                <ProvenanceBadge kind="LIVE" label="LIVE · REPORT.JSON" />
              </div>
              {entityEntries.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entityEntries.map(([k, count]) => (
                    <Badge key={k} variant="cyan">
                      {k}: {count}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-400">
                  Not available — zero entity types reported in report.json.
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
                <span>
                  Generalized records:{" "}
                  <strong className="font-mono text-slate-200">{run.counts.records_generalized}</strong>
                </span>
                <span>
                  Suppressed records:{" "}
                  <strong className="font-mono text-slate-200">{run.counts.records_suppressed}</strong>
                </span>
              </div>
            </div>

            {/* Derived FHIR Validation */}
            <div className="min-w-0 rounded-lg border border-slate-800/80 bg-[#080E1C] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-100">FHIR R4 Bundle Validation</p>
                <ProvenanceBadge kind="DERIVED" label="DERIVED" />
              </div>
              {run.fhir_validation.bundles_total > 0 ? (
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bundles Inspected</span>
                    <span className="font-mono text-slate-100">{run.fhir_validation.bundles_total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Valid FHIR Bundles</span>
                    <span className="font-mono text-emerald-300">{run.fhir_validation.bundles_valid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Invalid Bundles</span>
                    <span
                      className={
                        run.fhir_validation.bundles_invalid > 0
                          ? "font-mono text-red-300"
                          : "font-mono text-slate-300"
                      }
                    >
                      {run.fhir_validation.bundles_invalid}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-400">
                  No FHIR R4 bundles present in this run (0 / 0). Honest count reported rather than inferred.
                </p>
              )}
            </div>

            {/* Derived Pseudonym & Adaptive Cohort Markers */}
            <div className="min-w-0 rounded-lg border border-slate-800/80 bg-[#080E1C] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-100">Pseudonym &amp; K-Cohort Summary</p>
                <ProvenanceBadge kind="DERIVED" label="DERIVED" />
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Distinct Linked PSNs</span>
                  <span className="font-mono text-slate-100">{run.placeholder_summary.psn_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">All-Alpha PSN Check</span>
                  <Badge variant={run.placeholder_summary.all_alpha_psn_valid ? "live" : "danger"}>
                    {run.placeholder_summary.all_alpha_psn_valid ? "VALID" : "FAILED"}
                  </Badge>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Cohort [DISTRICT] / [PIN]</span>
                  <span className="font-mono text-slate-200">
                    {run.cohort_summary.generalized_district_markers} / {run.cohort_summary.suppressed_pin_markers}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Suppressed [DOB] / [AGE]</span>
                  <span className="font-mono text-slate-200">
                    {run.cohort_summary.suppressed_dob_markers} / {run.cohort_summary.suppressed_age_markers}
                  </span>
                </div>
              </div>
              {placeholderEntries.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1 border-t border-slate-800/80 pt-2">
                  {placeholderEntries.slice(0, 6).map(([tag, cnt]) => (
                    <Badge key={tag} variant="default">
                      {tag}:{cnt}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </PanelContent>
      </Panel>

      {/* Output & Quarantine File Manifest Table */}
      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0">
            <PanelTitle>File Manifest &amp; Sanitized Downloads</PanelTitle>
            <PanelDescription>
              Authoritative <code className="font-mono text-slate-300">report.json</code> file entries. Individual record previews are intentionally withheld in Studio results to minimize unnecessary PII/pseudonym exposure.
            </PanelDescription>
          </div>
          <ProvenanceBadge kind="LIVE" label={`${run.files.length} FILES`} />
        </PanelHeader>
        <PanelContent>
          <DataTable
            data={run.files}
            columns={manifestColumns}
            emptyTitle="No file entries recorded"
            emptyDescription="The backend run report returned zero file manifest entries."
          />
        </PanelContent>
      </Panel>

      {/* Logical Deletion Confirmation Dialog */}
      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px]" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-700 bg-[#0D1424] p-5 shadow-2xl focus:outline-none">
            <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              Confirm Logical Run Deletion
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-xs leading-relaxed text-slate-300">
              Deleting run <code className="font-mono text-cyan-300">{run.run_id}</code> removes retained output files and metadata from the API adapter workspace via OS directory unlink (<code className="font-mono">shutil.rmtree</code>).
            </Dialog.Description>
            <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
              Security note: Standard filesystem deletion is logical unlinking and does not constitute forensic cryptographic wipe of underlying storage blocks.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={isDeleting}
                onClick={async () => {
                  await onDeleteRun(run.run_id);
                  setConfirmOpen(false);
                }}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Confirm Delete Run
                  </>
                )}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

