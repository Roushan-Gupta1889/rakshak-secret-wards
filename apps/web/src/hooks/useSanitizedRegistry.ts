import { useQuery } from "@tanstack/react-query";
import {
  ApiRequestError,
  fetchAllRunRecordsIndex,
  fetchRunSummary,
  fetchSanitizedTextFile,
} from "@/api/client";
import {
  buildSanitizedRegistry,
  MAX_REGISTRY_FILE_BYTES,
  type SanitizedRegistryResult,
} from "@/lib/sanitizedRegistryParser";

const FILE_FETCH_CONCURRENCY = 6;

async function fetchFilesBounded(
  runId: string,
  paths: string[],
): Promise<{ loaded: Map<string, string>; failed: string[] }> {
  const loaded = new Map<string, string>();
  const failed: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < paths.length) {
      const idx = cursor++;
      const filePath = paths[idx];
      try {
        const text = await fetchSanitizedTextFile(runId, filePath);
        loaded.set(filePath, text);
      } catch {
        failed.push(filePath);
      }
    }
  }

  const count = Math.min(FILE_FETCH_CONCURRENCY, paths.length);
  await Promise.all(Array.from({ length: count }, () => worker()));
  return { loaded, failed };
}

export function useSanitizedRegistryQuery(runId: string | null) {
  return useQuery<SanitizedRegistryResult, Error>({
    queryKey: ["api", "registry", runId],
    enabled: Boolean(runId),
    staleTime: 15_000,
    gcTime: 60_000,
    retry: (_failureCount, error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        return false;
      }
      return _failureCount < 1;
    },
    queryFn: async () => {
      if (!runId) {
        throw new ApiRequestError("No run selected for Medical Registry.", {
          code: "NO_RUN_ID",
        });
      }

      const [summary, indexData] = await Promise.all([
        fetchRunSummary(runId),
        fetchAllRunRecordsIndex(runId),
      ]);

      const sizeByOutput = new Map<string, number>();
      for (const f of summary.files) {
        if (f.output && typeof f.size_bytes === "number") {
          sizeByOutput.set(f.output, f.size_bytes);
        }
      }

      const patientFilePaths = Array.from(
        new Set(
          indexData.records
            .filter((r) => Boolean(r.patient && r.patient.trim()))
            .map((r) => r.file),
        ),
      );

      const skippedOversizedFiles: string[] = [];
      const eligiblePaths: string[] = [];

      for (const fp of patientFilePaths) {
        const bytes = sizeByOutput.get(fp);
        if (typeof bytes === "number" && bytes > MAX_REGISTRY_FILE_BYTES) {
          skippedOversizedFiles.push(fp);
        } else {
          eligiblePaths.push(fp);
        }
      }

      const { loaded, failed } = await fetchFilesBounded(runId, eligiblePaths);

      return buildSanitizedRegistry({
        summary,
        indexRecords: indexData.records,
        indexTotal: indexData.total,
        fileTextsByPath: loaded,
        skippedOversizedFiles,
        failedFiles: failed,
      });
    },
  });
}
