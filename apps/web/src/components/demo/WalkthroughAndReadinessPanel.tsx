import { ArrowRight, Award, CheckCircle2, Circle, Compass, RotateCcw } from "lucide-react";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/state-views";
import {
  EVALUATOR_WALKTHROUGH_STEPS,
  SUBMISSION_READINESS_ITEMS,
  type EvidenceNature,
} from "@/lib/evaluatorWalkthroughCatalog";
import { useUiStore } from "@/stores/uiStore";

function evidenceBadge(kind: EvidenceNature) {
  switch (kind) {
    case "LIVE_DEMO":
      return <ProvenanceBadge kind="LIVE" label="LIVE · DEMO EXECUTION" />;
    case "LIVE_LAB":
      return <ProvenanceBadge kind="LIVE" label="LIVE · CRYPTO LAB" />;
    case "FROZEN_BENCHMARK":
      return <ProvenanceBadge kind="FROZEN" label="FROZEN · AUDIT EVIDENCE" />;
    case "UNAVAILABLE_BOUNDARY":
      return <ProvenanceBadge kind="UNAVAILABLE" label="LIVE + UNAVAILABLE ORACLE" />;
  }
}

export function WalkthroughAndReadinessPanel() {
  const {
    demoBarOpen,
    completedDemoSteps,
    setDemoBarOpen,
    setActiveDemoStep,
    toggleDemoStepCompleted,
    setActivePage,
    resetDemoChecklist,
  } = useUiStore();

  const completedCount = completedDemoSteps.length;

  return (
    <div className="space-y-8">
      {/* Guided 10-Step Evaluator Walkthrough */}
      <section className="space-y-4" data-testid="evaluator-walkthrough-section">
        <SectionHeader
          title="10-Step Evaluator Walkthrough Checklist"
          subtitle="Structured verification path spanning live sanitization, cross-script linking, determinism/unlinkability, cohort risk, policy tracing, and readiness."
          provenance="DERIVED"
          provenanceLabel={`${completedCount} / 10 VERIFIED`}
          rightSlot={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={demoBarOpen ? "primary" : "secondary"}
                onClick={() => setDemoBarOpen(!demoBarOpen)}
              >
                <Compass className="h-3.5 w-3.5" />
                {demoBarOpen ? "Hide Walkthrough Bar" : "Pin Walkthrough Bar"}
              </Button>
              {completedCount > 0 ? (
                <Button type="button" size="sm" variant="ghost" onClick={resetDemoChecklist}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              ) : null}
            </div>
          }
        />

        <div className="space-y-3">
          {EVALUATOR_WALKTHROUGH_STEPS.map((step) => {
            const done = completedDemoSteps.includes(step.id);
            return (
              <Panel
                key={step.id}
                className={done ? "min-w-0 border-emerald-500/35" : "min-w-0"}
              >
                <PanelContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="cyan">STEP {step.stepNumber}</Badge>
                      <h3 className="text-xs font-semibold text-slate-100">{step.title}</h3>
                      {evidenceBadge(step.evidenceNature)}
                    </div>

                    <div className="grid gap-2 text-[11px] leading-relaxed md:grid-cols-2">
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          Action:{" "}
                        </span>
                        <span className="text-slate-200">{step.evaluatorAction}</span>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                          Observe:{" "}
                        </span>
                        <span className="text-slate-300">{step.whatToObserve}</span>
                      </div>
                    </div>

                    <p className="font-mono text-[10px] text-cyan-300/85">
                      Provenance: {step.provenanceDisclosure}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-end">
                    <Button
                      type="button"
                      size="sm"
                      variant={done ? "secondary" : "ghost"}
                      aria-pressed={done}
                      onClick={() => toggleDemoStepCompleted(step.id)}
                    >
                      {done ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          Verified
                        </>
                      ) : (
                        <>
                          <Circle className="h-3.5 w-3.5 text-slate-500" />
                          Mark Step Done
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setActiveDemoStep(step.stepNumber);
                        setActivePage(step.targetPage);
                      }}
                    >
                      Go to {step.targetPageLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </PanelContent>
              </Panel>
            );
          })}
        </div>
      </section>

      {/* Submission Readiness Summary */}
      <section className="space-y-4" data-testid="submission-readiness-section">
        <SectionHeader
          title="Challenge Submission Readiness Summary"
          subtitle="Concise compliance inventory distinguishing verified official toolkit results from supplementary local benchmarks and unpublished competition scores."
          provenance="FROZEN"
          provenanceLabel="READY TO SUBMIT · CONTRACT OK"
        />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SUBMISSION_READINESS_ITEMS.map((item) => (
            <Panel key={item.category} className="min-w-0">
              <PanelHeader>
                <div className="flex min-w-0 items-center gap-2">
                  <Award className="h-4 w-4 shrink-0 text-cyan-400" />
                  <PanelTitle className="text-xs">{item.category}</PanelTitle>
                </div>
                <ProvenanceBadge kind={item.provenance} label={item.provenance} />
              </PanelHeader>
              <PanelContent className="space-y-2 text-[11px] leading-relaxed text-slate-300">
                <p>{item.summary}</p>
                <code className="block break-words font-mono text-[10px] text-emerald-300/90">
                  {item.sourceRef}
                </code>
              </PanelContent>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
