import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 font-mono text-[11px] font-medium tracking-tight transition-colors",
  {
    variants: {
      variant: {
        default: "border-slate-700/80 bg-slate-800/70 text-slate-300",
        cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
        live: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
        derived: "border-cyan-500/35 bg-cyan-500/10 text-cyan-300",
        frozen: "border-amber-500/35 bg-amber-500/10 text-amber-300",
        unavailable: "border-slate-600/80 bg-slate-900/90 text-slate-300",
        empty: "border-slate-700 bg-slate-900 text-slate-400",
        danger: "border-red-500/35 bg-red-500/10 text-red-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export type ProvenanceKind = "LIVE" | "DERIVED" | "FROZEN" | "UNAVAILABLE" | "EMPTY";

export function ProvenanceBadge({
  kind,
  label,
}: {
  kind: ProvenanceKind;
  label?: string;
}) {
  const map = {
    LIVE: { variant: "live" as const, text: label ?? "LIVE", dot: "bg-emerald-400" },
    DERIVED: { variant: "derived" as const, text: label ?? "DERIVED", dot: "bg-cyan-400" },
    FROZEN: { variant: "frozen" as const, text: label ?? "FROZEN · HISTORICAL", dot: "bg-amber-400" },
    UNAVAILABLE: {
      variant: "unavailable" as const,
      text: label ?? "UNAVAILABLE",
      dot: "bg-slate-400",
    },
    EMPTY: { variant: "empty" as const, text: label ?? "EMPTY STATE", dot: "bg-slate-500" },
  }[kind];

  return (
    <Badge variant={map.variant}>
      <span className={cn("h-1.5 w-1.5 rounded-full", map.dot)} />
      {map.text}
    </Badge>
  );
}
