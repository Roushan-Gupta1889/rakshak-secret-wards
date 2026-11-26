import * as React from "react";
import { AlertTriangle, Inbox, RefreshCw, WifiOff } from "lucide-react";
import { ProvenanceBadge } from "./badge";
import { Button } from "./button";

export function SectionHeader({
  title,
  subtitle,
  provenance,
  provenanceLabel,
  rightSlot,
}: {
  title: string;
  subtitle: string;
  provenance?: "LIVE" | "DERIVED" | "FROZEN" | "EMPTY";
  provenanceLabel?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-base font-semibold tracking-tight text-slate-100">{title}</h2>
          {provenance ? <ProvenanceBadge kind={provenance} label={provenanceLabel} /> : null}
        </div>
        <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      </div>
      {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-[#0A101E] px-6 py-8 text-center">
      <div className="mb-2.5 rounded-full border border-slate-800 bg-slate-900/90 p-2.5 text-slate-400">
        {icon ?? <Inbox className="h-4 w-4" />}
      </div>
      <p className="text-xs font-medium text-slate-200">{title}</p>
      <p className="mt-1 max-w-md text-xs text-slate-400">{description}</p>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div>
          <p className="font-medium text-red-200">{title}</p>
          <p className="mt-0.5 text-red-300/85">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function OfflineApiBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs"
    >
      <div className="flex items-center gap-2.5 text-amber-200">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
        <span>
          Local API adapter unreachable at <code className="font-mono text-amber-300">/api/health</code>. Start{" "}
          <code className="font-mono text-amber-300">uvicorn rakshak_api.main:app --app-dir apps/api</code> to inspect live telemetry.
        </span>
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Reconnect
        </Button>
      ) : null}
    </div>
  );
}
