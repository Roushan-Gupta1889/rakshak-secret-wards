import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Cpu, GitBranch } from "lucide-react";
import { useHealthQuery, usePolicyQuery } from "@/api/queries";
import { DataTable } from "@/components/tables/DataTable";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ErrorState, SectionHeader } from "@/components/ui/state-views";

interface PolicyParameterRow {
  key: string;
  value: string;
  category: string;
}

function classifyPolicyKey(key: string): string {
  if (key.includes("cohort") || key.includes("group") || key.includes("age") || key.includes("dob")) {
    return "Cohort Generalization";
  }
  if (key.includes("pseudonym") || key.includes("hash") || key.includes("secret") || key.includes("hmac")) {
    return "Cryptographic Identity";
  }
  if (key.includes("fhir") || key.includes("output") || key.includes("export")) {
    return "Output Format";
  }
  return "Governance Policy";
}

export function PoliciesArchitecturePage() {
  const healthQuery = useHealthQuery();
  const policyQuery = usePolicyQuery();
  const policy = policyQuery.data?.data;
  const health = healthQuery.data?.data;

  const rows = useMemo<PolicyParameterRow[]>(() => {
    if (!policy) return [];
    return Object.entries(policy.policy)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        key,
        value: String(value),
        category: classifyPolicyKey(key.toLowerCase()),
      }));
  }, [policy]);

  const columns = useMemo<ColumnDef<PolicyParameterRow, unknown>[]>(
    () => [
      {
        accessorKey: "key",
        header: "Policy Parameter",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-cyan-300">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: "category",
        header: "Domain",
        cell: ({ getValue }) => <Badge variant="default">{String(getValue())}</Badge>,
      },
      {
        accessorKey: "value",
        header: "Configured Value",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-slate-100">{String(getValue())}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Policies & System Architecture"
        subtitle="Live raksha.toml configuration inspected from GET /api/policy alongside frozen Phase 1E–2A system boundaries."
        provenance={policy ? "LIVE" : policyQuery.isError ? "EMPTY" : "LIVE"}
        provenanceLabel={policy ? "LIVE · /API/POLICY" : "POLICY TELEMETRY"}
      />

      {policyQuery.isError ? (
        <ErrorState
          title="Unable to inspect live policy configuration"
          message={policyQuery.error.message}
          onRetry={() => {
            void policyQuery.refetch();
          }}
        />
      ) : null}

      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0">
            <PanelTitle>Active Engine Policy (`raksha.toml`)</PanelTitle>
            <PanelDescription>
              Read-only snapshot served by the Phase 2A FastAPI local adapter without exposing secrets or paths.
            </PanelDescription>
          </div>
          {policy ? (
            <div className="flex flex-wrap items-center gap-2">
              <ProvenanceBadge kind="LIVE" label="LIVE" />
              <Badge variant="cyan">sha256:{policy.policy_sha256.slice(0, 12)}</Badge>
            </div>
          ) : null}
        </PanelHeader>
        <PanelContent>
          <DataTable
            data={rows}
            columns={columns}
            loading={policyQuery.isPending}
            emptyTitle="No policy fields returned"
            emptyDescription="Start the local FastAPI adapter on 127.0.0.1:8000 to inspect raksha.toml parameters."
          />
        </PanelContent>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="min-w-0">
          <PanelHeader>
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-cyan-400" />
              <PanelTitle>Frozen Engine & Adapter Milestones</PanelTitle>
            </div>
            <Badge variant="frozen">IMMUTABLE</Badge>
          </PanelHeader>
          <PanelContent className="space-y-3 text-xs text-slate-300">
            <div className="rounded-md border border-slate-800/80 bg-[#080E1C] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-100">Phase 1E Privacy Engine</span>
                <Badge variant="frozen">phase-1e-v1</Badge>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                commit b5c258ade917a5f0c3cdf23bfd57a416c39acdaf
              </p>
              <p className="mt-1.5 text-slate-400">
                Standard-library-only Stage 1 CLI executed exclusively via subprocess isolation. Zero external Python dependencies.
              </p>
            </div>

            <div className="rounded-md border border-slate-800/80 bg-[#080E1C] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-100">Phase 2A FastAPI Local Adapter</span>
                <Badge variant="live">
                  {health ? `tag:${health.engine_tag}` : "368b981e"}
                </Badge>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                commit 368b981e1c2b1adddea871a258d1b752f8cd6f9d
              </p>
              <p className="mt-1.5 text-slate-400">
                Loopback-bound HTTP adapter injecting environment secrets into child CLI runs with CSRF/Host/Origin validation.
              </p>
            </div>
          </PanelContent>
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-cyan-400" />
              <PanelTitle>Phase 2A → 2F API Contract Boundary</PanelTitle>
            </div>
            <Badge variant="derived">VERIFIED CONTRACT</Badge>
          </PanelHeader>
          <PanelContent className="space-y-2.5 text-xs text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2">
              <code className="break-all font-mono text-emerald-300">GET /api/health</code>
              <Badge variant="live">200 LIVE</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2">
              <code className="break-all font-mono text-emerald-300">GET /api/policy</code>
              <Badge variant="live">200 LIVE</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2">
              <code className="break-all font-mono text-slate-300">POST /api/runs &amp; /api/runs/&#123;id&#125;*</code>
              <Badge variant="live">LIVE · STUDIO, REGISTRY, LAB &amp; RISK</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2">
              <code className="break-all font-mono text-amber-300">GET /api/analytics/benchmark</code>
              <Badge variant="frozen">404 (STATIC FALLBACK)</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2">
              <code className="break-all font-mono text-slate-400">GET /api/runs (global summary)</code>
              <Badge variant="empty">NOT IN PHASE 2A</Badge>
            </div>
          </PanelContent>
        </Panel>
      </div>
    </div>
  );
}
