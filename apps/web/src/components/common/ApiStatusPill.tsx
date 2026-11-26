import { Tooltip } from "@base-ui/react/tooltip";
import type { HealthResponse } from "@/api/schemas";
import { Badge } from "@/components/ui/badge";

export function ApiStatusPill({
  health,
  latencyMs,
  isLoading,
  isError,
}: {
  health?: HealthResponse;
  latencyMs?: number;
  isLoading: boolean;
  isError: boolean;
}) {
  let label = "API · CONNECTING";
  let variant: "live" | "danger" | "default" = "default";
  let dotColor = "bg-amber-400 animate-pulse";
  let hint = "Connecting to local FastAPI adapter...";

  if (!isLoading && health) {
    label = `API · LIVE (${latencyMs ?? 0}ms)`;
    variant = "live";
    dotColor = "bg-emerald-400";
    hint = `Loopback adapter connected · Offline=${String(health.offline_mode)} · Stdlib Stage 1=${String(health.stdlib_stage1)}`;
  } else if (!isLoading && isError) {
    label = "API · OFFLINE";
    variant = "danger";
    dotColor = "bg-red-400";
    hint = "Local API adapter unreachable at /api/health.";
  }

  return (
    <Tooltip.Provider delay={150}>
      <Tooltip.Root>
        <Tooltip.Trigger className="cursor-default focus:outline-none">
          <Badge variant={variant}>
            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
            {label}
          </Badge>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6}>
            <Tooltip.Popup className="z-50 max-w-xs rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-lg">
              {hint}
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
