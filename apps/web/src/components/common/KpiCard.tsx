import * as React from "react";
import { ProvenanceBadge, type ProvenanceKind } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sublabel,
  provenance,
  provenanceLabel,
  icon,
  loading = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sublabel: string;
  provenance: ProvenanceKind;
  provenanceLabel?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  tone?: "neutral" | "cyan" | "emerald" | "amber" | "danger";
}) {
  const accentRing = {
    neutral: "border-slate-800/90",
    cyan: "border-cyan-500/25",
    emerald: "border-emerald-500/25",
    amber: "border-amber-500/25",
    danger: "border-red-500/30",
  }[tone];

  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-lg border bg-[#0D1424]/95 px-3.5 py-3 transition-colors hover:border-slate-700",
        accentRing,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>

      <div className="my-2">
        {loading ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <span className="font-mono text-xl font-semibold tracking-tight text-slate-100 tabular-nums">
            {value}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-800/70 pt-2">
        <span className="text-[11px] text-slate-400">{sublabel}</span>
        <ProvenanceBadge kind={provenance} label={provenanceLabel} />
      </div>
    </div>
  );
}
