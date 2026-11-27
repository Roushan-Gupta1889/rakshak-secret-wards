import { ArrowDown, ArrowRight, Cpu, GitMerge, Info, KeyRound, Monitor, Server, Shield } from "lucide-react";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/state-views";
import {
  STAGE1_PIPELINE_PASSES,
  TRUST_BOUNDARY_TIERS,
} from "@/lib/policyArchitectureCatalog";

export function PipelineArchitectureSection() {
  return (
    <section className="space-y-6" data-testid="pipeline-architecture-section">
      <SectionHeader
        title="2. System Isolation & Stage 1 Pipeline Architecture"
        subtitle="Three-tier trust boundary and exact 4-pass execution order audited directly against rakshak/pipeline.py and apps/api/."
        provenance="FROZEN"
        provenanceLabel="VERIFIED IN SOURCE CODE"
      />

      {/* 3-Tier Trust Separation */}
      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0">
            <PanelTitle>Three-Tier Separation: Browser UI ⇄ Local Adapter ⇄ Offline Stage 1 CLI</PanelTitle>
            <PanelDescription>
              The React frontend performs <strong className="text-slate-200">zero cryptography</strong>. All HMAC-SHA256 hashing, rejection sampling, linking, and PII masking execute inside isolated child Python subprocesses.
            </PanelDescription>
          </div>
          <Badge variant="live">ZERO BROWSER CRYPTO</Badge>
        </PanelHeader>
        <PanelContent>
          <div className="grid gap-4 lg:grid-cols-3">
            {TRUST_BOUNDARY_TIERS.map((tier, idx) => {
              const Icon =
                tier.tierId === "browser"
                  ? Monitor
                  : tier.tierId === "adapter"
                    ? Server
                    : Cpu;
              return (
                <div
                  key={tier.tierId}
                  className="flex flex-col justify-between rounded-lg border border-slate-800/90 bg-[#080E1C] p-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-100">{tier.name}</div>
                          <div className="font-mono text-[10px] text-cyan-300/80">{tier.runtime}</div>
                        </div>
                      </div>
                      <Badge variant="default">Tier {idx + 1}</Badge>
                    </div>

                    <div className="rounded border border-slate-800/80 bg-[#0D1424] px-2.5 py-1.5 font-mono text-[10px] text-slate-300">
                      {tier.privilege}
                    </div>

                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-400">
                        Responsibilities
                      </p>
                      <ul className="mt-1.5 space-y-1.5 text-[11px] leading-relaxed text-slate-300">
                        {tier.owns.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-800/80 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-amber-300">
                      Explicitly Excluded / Never Accessed
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-400">
                      {tier.explicitlyExcluded.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </PanelContent>
      </Panel>

      {/* Exact 4-Pass Stage 1 Pipeline Execution Flow */}
      <Panel className="min-w-0">
        <PanelHeader>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-cyan-400" />
              <PanelTitle>Actual Stage 1 Execution Order (`Pipeline.run()`)</PanelTitle>
            </div>
            <PanelDescription>
              Traced directly from <code className="font-mono">rakshak/pipeline.py:271–415</code>. Unlike a naive linear sketch, Stage 1 performs global name assembly, cross-script patient linking, and corpus k-anonymity planning <em>before</em> final quarantine, pseudonymization, and export.
            </PanelDescription>
          </div>
          <ProvenanceBadge kind="FROZEN" label="PHASE-1E-V1 ORDER" />
        </PanelHeader>

        <PanelContent className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-cyan-500/25 bg-cyan-500/5 px-3.5 py-2.5 text-xs text-slate-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
            <div>
              <strong className="font-semibold text-slate-100">Why this order differs from a single-pass flow:</strong>{" "}
              Pass 1 collects names across every decodable file and filename so a patient named in CSV still masks an unlabeled appearance in TXT/JSON. Pass 2 and Pass 2b finish cross-file clustering and <code className="font-mono">min_group_size=5</code> planning before Pass 3 invokes <code className="font-mono">HMAC-SHA256</code> pseudonymization, rejection sampling, quarantine, and masking per file.
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-4">
            {STAGE1_PIPELINE_PASSES.map((pass, idx) => (
              <div key={pass.passId} className="flex flex-col gap-2">
                <div className="flex flex-1 flex-col justify-between rounded-lg border border-slate-800/90 bg-[#080E1C] p-3.5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="cyan">STAGE {pass.orderNumber} OF 4</Badge>
                      {idx < STAGE1_PIPELINE_PASSES.length - 1 ? (
                        <>
                          <ArrowRight className="hidden h-4 w-4 text-cyan-500/60 xl:block" />
                          <ArrowDown className="h-4 w-4 text-cyan-500/60 xl:hidden" />
                        </>
                      ) : (
                        <Shield className="h-4 w-4 text-emerald-400" />
                      )}
                    </div>
                    <h4 className="text-xs font-semibold text-slate-100">{pass.title}</h4>
                    <code className="block break-words font-mono text-[10px] text-cyan-300/90">
                      {pass.moduleRef}
                    </code>
                    <p className="text-[11px] leading-relaxed text-slate-300">{pass.summary}</p>
                    <ul className="space-y-1 text-[11px] text-slate-400">
                      {pass.details.map((d) => (
                        <li key={d} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-500" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3 rounded border border-slate-800/80 bg-[#0D1424] p-2.5">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
                      <KeyRound className="h-3 w-3" />
                      Cryptographic Boundary
                    </div>
                    <ul className="mt-1 space-y-1 font-mono text-[10px] leading-relaxed text-slate-300">
                      {pass.cryptoHooks.map((hook) => (
                        <li key={hook}>{hook}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PanelContent>
      </Panel>
    </section>
  );
}
