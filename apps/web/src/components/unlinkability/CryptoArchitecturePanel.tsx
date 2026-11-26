import { GitCompare, History, KeyRound, Lock } from "lucide-react";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state-views";

export function CryptoArchitecturePanel() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* E. Stability & Versioning */}
        <Panel className="min-w-0">
          <PanelHeader>
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-cyan-400" />
              <PanelTitle>E. Stability, Versioning &amp; Phase 1D → 1E Diff</PanelTitle>
            </div>
            <ProvenanceBadge kind="FROZEN" label="FROZEN · ENGINE SPEC" />
          </PanelHeader>
          <PanelContent className="space-y-3 text-xs text-slate-300">
            <div className="rounded-md border border-slate-800/80 bg-[#080E1C] p-3">
              <p className="font-medium text-slate-100">Three Stability Dependencies</p>
              <ul className="mt-2 space-y-1.5 text-[11px] text-slate-300">
                <li>
                  • <strong className="text-cyan-300">Algorithm Version:</strong> <code className="font-mono">rakshak.crypto.pseudonym</code> domain separation &amp; rejection sampling.
                </li>
                <li>
                  • <strong className="text-cyan-300">Server Secret (<code className="font-mono">RAKSHA_SECRET</code>):</strong> HMAC-SHA256 key loaded strictly inside child CLI env; changing secrets intentionally rotates all pseudonyms cleanly and does not preserve identity linkage.
                </li>
                <li>
                  • <strong className="text-cyan-300">Canonical <code className="font-mono">patient_key</code>:</strong> Built deterministically in <code className="font-mono">linker.py</code> as <code className="font-mono">PH:&lt;phone&gt;|MRN:&lt;mrn&gt;|N:&lt;sorted_latin_tokens&gt;</code>.
                </li>
              </ul>
            </div>

            <div className="rounded-md border border-slate-800/80 bg-[#080E1C] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-100">Phase 1D vs Phase 1E Behavior</span>
                <Badge variant="frozen">UPGRADE COMPATIBILITY</Badge>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                Phase 1D drew a single 30-bit slice, emitting all-digit suffixes (<code className="font-mono">PSN-\d&#123;6&#125;</code>, probability <code className="font-mono">(10/32)^6 ≈ 0.000931</code>, e.g. <code className="font-mono">PSN-975397</code>). Phase 1E adds deterministic domain-separated rejection sampling (<code className="font-mono">\x00rej|counter|key</code>): ~99.907% of keys retain identical Phase 1D IDs, while the ~0.093% all-digit cases remap cleanly without modulo bias. Downstream consumers must not assume cross-version identity persistence.
              </p>
            </div>
          </PanelContent>
        </Panel>

        {/* Secret Isolation Guarantees + History Disclosure */}
        <div className="space-y-4">
          <Panel className="min-w-0">
            <PanelHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <PanelTitle>Secret Isolation Architecture</PanelTitle>
              </div>
              <ProvenanceBadge kind="FROZEN" label="PHASE 2A ENFORCED" />
            </PanelHeader>
            <PanelContent className="space-y-2 text-[11px] leading-relaxed text-slate-300">
              <div className="flex items-start gap-2 rounded border border-slate-800/80 bg-[#080E1C] p-2.5">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>
                  <code className="font-mono text-slate-100">RAKSHA_SECRET</code> never leaves the local server. Browser requests select only <code className="font-mono">auto</code>, <code className="font-mono">configured</code>, or <code className="font-mono">ephemeral</code> modes; custom secret strings are rejected (<code className="font-mono">400 INVALID_SECRET_MODE</code>) and <code className="font-mono">scrub_sensitive_text</code> strips leaked secret bytes across all adapter outputs.
                </span>
              </div>
              <p className="text-slate-400">
                Verification fixtures contain strictly synthetic identifiers (<code className="font-mono">SYNTST-26-*</code>), never stored in <code className="font-mono">localStorage</code> or <code className="font-mono">sessionStorage</code>, and their temporary run directories are immediately removed after evaluation.
              </p>
            </PanelContent>
          </Panel>

          <Panel className="min-w-0">
            <PanelHeader>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-400" />
                <PanelTitle>Verification History</PanelTitle>
              </div>
              <ProvenanceBadge kind="EMPTY" label="NO PERSISTENT HISTORY" />
            </PanelHeader>
            <PanelContent>
              <EmptyState
                title="No backend verification history endpoint exists in Phase 2A"
                description="Frozen Phase 2A does not retain cryptographic verification logs across runs or sessions. Only live in-memory verification outputs executed in this session are displayed."
              />
            </PanelContent>
          </Panel>
        </div>
      </div>
    </div>
  );
}
