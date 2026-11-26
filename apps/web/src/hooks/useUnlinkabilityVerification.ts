import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ApiRequestError,
  deleteSanitizationRun,
  fetchAllRunRecordsIndex,
  submitSanitizationRun,
} from "@/api/client";
import type { HealthResponse } from "@/api/schemas";
import {
  createSyntheticVerificationCsv,
  evaluateCrossSecretUnlinkability,
  evaluateDeterminism,
  evaluateFormatBatch,
  evaluateLiveCollisions,
  type CrossSecretReport,
  type DeterminismReport,
  type FormatValidationReport,
  type LiveCollisionReport,
} from "@/lib/unlinkabilityAnalyzer";

export interface UnlinkabilitySuiteReport {
  executedAtIso: string;
  sampleSize: 20 | 40;
  secretConfiguredOnServer: boolean;
  runsExecutedCount: number;
  cleanupCompleted: boolean;
  cleanupWarnings: string[];
  determinism: DeterminismReport;
  crossSecret: CrossSecretReport;
  format: FormatValidationReport;
  collision: LiveCollisionReport;
}

export function useUnlinkabilityVerification(health: HealthResponse | undefined) {
  const queryClient = useQueryClient();
  const lockRef = useRef(false);

  const [isRunning, setIsRunning] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [report, setReport] = useState<UnlinkabilitySuiteReport | null>(null);

  const runSuite = useCallback(
    async (sampleSize: 20 | 40) => {
      if (lockRef.current) return;
      lockRef.current = true;
      setIsRunning(true);
      setError(null);
      setProgressLabel("Preparing synthetic patient-key CSV fixture...");

      const createdRunIds: string[] = [];
      const cleanupWarnings: string[] = [];

      try {
        const { uploadFile } = createSyntheticVerificationCsv(sampleSize);
        const hasConfiguredSecret = health?.secret_configured ?? true;

        // Run A: configured (when available) or ephemeral S1
        setProgressLabel(
          hasConfiguredSecret
            ? "Run 1/3 · Executing Stage 1 CLI with server RAKSHA_SECRET (A)..."
            : "Run 1/2 · Executing Stage 1 CLI with ephemeral CSPRNG secret S1...",
        );
        const runA = await submitSanitizationRun({
          files: [uploadFile],
          secretMode: hasConfiguredSecret ? "configured" : "ephemeral",
        });
        createdRunIds.push(runA.run_id);
        const idxA = await fetchAllRunRecordsIndex(runA.run_id);

        // Run B (Determinism repeat under configured secret, if available)
        let determinism: DeterminismReport;
        if (runA.secret_source === "configured") {
          setProgressLabel("Run 2/3 · Executing Stage 1 CLI repeat under same server secret (B)...");
          try {
            const runB = await submitSanitizationRun({
              files: [uploadFile],
              secretMode: "configured",
            });
            createdRunIds.push(runB.run_id);
            const idxB = await fetchAllRunRecordsIndex(runB.run_id);
            determinism = evaluateDeterminism({
              runAId: runA.run_id,
              runBId: runB.run_id,
              runAItems: idxA.records,
              runBItems: idxB.records,
            });
          } catch (innerErr) {
            if (innerErr instanceof ApiRequestError && innerErr.code === "SECRET_NOT_CONFIGURED") {
              determinism = {
                status: "BLOCKED",
                blockReason:
                  "Server environment does not define RAKSHA_SECRET (SECRET_NOT_CONFIGURED). Two repeated calls require a configured secret or the proposed isolated verification endpoint.",
                pairCount: 0,
                matchingCount: 0,
                mismatchCount: 0,
                samples: [],
              };
            } else {
              throw innerErr;
            }
          }
        } else {
          determinism = {
            status: "BLOCKED",
            blockReason:
              "Server reports secret_configured: false. Same-secret determinism requires a configured server RAKSHA_SECRET because ephemeral mode generates a fresh CSPRNG secret on every invocation.",
            pairCount: 0,
            matchingCount: 0,
            mismatchCount: 0,
            samples: [],
          };
        }

        // Run C: Distinct CSPRNG ephemeral secret generated in isolated FastAPI child env
        setProgressLabel(
          runA.secret_source === "configured"
            ? "Run 3/3 · Executing Stage 1 CLI with isolated CSPRNG secret (C)..."
            : "Run 2/2 · Executing Stage 1 CLI with distinct CSPRNG secret S2...",
        );
        const runC = await submitSanitizationRun({
          files: [uploadFile],
          secretMode: "ephemeral",
        });
        createdRunIds.push(runC.run_id);
        const idxC = await fetchAllRunRecordsIndex(runC.run_id);

        const crossSecret = evaluateCrossSecretUnlinkability({
          runAId: runA.run_id,
          runCId: runC.run_id,
          runAItems: idxA.records,
          runCItems: idxC.records,
        });

        const allProduced = [...idxA.records, ...idxC.records];
        const format = evaluateFormatBatch(allProduced);
        const collision = evaluateLiveCollisions(
          idxA.records,
          `Live synthetic verification run (${runA.run_id})`,
        );

        setProgressLabel("Cleaning ephemeral verification workspaces via DELETE /api/runs/{id}...");
        for (const rid of [...createdRunIds]) {
          try {
            await deleteSanitizationRun(rid);
            const pos = createdRunIds.indexOf(rid);
            if (pos >= 0) createdRunIds.splice(pos, 1);
          } catch (delErr) {
            const msg = delErr instanceof Error ? delErr.message : String(delErr);
            cleanupWarnings.push(`Run ${rid} cleanup warning: ${msg}`);
          }
        }

        setReport({
          executedAtIso: new Date().toISOString(),
          sampleSize,
          secretConfiguredOnServer: runA.secret_source === "configured",
          runsExecutedCount: runA.secret_source === "configured" && determinism.status !== "BLOCKED" ? 3 : 2,
          cleanupCompleted: cleanupWarnings.length === 0,
          cleanupWarnings,
          determinism,
          crossSecret,
          format,
          collision,
        });
      } catch (err) {
        for (const rid of createdRunIds) {
          try {
            await deleteSanitizationRun(rid);
          } catch {
            // best effort cleanup on failure
          }
        }
        setReport(null);
        if (err instanceof ApiRequestError) {
          setError(err);
        } else {
          setError(
            new ApiRequestError("Cryptographic verification run failed unexpectedly.", {
              code: "VERIFICATION_FAILED",
            }),
          );
        }
      } finally {
        lockRef.current = false;
        setIsRunning(false);
        setProgressLabel(null);
        void queryClient.invalidateQueries({ queryKey: ["api", "health"] });
      }
    },
    [health?.secret_configured, queryClient],
  );

  return {
    isRunning,
    progressLabel,
    error,
    report,
    runSuite,
    clearReport: () => {
      setReport(null);
      setError(null);
    },
  };
}
