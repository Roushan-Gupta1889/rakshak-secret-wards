import { useId, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
  FolderUp,
  Info,
  KeyRound,
  Loader2,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { ApiRequestError, SubmitRunPhase, UploadProgressInfo } from "@/api/client";
import { SecretModeSchema, type HealthResponse, type SecretMode } from "@/api/schemas";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/state-views";
import {
  BACKEND_CONTRACT,
  formatBytes,
  mergeValidatedBatch,
  type FileValidationError,
  type SelectedUploadFile,
} from "@/config/backendContract";
import { cn } from "@/lib/utils";

const SecretFormSchema = z.object({
  secretMode: SecretModeSchema,
});

type SecretFormValues = z.infer<typeof SecretFormSchema>;

const PHASE_COPY: Record<SubmitRunPhase, string> = {
  acquiring_csrf: "Step 1/3 · Acquiring signed double-submit CSRF token (GET /api/csrf)...",
  uploading: "Step 2/3 · Uploading validated batch to POST /api/runs...",
  processing: "Step 3/3 · Executing isolated Phase 1E Stage 1 CLI subprocess...",
};

export function UploadBatchPanel({
  isSubmitting,
  submitPhase,
  uploadProgress,
  submitError,
  health,
  onSubmitBatch,
  onDismissError,
}: {
  isSubmitting: boolean;
  submitPhase: SubmitRunPhase | null;
  uploadProgress: UploadProgressInfo | null;
  submitError: ApiRequestError | null;
  health: HealthResponse | undefined;
  onSubmitBatch: (files: SelectedUploadFile[], secretMode: SecretMode) => Promise<void>;
  onDismissError: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [selectedFiles, setSelectedFiles] = useState<SelectedUploadFile[]>([]);
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const { register, handleSubmit, watch } = useForm<SecretFormValues>({
    resolver: zodResolver(SecretFormSchema),
    defaultValues: { secretMode: "auto" },
  });

  const secretMode = watch("secretMode");

  const stats = useMemo(() => {
    let totalBytes = 0;
    let processCount = 0;
    let quarantineCount = 0;
    for (const item of selectedFiles) {
      totalBytes += item.sizeBytes;
      if (item.classification === "process") processCount += 1;
      else quarantineCount += 1;
    }
    const batchPct = Math.min(100, Math.round((totalBytes / BACKEND_CONTRACT.maxBatchBytes) * 100));
    return { totalBytes, processCount, quarantineCount, batchPct };
  }, [selectedFiles]);

  const handleIncomingFiles = (fileList: FileList | File[] | null) => {
    if (!fileList || !fileList.length || isSubmitting) return;
    onDismissError();
    const res = mergeValidatedBatch(selectedFiles, Array.from(fileList));
    setSelectedFiles(res.accepted);
    setValidationErrors(res.errors);
  };

  const handleClear = () => {
    if (isSubmitting) return;
    setSelectedFiles([]);
    setValidationErrors([]);
    onDismissError();
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleRemoveOne = (id: string) => {
    if (isSubmitting) return;
    setSelectedFiles((prev) => prev.filter((item) => item.id !== id));
    setValidationErrors([]);
  };

  const onFormSubmit = handleSubmit(async ({ secretMode: chosenMode }) => {
    if (isSubmitting || !selectedFiles.length) return;
    await onSubmitBatch(selectedFiles, chosenMode);
  });

  const configuredMissingWarning =
    secretMode === "configured" && health && !health.secret_configured;

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Left: Dropzone & Selected Queue */}
      <Panel className="min-w-0 lg:col-span-8">
        <PanelHeader>
          <div className="min-w-0">
            <PanelTitle>Batch Input Staging &amp; Client Pre-Validation</PanelTitle>
            <PanelDescription>
              Files are staged in-browser, pre-validated against Phase 2A bounds, and submitted over CSRF-protected multipart upload.
            </PanelDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge kind="FROZEN" label="LIMITS · PHASE 2A CONFIG" />
          </div>
        </PanelHeader>

        <PanelContent className="space-y-4">
          {/* Drag-and-drop Zone */}
          <div
            data-testid="studio-dropzone"
            onDragEnter={(e) => {
              e.preventDefault();
              if (!isSubmitting) setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isSubmitting) setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleIncomingFiles(e.dataTransfer?.files ?? null);
            }}
            className={cn(
              "rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
              dragActive
                ? "border-cyan-400 bg-cyan-500/10"
                : "border-slate-700/80 bg-[#080E1C]",
              isSubmitting ? "opacity-60" : "",
            )}
          >
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              multiple
              accept={BACKEND_CONTRACT.allowedExtensions.join(",")}
              disabled={isSubmitting}
              className="sr-only"
              aria-label="Upload files for sanitization"
              onChange={(e) => {
                handleIncomingFiles(e.target.files);
                if (e.target) e.target.value = "";
              }}
            />
            <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
              <FolderUp className="h-5 w-5" />
            </div>
            <p className="text-xs font-medium text-slate-200">
              Drag &amp; drop medical input files here, or open the file picker
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Supports multi-file selection up to {BACKEND_CONTRACT.maxFilesPerRun} files ({formatBytes(BACKEND_CONTRACT.maxBatchBytes)} total, {formatBytes(BACKEND_CONTRACT.maxFileBytes)} per file).
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="primary"
                disabled={isSubmitting}
                onClick={() => inputRef.current?.click()}
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                Select Files
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting || (!selectedFiles.length && !validationErrors.length)}
                onClick={handleClear}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear Selected
              </Button>
            </div>
          </div>

          {/* Client Validation Errors */}
          {validationErrors.length > 0 ? (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/35 bg-amber-500/5 px-4 py-3 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    <p className="font-medium text-amber-200">
                      {validationErrors.length} file validation issue{validationErrors.length > 1 ? "s" : ""} blocked before upload
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[11px] text-amber-300/90">
                      {validationErrors.map((err, idx) => (
                        <li key={`${err.fileName}-${err.code}-${idx}`} className="break-all">
                          <span className="font-mono text-amber-200">[{err.code}]</span> {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setValidationErrors([])}
                  aria-label="Dismiss validation errors"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* Batch Counters + Size Gauge */}
          <div className="rounded-md border border-slate-800/80 bg-[#080E1C] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
                <span className="text-slate-300">
                  Selected: <strong className="text-slate-100">{selectedFiles.length}</strong>/{BACKEND_CONTRACT.maxFilesPerRun}
                </span>
                <span className="text-slate-300">
                  Total Size: <strong className="text-slate-100">{formatBytes(stats.totalBytes)}</strong> / {formatBytes(BACKEND_CONTRACT.maxBatchBytes)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="cyan">Process: {stats.processCount}</Badge>
                <Badge variant={stats.quarantineCount > 0 ? "frozen" : "default"}>
                  Quarantine: {stats.quarantineCount}
                </Badge>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-400 transition-[width] duration-200"
                style={{ width: `${stats.batchPct}%` }}
              />
            </div>
          </div>

          {/* Selected File List */}
          {selectedFiles.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-slate-800/80">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-[#090F1E] text-[11px] uppercase tracking-wider text-slate-400">
                  <tr className="border-b border-slate-800/80">
                    <th className="px-3 py-2 font-medium">File Name</th>
                    <th className="px-3 py-2 font-medium">Format</th>
                    <th className="px-3 py-2 font-medium">Routing</th>
                    <th className="px-3 py-2 font-medium text-right">Size</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 bg-[#0D1424]/70">
                  {selectedFiles.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/35">
                      <td className="px-3 py-2 break-all font-mono text-[11px] text-slate-100">
                        {item.relPath}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="default">{item.extension}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={item.classification === "process" ? "cyan" : "frozen"}>
                          {item.classification === "process" ? "Sanitize" : "Quarantine"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[11px] text-slate-300 tabular-nums">
                        {formatBytes(item.sizeBytes)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={isSubmitting}
                          aria-label={`Remove ${item.relPath}`}
                          onClick={() => handleRemoveOne(item.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-slate-800/70 bg-[#090F1D]/60 px-4 py-3 text-center text-xs text-slate-400">
              No files queued. Select `.csv`, `.tsv`, `.json`, or `.txt` files to sanitize (plus `.pdf`/image/XML inputs to test quarantine routing).
            </div>
          )}

          {/* Backend / Submission Errors */}
          {submitError ? (
            <ErrorState
              title={`Sanitization run rejected (${submitError.code})`}
              message={submitError.message}
              onRetry={() => {
                void onSubmitBatch(selectedFiles, secretMode);
              }}
            />
          ) : null}

          {/* Execution & Upload Progress */}
          {isSubmitting && submitPhase ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border border-cyan-500/35 bg-cyan-500/5 px-4 py-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-medium text-cyan-200">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  <span>{PHASE_COPY[submitPhase]}</span>
                </div>
                {submitPhase === "uploading" && uploadProgress?.percent !== null && uploadProgress ? (
                  <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
                    {uploadProgress.percent}% ({formatBytes(uploadProgress.loadedBytes)} / {formatBytes(uploadProgress.totalBytes)})
                  </span>
                ) : null}
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={cn(
                    "h-full rounded-full bg-cyan-400 transition-[width] duration-150",
                    submitPhase === "processing" ? "w-full animate-pulse bg-emerald-400" : "",
                  )}
                  style={
                    submitPhase === "uploading"
                      ? { width: `${uploadProgress?.percent ?? 15}%` }
                      : undefined
                  }
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Outputs are marked sanitized strictly after the backend adapter completes subprocess verification and returns HTTP 201.
              </p>
            </div>
          ) : null}
        </PanelContent>
      </Panel>

      {/* Right: Backend Format Spec & Execution Form */}
      <div className="space-y-4 lg:col-span-4">
        <Panel className="min-w-0">
          <PanelHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-cyan-400" />
              <PanelTitle>Execution Controls</PanelTitle>
            </div>
            <ProvenanceBadge kind={health ? "LIVE" : "EMPTY"} label={health ? "ADAPTER READY" : "CHECK API"} />
          </PanelHeader>
          <PanelContent>
            <form onSubmit={onFormSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Subprocess Secret Mode
                </label>
                <div className="space-y-2 text-xs">
                  {(
                    [
                      {
                        value: "auto",
                        label: "Auto (Recommended)",
                        desc: "Uses server RAKSHA_SECRET if configured; falls back to CSPRNG per-run secret.",
                      },
                      {
                        value: "configured",
                        label: "Server Configured Secret",
                        desc: "Requires server RAKSHA_SECRET env var; enables deterministic cross-run pseudonyms.",
                      },
                      {
                        value: "ephemeral",
                        label: "CSPRNG Ephemeral",
                        desc: "Forces a fresh random 32-byte key in child process env; zero cross-run linkage.",
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-md border p-2.5 transition-colors",
                        secretMode === opt.value
                          ? "border-cyan-500/45 bg-cyan-500/10"
                          : "border-slate-800/80 bg-[#080E1C] hover:border-slate-700",
                      )}
                    >
                      <input
                        type="radio"
                        value={opt.value}
                        disabled={isSubmitting}
                        {...register("secretMode")}
                        className="mt-0.5 accent-cyan-400"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-100">{opt.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
                          {opt.desc}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {configuredMissingWarning ? (
                  <p className="rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[11px] text-amber-200">
                    Live health reports <code className="font-mono">secret_configured: false</code>; server will reject <code className="font-mono">configured</code> with <code className="font-mono">SECRET_NOT_CONFIGURED</code>.
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center py-2.5"
                disabled={isSubmitting || selectedFiles.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sanitizing Batch...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Sanitization Pipeline ({selectedFiles.length})
                  </>
                )}
              </Button>

              <p className="text-[11px] leading-relaxed text-slate-400">
                Arbitrary secret submission from the browser is disabled by Phase 2A policy. Secrets remain isolated in child subprocess environments and are never stored in browser storage.
              </p>
            </form>
          </PanelContent>
        </Panel>

        {/* Supported Formats & Backend Authoritative Policy Card */}
        <Panel className="min-w-0">
          <PanelHeader>
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-amber-400" />
              <PanelTitle>Backend Format &amp; Size Contract</PanelTitle>
            </div>
            <ProvenanceBadge kind="FROZEN" label="FROZEN · CONFIG.PY" />
          </PanelHeader>
          <PanelContent className="space-y-3 text-xs text-slate-300">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Sanitized Formats
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {BACKEND_CONTRACT.processExtensions.map((ext) => (
                  <Badge key={ext} variant="live">
                    <CheckCircle2 className="h-3 w-3" />
                    {ext}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Quarantine-Only Formats
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {BACKEND_CONTRACT.quarantineExtensions.map((ext) => (
                  <Badge key={ext} variant="frozen">
                    {ext}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 rounded-md border border-slate-800/80 bg-[#080E1C] p-2.5 font-mono text-[11px] text-slate-300">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Max file size</span>
                <span>{formatBytes(BACKEND_CONTRACT.maxFileBytes)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Max batch size</span>
                <span>{formatBytes(BACKEND_CONTRACT.maxBatchBytes)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Max files / run</span>
                <span>{BACKEND_CONTRACT.maxFilesPerRun}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Run retention TTL</span>
                <span>{BACKEND_CONTRACT.jobTtlSeconds / 60} min</span>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-400">
              Mirrored from frozen Phase 2A <code className="font-mono text-slate-300">apps/api/rakshak_api/config.py</code> (<code className="font-mono text-slate-300">GET /api/health</code> and <code className="font-mono text-slate-300">GET /api/policy</code> do not expose upload limits at runtime). Server checks remain authoritative.
            </p>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}

