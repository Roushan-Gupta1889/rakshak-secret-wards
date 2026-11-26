import { useQuery } from "@tanstack/react-query";
import { ApiRequestError, fetchBenchmark, fetchHealth, fetchPolicy } from "./client";

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
