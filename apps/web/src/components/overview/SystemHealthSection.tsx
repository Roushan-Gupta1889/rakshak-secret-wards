import { CheckCircle2, Cpu, KeyRound, Lock, RefreshCw, Server, ShieldAlert } from "lucide-react";
import { useHealthQuery, usePolicyQuery } from "@/api/queries";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, OfflineApiBanner, SectionHeader } from "@/components/ui/state-views";
import { shortSha } from "@/lib/utils";

export function SystemHealthSection() {
  const healthQuery = useHealthQuery();
  const policyQuery = usePolicyQuery();

  const health = healthQuery.data?.data;
  const policy = policyQuery.data?.data;

  const isOffline = healthQuery.isError;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="System Health & Runtime Isolation"
        subtitle="Real-time telemetry from local FastAPI subprocess adapter and frozen Stage 1 policy manifest."
        provenance={health ? "LIVE" : undefined}
        rightSlot={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void healthQuery.refetch();
              void policyQuery.refetch();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      {isOffline ? (
        <OfflineApiBanner onRetry={() => void healthQuery.refetch()} />
      ) : null}

      {policyQuery.isError && !isOffline ? (
        <ErrorState
          title="Unable to read /api/policy"
          message={policyQuery.error instanceof Error ? policyQuery.error.message : "Policy query failed."}
          onRetry={() => void policyQuery.refetch()}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <PanelHeader className="py-2.5">
            <div>
              <PanelTitle className="text-xs uppercase tracking-wider text-slate-400">
                API Availability
              </PanelTitle>
              <PanelDescription className="font-mono text-[11px]">GET /api/health</PanelDescription>
            </div>
            <Server className="h-4 w-4 text-cyan-400" />
          </PanelHeader>
          <PanelContent className="py-3">
            {healthQuery.isLoading ? (
              <Skeleton className="h-6 w-28" />
            ) : health && healthQuery.data ? (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-sm font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  ONLINE ({healthQuery.data.latencyMs} ms)
                </span>
                <ProvenanceBadge kind="LIVE" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-sm font-semibold text-red-300">
                  <ShieldAlert className="h-4 w-4" />
                  UNREACHABLE
                </span>
                <ProvenanceBadge kind="EMPTY" label="OFFLINE" />
              </div>
            )}
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader className="py-2.5">
            <div>
              <PanelTitle className="text-xs uppercase tracking-wider text-slate-400">
                Engine Version & Tag
              </PanelTitle>
              <PanelDescription className="font-mono text-[11px]">Frozen Stage 1 Subprocess</PanelDescription>
            </div>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </PanelHeader>
          <PanelContent className="py-3">
            {healthQuery.isLoading ? (
              <Skeleton className="h-6 w-32" />
            ) : health ? (
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-slate-100">
                  {health.engine_tag} · v{health.engine_version}
                </span>
                <ProvenanceBadge kind="LIVE" />
              </div>
            ) : (
              <span className="font-mono text-sm text-slate-500">—</span>
            )}
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader className="py-2.5">
            <div>
              <PanelTitle className="text-xs uppercase tracking-wider text-slate-400">
                Offline & Stdlib Boundary
              </PanelTitle>
              <PanelDescription className="font-mono text-[11px]">Execution Guarantees</PanelDescription>
            </div>
            <Lock className="h-4 w-4 text-emerald-400" />
          </PanelHeader>
          <PanelContent className="py-3">
            {healthQuery.isLoading ? (
              <Skeleton className="h-6 w-36" />
            ) : health ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={health.offline_mode ? "live" : "danger"}>
                  Offline: {health.offline_mode ? "YES" : "NO"}
                </Badge>
                <Badge variant={health.stdlib_stage1 ? "live" : "danger"}>
                  Stage 1 Stdlib: {health.stdlib_stage1 ? "YES" : "NO"}
                </Badge>
              </div>
            ) : (
              <span className="font-mono text-sm text-slate-500">—</span>
            )}
          </PanelContent>
        </Panel>

        <Panel>
          <PanelHeader className="py-2.5">
            <div>
              <PanelTitle className="text-xs uppercase tracking-wider text-slate-400">
                Secret & Concurrency
              </PanelTitle>
              <PanelDescription className="font-mono text-[11px]">Per-Run Isolation State</PanelDescription>
            </div>
            <KeyRound className="h-4 w-4 text-cyan-400" />
          </PanelHeader>
          <PanelContent className="py-3">
            {healthQuery.isLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : health ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <Badge variant={health.secret_configured ? "cyan" : "default"}>
                  {health.secret_configured ? "Server Secret Set" : "CSPRNG Ephemeral Auto"}
                </Badge>
                <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                  Active {health.active_runs}/{health.max_concurrent_runs} · Retained {health.retained_runs}
                </span>
              </div>
            ) : (
              <span className="font-mono text-sm text-slate-500">—</span>
            )}
          </PanelContent>
        </Panel>
      </div>

      {/* Live Policy Summary Strip */}
      <Panel>
        <PanelContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-200">Active Policy Manifest</span>
            <span className="font-mono text-[11px] text-slate-400">GET /api/policy</span>
            {policy ? <ProvenanceBadge kind="LIVE" /> : <ProvenanceBadge kind="EMPTY" />}
          </div>
          {policyQuery.isLoading ? (
            <Skeleton className="h-5 w-72" />
          ) : policy ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="cyan">privacy_mode: {String(policy.policy.privacy_mode ?? "—")}</Badge>
              <Badge>k &ge; {String(policy.policy.min_group_size ?? "—")}</Badge>
              <Badge>age_band: {String(policy.policy.age_band_years ?? "—")}y</Badge>
              <Badge>date_shift: &plusmn;{String(policy.policy.date_shift_max_days ?? "—")}d</Badge>
              <Badge>pin: {String(policy.policy.pin_generalize ?? "—")}</Badge>
              <span className="font-mono text-[11px] text-slate-400">
                SHA-256: <code className="text-slate-200">{shortSha(policy.policy_sha256, 16)}</code>
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-500">Policy unavailable while API is offline.</span>
          )}
        </PanelContent>
      </Panel>
    </div>
  );
}
