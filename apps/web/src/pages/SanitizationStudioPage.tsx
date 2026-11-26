import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiRequestError,
  deleteSanitizationRun,
  fetchRunSummary,
  submitSanitizationRun,
  type SubmitRunPhase,
  type UploadProgressInfo,
} from "@/api/client";
import { useHealthQuery } from "@/api/queries";
import type { SecretMode } from "@/api/schemas";
import { RunResultsPanel } from "@/components/studio/RunResultsPanel";
import { SessionRunLookupBar } from "@/components/studio/SessionRunLookupBar";
import { UploadBatchPanel } from "@/components/studio/UploadBatchPanel";
import { ErrorState, OfflineApiBanner, SectionHeader } from "@/components/ui/state-views";
import type { SelectedUploadFile } from "@/config/backendContract";
import { useRunStore } from "@/stores/runStore";

export function SanitizationStudioPage() {
  const queryClient = useQueryClient();
  const healthQuery = useHealthQuery();
  const health = healthQuery.data?.data;

  const {
    activeRunId,
    activeRun,
    deletedNotice,
    sessionNotice,
    setActiveRun,
    markRunDeleted,
    clearExpiredSessionRun,
  } = useRunStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitRunPhase | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressInfo | null>(null);
  const [submitError, setSubmitError] = useState<ApiRequestError | null>(null);

  const [isLoadingRun, setIsLoadingRun] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const submitLockRef = useRef(false);

  const loadRunById = useCallback(
    async (runId: string, clearOn404ForSession = false) => {
      setIsLoadingRun(true);
      setLookupError(null);
      setDeleteError(null);
      try {
        const summary = await fetchRunSummary(runId);
        setActiveRun(summary);
      } catch (err) {
        if (err instanceof ApiRequestError) {
          if (clearOn404ForSession && err.status === 404) {
            clearExpiredSessionRun(
              `Session run ${runId} is no longer retained by the API adapter (expired or deleted).`,
            );
          } else {
            setLookupError(`${err.code}: ${err.message}`);
          }
        } else {
          setLookupError("Unable to retrieve run summary from the local API.");
        }
      } finally {
        setIsLoadingRun(false);
      }
    },
    [clearExpiredSessionRun, setActiveRun],
  );

  // Re-hydrate only if sessionStorage preserved an activeRunId cleanly across page reload
  useEffect(() => {
    if (activeRunId && !activeRun) {
      void loadRunById(activeRunId, true);
    }
  }, [activeRunId, activeRun, loadRunById]);

  const handleSubmitBatch = async (files: SelectedUploadFile[], secretMode: SecretMode) => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setLookupError(null);
    setDeleteError(null);
    setSubmitPhase("acquiring_csrf");
    setUploadProgress({ loadedBytes: 0, totalBytes: 0, percent: 0 });

    try {
      const summary = await submitSanitizationRun({
        files,
        secretMode,
        onPhaseChange: setSubmitPhase,
        onUploadProgress: setUploadProgress,
      });
      setActiveRun(summary);
      void queryClient.invalidateQueries({ queryKey: ["api", "health"] });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setSubmitError(err);
      } else {
        setSubmitError(
          new ApiRequestError("Unexpected failure while submitting sanitization batch.", {
            code: "SUBMIT_FAILED",
          }),
        );
      }
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
      setSubmitPhase(null);
      setUploadProgress(null);
    }
  };

  const handleDeleteRun = async (runId: string) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSanitizationRun(runId);
      markRunDeleted(runId);
      void queryClient.invalidateQueries({ queryKey: ["api", "health"] });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 404) {
          markRunDeleted(runId);
          void queryClient.invalidateQueries({ queryKey: ["api", "health"] });
          return;
        }
        setDeleteError(`${err.code}: ${err.message}`);
      } else {
        setDeleteError("Failed to delete run on the local API adapter.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Sanitization Studio"
        subtitle="Submit medical files through the CSRF-protected FastAPI adapter, execute the frozen Phase 1E CLI in an isolated subprocess, and inspect verified results."
        provenance={health ? "LIVE" : "EMPTY"}
        provenanceLabel={health ? "LIVE · ADAPTER WORKFLOW" : "API CHECK"}
      />

      {healthQuery.isError ? (
        <OfflineApiBanner onRetry={() => void healthQuery.refetch()} />
      ) : null}

      <SessionRunLookupBar
        activeRunId={activeRun?.run_id ?? activeRunId}
        isBusy={isSubmitting || isLoadingRun || isDeleting}
        onLookupRun={(id) => loadRunById(id, false)}
        onRefreshActive={async () => {
          const id = activeRun?.run_id ?? activeRunId;
          if (id) await loadRunById(id, true);
        }}
      />

      {lookupError ? (
        <ErrorState
          title="Unable to retrieve sanitization run"
          message={lookupError}
        />
      ) : null}

      {deleteError ? (
        <ErrorState
          title="Unable to delete sanitization run"
          message={deleteError}
        />
      ) : null}

      <UploadBatchPanel
        isSubmitting={isSubmitting}
        submitPhase={submitPhase}
        uploadProgress={uploadProgress}
        submitError={submitError}
        health={health}
        onSubmitBatch={handleSubmitBatch}
        onDismissError={() => setSubmitError(null)}
      />

      <RunResultsPanel
        run={activeRun}
        deletedNotice={deletedNotice}
        sessionNotice={sessionNotice}
        isDeleting={isDeleting}
        onDeleteRun={handleDeleteRun}
      />
    </div>
  );
}

