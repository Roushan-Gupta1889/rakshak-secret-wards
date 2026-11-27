import { useMemo, useState } from "react";
import { KeyRound, Lock, Scale, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { HealthResponse, PolicyResponse } from "@/api/schemas";
import { KpiCard } from "@/components/common/KpiCard";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState, SectionHeader } from "@/components/ui/state-views";
import {
  buildPolicyInventory,
  type PolicyDomainCategory,
  type PolicyEnforcementMode,
} from "@/lib/policyArchitectureCatalog";

const CATEGORIES: Array<"All" | PolicyDomainCategory> = [
  "All",
  "Policy YAML",
  "Cohort & Privacy",
  "Crypto & Identity",
  "Formats & Quarantine",
  "API & Security",
];

function enforcementBadge(mode: PolicyEnforcementMode) {
  switch (mode) {
    case "ENFORCED_FROM_YAML":
      return <Badge variant="live">YAML-Enforced</Badge>;
    case "YAML_WITH_CODE_OVERRIDE":
      return <Badge variant="derived">YAML + Adaptive Override</Badge>;
    case "DECLARATIVE_FIXED_IN_CODE":
      return <Badge variant="frozen">Declarative · Code Fixed</Badge>;
    case "FIXED_ADAPTER_CONSTANT":
      return <Badge variant="default">Fixed Constant</Badge>;
    case "UNAVAILABLE_FROM_API":
      return <Badge variant="unavailable">Unavailable (Offline)</Badge>;
  }
}

