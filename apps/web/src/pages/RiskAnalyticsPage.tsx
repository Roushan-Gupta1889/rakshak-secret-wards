import { useMemo, useState } from "react";
import { Activity, ArrowRight, RefreshCw, Search } from "lucide-react";
import { fetchRunSummary, ApiRequestError } from "@/api/client";
import { useHealthQuery, usePolicyQuery } from "@/api/queries";
import { RunIdSchema } from "@/api/schemas";
import { AttackAnalysisSection } from "@/components/analytics/AttackAnalysisSection";
import { ReidentificationCohortSection } from "@/components/analytics/ReidentificationCohortSection";
import { RiskOverviewSection } from "@/components/analytics/RiskOverviewSection";
import { UtilityPrivacyAndFindingsSection } from "@/components/analytics/UtilityPrivacyAndFindingsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { ErrorState, OfflineApiBanner, SectionHeader } from "@/components/ui/state-views";
import { useSanitizedRegistryQuery } from "@/hooks/useSanitizedRegistry";
import {
  analyzeReleaseCohorts,
  buildLiveRiskOverview,
  buildRiskFindings,
} from "@/lib/riskAnalyticsAnalyzer";
import { useRunStore } from "@/stores/runStore";
import { useUiStore } from "@/stores/uiStore";

export function RiskAnalyticsPage() {
  const healthQuery = useHealthQuery();
  const policyQuery = usePolicyQuery();
  const activeRun = useRunStore((s) => s.activeRun);
  const activeRunId = useRunStore((s) => s.activeRunId);
  const setActiveRun = useRunStore((s) => s.setActiveRun);
  const clearActiveRunView = useRunStore((s) => s.clearActiveRunView);
  const setActivePage = useUiStore((s) => s.setActivePage);

  const registryQuery = useSanitizedRegistryQuery(activeRunId);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupPending, setLookupPending] = useState(false);

  const policy = policyQuery.data?.data ?? null;
  const health = healthQuery.data?.data ?? null;
  const registry = registryQuery.data ?? null;

  const overview = useMemo(
    () => buildLiveRiskOverview(activeRun, registry),
    [activeRun, registry],
  );
  const cohort = useMemo(
    () => analyzeReleaseCohorts(activeRun, registry, policy),
    [activeRun, registry, policy],
  );
  const findings = useMemo(
    () => buildRiskFindings({ summary: activeRun, cohort, overview }),
    [activeRun, cohort, overview],
  );

  async function handleLookupRun(e: React.FormEvent) {
    e.preventDefault();
    setLookupError(null);
    const parsed = RunIdSchema.safeParse(lookupInput);
    if (!parsed.success) {
      setLookupError(parsed.error.issues[0]?.message ?? "Enter a valid 16-hex run ID.");
      return;
    }
    setLookupPending(true);
    try {
      const summary = await fetchRunSummary(parsed.data.toLowerCase());
      setActiveRun(summary);
      setLookupInput("");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setLookupError(`${err.code}: ${err.message}`);
      } else {
        setLookupError("Unable to load run summary from local API.");
      }
    } finally {
      setLookupPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Risk Analytics Dashboard"
        subtitle="Evidence-based re-identification cohort telemetry, ATTACKS.md adversary analysis, privacy-vs-utility frontier, and transparent unmeasurable boundaries."
        provenance={activeRun ? "LIVE" : "FROZEN"}
        provenanceLabel={
          activeRun
            ? `LIVE RUN ${activeRun.run_id.slice(0, 8)} + FROZEN BENCHMARK`
            : "FROZEN BENCHMARKS · AWAITING ACTIVE RUN"
        }
        rightSlot={
          <Button size="sm" variant="secondary" onClick={() => setActivePage("studio")}>
            Open Sanitization Studio
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      {healthQuery.isError ? (
        <OfflineApiBanner onRetry={() => void healthQuery.refetch()} />
      ) : null}

      {registryQuery.isError ? (
        <ErrorState
          title="Unable to load sanitized run outputs for cohort analysis"
          message={registryQuery.error.message}
          onRetry={() => void registryQuery.refetch()}
        />
      ) : null}

      {/* Run Scope Selector & Provenance Guard Bar */}
      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <PanelTitle>Active Run Scope &amp; Retained API Lookup</PanelTitle>
              {activeRun ? (
                <Badge variant="live">RUN {activeRun.run_id}</Badge>
              ) : (
                <Badge variant="empty">NO RUN LOADED</Badge>
              )}
              {health ? (
                <Badge variant="default">{health.retained_runs} retained slot(s)</Badge>
              ) : null}
            </div>
            <PanelDescription>
              Reuses active session output telemetry (never requests or stores raw PII or secrets) alongside immutable Phase 1D/1E benchmarks.
            </PanelDescription>
          </div>

          {activeRun ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void registryQuery.refetch()}
                disabled={registryQuery.isFetching}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Run Artifacts
              </Button>
              <Button size="sm" variant="ghost" onClick={clearActiveRunView}>
                Detach Run
              </Button>
            </div>
          ) : null}
        </PanelHeader>

        <PanelContent>
          <form onSubmit={(e) => void handleLookupRun(e)} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="Inspect retained 16-hex run_id (optional)..."
              aria-label="Retained run identifier lookup"
              className="h-9 min-w-[220px] flex-1 rounded-md border border-slate-700/80 bg-[#080E1C] px-3 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <Button type="submit" size="sm" variant="secondary" disabled={lookupPending}>
              <Search className="h-3.5 w-3.5" />
              {lookupPending ? "Loading..." : "Load Run Telemetry"}
            </Button>
          </form>
          {lookupError ? (
            <p role="alert" className="mt-2 font-mono text-[11px] text-red-300">
              {lookupError}
            </p>
          ) : null}
        </PanelContent>
      </Panel>

      <RiskOverviewSection
        summary={activeRun}
        overview={overview}
        policy={policy}
        isLoadingRegistry={registryQuery.isLoading}
      />

      <ReidentificationCohortSection
        cohort={cohort}
        isLoading={registryQuery.isLoading && Boolean(activeRunId)}
        runId={activeRunId}
      />

      <AttackAnalysisSection />

      <UtilityPrivacyAndFindingsSection
        summary={activeRun}
        overview={overview}
        findings={findings}
      />
    </div>
  );
}
