import { ArrowRight, ShieldCheck } from "lucide-react";
import { useHealthQuery } from "@/api/queries";
import { SyntheticDatasetAndRunnerPanel } from "@/components/demo/SyntheticDatasetAndRunnerPanel";
import { WalkthroughAndReadinessPanel } from "@/components/demo/WalkthroughAndReadinessPanel";
import { Button } from "@/components/ui/button";
import { OfflineApiBanner, SectionHeader } from "@/components/ui/state-views";
import { useUiStore } from "@/stores/uiStore";

export function EvaluatorDemoPage() {
  const healthQuery = useHealthQuery();
  const health = healthQuery.data?.data ?? null;
  const { setActivePage } = useUiStore();

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Evaluator Demo & Submission Readiness"
        subtitle="End-to-end guided walkthrough running the frozen Phase 1E Stage 1 engine against a non-sensitive synthetic multilingual dataset."
        provenance="LIVE"
        provenanceLabel="GUIDED WALKTHROUGH · REAL ENGINE"
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setActivePage("overview")}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Overview
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setActivePage("policies")}>
              Policies &amp; Architecture
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />

      {healthQuery.isError ? (
        <OfflineApiBanner onRetry={() => void healthQuery.refetch()} />
      ) : null}

      <SyntheticDatasetAndRunnerPanel health={health} />

      <WalkthroughAndReadinessPanel />
    </div>
  );
}
