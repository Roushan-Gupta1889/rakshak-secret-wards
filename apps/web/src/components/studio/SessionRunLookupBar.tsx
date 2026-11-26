import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { RunIdSchema } from "@/api/schemas";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent } from "@/components/ui/card";

const LookupSchema = z.object({
  runId: RunIdSchema,
});

type LookupForm = z.infer<typeof LookupSchema>;

export function SessionRunLookupBar({
  activeRunId,
  isBusy,
  onLookupRun,
  onRefreshActive,
}: {
  activeRunId: string | null;
  isBusy: boolean;
  onLookupRun: (runId: string) => Promise<void>;
  onRefreshActive: () => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LookupForm>({
    resolver: zodResolver(LookupSchema),
    defaultValues: { runId: "" },
  });

  const onSubmit = handleSubmit(async ({ runId }) => {
    await onLookupRun(runId.toLowerCase());
  });

  return (
    <Panel className="min-w-0">
      <PanelContent className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-200">Session Run Context</span>
            {activeRunId ? (
              <>
                <ProvenanceBadge kind="LIVE" label={`ACTIVE · ${activeRunId}`} />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => void onRefreshActive()}
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh Run
                </Button>
              </>
            ) : (
              <Badge variant="empty">NO ACTIVE SESSION RUN</Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Phase 2A exposes per-run retrieval at <code className="font-mono text-slate-300">GET /api/runs/&#123;run_id&#125;</code> without a global run-list endpoint; only the current session identifier is preserved.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
          <div>
            <input
              type="text"
              placeholder="Retrieve 16-hex run ID..."
              aria-label="Retrieve run ID"
              disabled={isBusy}
              {...register("runId")}
              className="h-8 w-56 rounded-md border border-slate-700/80 bg-[#080E1C] px-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            {errors.runId ? (
              <p className="mt-1 text-[11px] text-amber-300">{errors.runId.message}</p>
            ) : null}
          </div>
          <Button type="submit" size="md" variant="secondary" disabled={isBusy}>
            <Search className="h-3.5 w-3.5" />
            Load Run
          </Button>
        </form>
      </PanelContent>
    </Panel>
  );
}

