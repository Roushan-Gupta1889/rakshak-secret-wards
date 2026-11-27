import { ArrowRight, CheckCircle2, Compass, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EVALUATOR_WALKTHROUGH_STEPS } from "@/lib/evaluatorWalkthroughCatalog";
import { useUiStore } from "@/stores/uiStore";

export function EvaluatorGuideBar() {
  const {
    demoBarOpen,
    activeDemoStep,
    completedDemoSteps,
    setDemoBarOpen,
    setActiveDemoStep,
    toggleDemoStepCompleted,
    setActivePage,
  } = useUiStore();

  if (!demoBarOpen) return null;

  const stepIdx = EVALUATOR_WALKTHROUGH_STEPS.findIndex((s) => s.stepNumber === activeDemoStep);
  const current = EVALUATOR_WALKTHROUGH_STEPS[stepIdx >= 0 ? stepIdx : 0];
  const next = EVALUATOR_WALKTHROUGH_STEPS[(stepIdx + 1) % EVALUATOR_WALKTHROUGH_STEPS.length];
  const isDone = completedDemoSteps.includes(current.id);

  return (
    <div
      data-testid="evaluator-guide-bar"
      className="border-b border-cyan-500/25 bg-[#0A1326] px-4 py-2 text-xs sm:px-6"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="cyan">
            <Compass className="h-3 w-3" />
            DEMO STEP {current.stepNumber}/10
          </Badge>
          <span className="truncate font-medium text-slate-100">{current.title}</span>
          <span className="hidden text-slate-400 lg:inline">— {current.evaluatorAction}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={isDone ? "secondary" : "ghost"}
            onClick={() => toggleDemoStepCompleted(current.id)}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            {isDone ? "Verified" : "Mark Verified"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setActivePage(current.targetPage)}
          >
            Open {current.targetPageLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => {
              setActiveDemoStep(next.stepNumber);
              setActivePage(next.targetPage);
            }}
          >
            Next ({next.stepNumber})
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Hide evaluator guide bar"
            onClick={() => setDemoBarOpen(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
