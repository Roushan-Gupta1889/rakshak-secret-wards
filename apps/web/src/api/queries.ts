import { useQuery } from "@tanstack/react-query";
import { ApiRequestError, fetchBenchmark, fetchHealth, fetchPolicy, fetchRunSummary } from "./client";

export function useHealthQuery() {
  return useQuery({
    queryKey: ["api", "health"],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function usePolicyQuery() {
  return useQuery({
    queryKey: ["api", "policy"],
    queryFn: fetchPolicy,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useBenchmarkQuery() {
  return useQuery({
    queryKey: ["api", "analytics", "benchmark"],
    queryFn: fetchBenchmark,
    staleTime: 60_000,
    retry: (_failureCount, error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        return false;
      }
      return _failureCount < 1;
    },
  });
}

export function useRunSummaryQuery(runId: string | null) {
  return useQuery({
    queryKey: ["api", "runs", runId],
    queryFn: () => {
      if (!runId) {
        throw new ApiRequestError("No run identifier specified.", { code: "NO_RUN_ID" });
      }
      return fetchRunSummary(runId);
    },
    enabled: Boolean(runId),
    staleTime: 10_000,
    retry: (_failureCount, error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        return false;
      }
      return _failureCount < 1;
    },
  });
}
