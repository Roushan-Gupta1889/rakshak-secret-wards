import { useHealthQuery, usePolicyQuery } from "@/api/queries";
import { PipelineArchitectureSection } from "@/components/architecture/PipelineArchitectureSection";
import { PolicyExplorerSection } from "@/components/architecture/PolicyExplorerSection";
import { SecurityAndFormatsSection } from "@/components/architecture/SecurityAndFormatsSection";
import { OfflineApiBanner, SectionHeader } from "@/components/ui/state-views";

export function PoliciesArchitecturePage() {
  const healthQuery = useHealthQuery();
  const policyQuery = usePolicyQuery();

  const policy = policyQuery.data?.data ?? null;
  const health = healthQuery.data?.data ?? null;
  const apiUnreachable = healthQuery.isError || policyQuery.isError;

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Policy & Architecture Explorer"
        subtitle="Source-traced inventory of enforced config/policy.yaml settings, actual 4-pass Stage 1 execution flow, three-tier security boundaries, and verified format constraints."
        provenance={policy ? "LIVE" : "FROZEN"}
        provenanceLabel={
          policy
            ? `LIVE · /API/POLICY (${policy.policy_sha256.slice(0, 8)})`
            : "OFFLINE ARCHITECTURE VIEW"
        }
      />

      {apiUnreachable ? (
        <OfflineApiBanner
          onRetry={() => {
            void healthQuery.refetch();
            void policyQuery.refetch();
          }}
        />
      ) : null}

      <PolicyExplorerSection
        policy={policy}
        health={health}
        isLoading={policyQuery.isPending || healthQuery.isPending}
      />

      <PipelineArchitectureSection />

      <SecurityAndFormatsSection />
    </div>
  );
}