export function PolicyExplorerSection({
  policy,
  health,
  isLoading,
}: {
  policy: PolicyResponse | null;
  health: HealthResponse | null;
  isLoading: boolean;
}) {
  const [selectedCategory, setSelectedCategory] = useState<"All" | PolicyDomainCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const inventory = useMemo(
    () => buildPolicyInventory(policy, health),
    [policy, health],
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventory.filter((row) => {
      if (selectedCategory !== "All" && row.domain !== selectedCategory) return false;
      if (!q) return true;
      return (
        row.key.toLowerCase().includes(q) ||
        row.actualValue.toLowerCase().includes(q) ||
        row.explanation.toLowerCase().includes(q) ||
        row.sourceLocation.toLowerCase().includes(q)
      );
    });
  }, [inventory, searchQuery, selectedCategory]);

  const privacyModeVal = policy ? String(policy.policy["privacy_mode"] ?? "—") : "Unavailable";
  const minGroupVal = policy ? `k >= ${String(policy.policy["min_group_size"] ?? "—")}` : "Unavailable";
  const dateShiftVal = policy ? `±${String(policy.policy["date_shift_max_days"] ?? "—")}d` : "Unavailable";
  const secretVal = health
    ? health.secret_configured
      ? "Configured"
      : "Unset (Ephemeral)"
    : "Unavailable";

  return (
    <section className="space-y-4" data-testid="policy-explorer-section">
      <SectionHeader
        title="1. Policy Overview & Enforced Configuration"
        subtitle="Live config/policy.yaml snapshot from GET /api/policy traced directly to Stage 1 & Phase 2A source code enforcement."
        provenance={policy ? "LIVE" : "UNAVAILABLE"}
        provenanceLabel={policy ? `LIVE · sha256:${policy.policy_sha256.slice(0, 12)}` : "UNAVAILABLE · /API/POLICY OFFLINE"}
        rightSlot={
          <Badge variant="default">
            <Lock className="h-3 w-3" />
            READ-ONLY · NO MUTATION ENDPOINT
          </Badge>
        }
      />

      {/* Policy Overview KPI Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Privacy Mode"
          value={privacyModeVal}
          sublabel="k_anonymity.py strategy"
          provenance={policy ? "LIVE" : "UNAVAILABLE"}
          provenanceLabel={policy ? "LIVE · /API/POLICY" : "UNAVAILABLE"}
          icon={<Scale className="h-4 w-4" />}
          loading={isLoading}
          tone={policy ? "cyan" : "neutral"}
        />
        <KpiCard
          label="k-Anonymity Target"
          value={minGroupVal}
          sublabel="Sparse cohort cutoff"
          provenance={policy ? "LIVE" : "UNAVAILABLE"}
          provenanceLabel={policy ? "LIVE · /API/POLICY" : "UNAVAILABLE"}
          icon={<SlidersHorizontal className="h-4 w-4" />}
          loading={isLoading}
          tone={policy ? "emerald" : "neutral"}
        />
        <KpiCard
          label="HMAC Date Shift Cap"
          value={dateShiftVal}
          sublabel="CSV/JSON policy · 180d TXT/FHIR"
          provenance={policy ? "LIVE" : "UNAVAILABLE"}
          provenanceLabel={policy ? "LIVE · /API/POLICY" : "UNAVAILABLE"}
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={isLoading}
        />
        <KpiCard
          label="RAKSHA_SECRET State"
          value={secretVal}
          sublabel="Server process env status"
          provenance={health ? "LIVE" : "UNAVAILABLE"}
          provenanceLabel={health ? "LIVE · /API/HEALTH" : "UNAVAILABLE"}
          icon={<KeyRound className="h-4 w-4" />}
          loading={isLoading}
          tone={health?.secret_configured ? "emerald" : health ? "amber" : "neutral"}
        />
        <KpiCard
          label="Runtime Policy Mutation"
          value="Locked"
          sublabel="No POST/PATCH /api/policy"
          provenance="UNAVAILABLE"
          provenanceLabel="UNAVAILABLE · READ-ONLY"
          icon={<Lock className="h-4 w-4" />}
        />
      </div>

      {/* Policy Detail Inventory Panel */}
      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0">
            <PanelTitle>Enforced Policy &amp; Adapter Control Inventory</PanelTitle>
            <PanelDescription>
              Explicit distinction between settings read dynamically from <code className="font-mono">config/policy.yaml</code>, declarative YAML keys implemented identically in code, and Phase 2A constants.
            </PanelDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ProvenanceBadge kind={policy ? "LIVE" : "UNAVAILABLE"} label="YAML KEYS" />
            <ProvenanceBadge kind="FROZEN" label="ENGINE & ADAPTER RULES" />
          </div>
        </PanelHeader>

        <PanelContent className="space-y-4">
          {/* Category Filter + Search Bar */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter policies by domain">
              {CATEGORIES.map((cat) => (
                <Button
                  key={cat}
                  type="button"
                  size="sm"
                  variant={selectedCategory === cat ? "primary" : "secondary"}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>

            <div className="relative min-w-[220px] md:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by key or file path..."
                aria-label="Filter policy inventory"
                className="h-8 w-full rounded-md border border-slate-700/80 bg-[#080E1C] pl-8 pr-3 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState
              title="No matching policy entries"
              description="Clear or broaden the domain filter or search term to view the configured rules."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border border-slate-800/80">
              <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                <thead className="bg-[#090F1E] text-[10px] uppercase tracking-wider text-slate-400">
                  <tr className="border-b border-slate-800/80">
                    <th className="px-3 py-2.5 font-medium">Policy / Control Key</th>
                    <th className="px-3 py-2.5 font-medium">Actual Value &amp; Status</th>
                    <th className="px-3 py-2.5 font-medium">Real Behavior &amp; Configurability</th>
                    <th className="px-3 py-2.5 font-medium">Source Enforcement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 bg-[#0D1424]/70">
                  {filteredRows.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-800/25">
                      <td className="px-3 py-2.5 align-top">
                        <div className="font-mono text-xs font-medium text-cyan-300">{row.key}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="default">{row.domain}</Badge>
                          <ProvenanceBadge kind={row.provenance} label={row.provenance} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="font-mono text-xs font-semibold text-slate-100">
                          {row.actualValue}
                        </div>
                        <div className="mt-1">{enforcementBadge(row.enforcementMode)}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top text-[11px] leading-relaxed text-slate-300">
                        <p>{row.explanation}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">
                          {row.configurability}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <code className="block break-words font-mono text-[11px] text-emerald-300/90">
                          {row.sourceLocation}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PanelContent>
      </Panel>
    </section>
  );
}
