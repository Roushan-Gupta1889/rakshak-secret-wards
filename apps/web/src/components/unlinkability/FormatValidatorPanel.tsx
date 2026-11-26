import { useState } from "react";
import { CheckCircle2, FileCheck2, ShieldBan, XCircle } from "lucide-react";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state-views";
import {
  CROCKFORD_BASE32_ALPHABET,
  EXCLUDED_CROCKFORD_LETTERS,
  validatePseudonymFormat,
  type FormatValidationReport,
} from "@/lib/unlinkabilityAnalyzer";

const PRESET_VECTORS = [
  { label: "PSN-7JNJ5S (Valid Alpha)", value: "PSN-7JNJ5S" },
  { label: "PSN-975397 (Phase 1D All-Digit Collision)", value: "PSN-975397" },
  { label: "PSN-123I4L (Forbidden I/L Chars)", value: "PSN-123I4L" },
  { label: "975397 (Missing PSN- Prefix)", value: "975397" },
] as const;

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
      )}
      <span className={ok ? "text-slate-200" : "text-red-200"}>{label}</span>
    </div>
  );
}

export function FormatValidatorPanel({
  liveFormat,
}: {
  liveFormat: FormatValidationReport | null;
}) {
  const [candidate, setCandidate] = useState("PSN-975397");
  const inspection = validatePseudonymFormat(candidate);

  return (
    <Panel className="min-w-0" data-testid="scenario-format-validator">
      <PanelHeader>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-cyan-400" />
            <PanelTitle>C. Pseudonym Format Validator &amp; All-Digit Rejection</PanelTitle>
          </div>
          <PanelDescription>
            Enforces <code className="font-mono">PSN-XXXXXX</code> over Crockford Base-32 (<code className="font-mono">{CROCKFORD_BASE32_ALPHABET}</code>) with at least one alphabetic character.
          </PanelDescription>
        </div>
        <ProvenanceBadge
          kind={liveFormat ? "LIVE" : "DERIVED"}
          label={liveFormat ? "LIVE ENGINE CHECK + CONTRACT" : "CONTRACT INSPECTOR"}
        />
      </PanelHeader>

      <PanelContent className="grid gap-6 lg:grid-cols-12">
        {/* Left: Live Engine Results */}
        <div className="min-w-0 space-y-3 lg:col-span-6">
          <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
            Live Engine Output Validation
          </p>
          {!liveFormat ? (
            <EmptyState
              title="Awaiting live engine run"
              description="Execute the verification suite to validate every pseudonym produced by the Phase 1E CLI."
            />
          ) : (
            <div className="space-y-3 rounded-lg border border-slate-800/80 bg-[#080E1C] p-3.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <div className="font-mono text-[10px] uppercase text-slate-500">Checked</div>
                  <div className="font-mono text-base font-semibold text-slate-100 tabular-nums">
                    {liveFormat.totalChecked}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase text-slate-500">Valid</div>
                  <div className="font-mono text-base font-semibold text-emerald-300 tabular-nums">
                    {liveFormat.validCount}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase text-slate-500">Invalid</div>
                  <div className="font-mono text-base font-semibold text-slate-200 tabular-nums">
                    {liveFormat.invalidCount}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase text-slate-500">All-Digit</div>
                  <div className="font-mono text-base font-semibold text-emerald-300 tabular-nums">
                    {liveFormat.allDigitRejectedCount}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-slate-800/80 pt-2.5">
                {liveFormat.sampleValid.slice(0, 8).map((psn) => (
                  <Badge key={psn} variant="cyan">
                    {psn}
                  </Badge>
                ))}
              </div>

              <p className="text-[11px] text-slate-400">
                Excluded ambiguous letters: <code className="font-mono text-slate-300">{EXCLUDED_CROCKFORD_LETTERS.join(", ")}</code>. Numeric-only 6-digit suffixes are rejected via deterministic rejection sampling in <code className="font-mono text-slate-300">crypto.py</code>.
              </p>
            </div>
          )}
        </div>

        {/* Right: Interactive Contract Checker */}
        <div className="min-w-0 space-y-3 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Interactive Format Contract Inspector
            </p>
            <Badge variant="default">RULE VERIFIER</Badge>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-800/80 bg-[#080E1C] p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="Inspect pseudonym format"
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                placeholder="Enter PSN-XXXXXX..."
                className="h-8 min-w-0 flex-1 rounded-md border border-slate-700/80 bg-[#0D1424] px-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
              <Badge variant={inspection.valid ? "live" : "danger"} data-testid="format-check-badge">
                {inspection.valid ? "VALID PHASE 1E PSN" : "REJECTED"}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_VECTORS.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  size="sm"
                  variant={candidate === preset.value ? "primary" : "secondary"}
                  onClick={() => setCandidate(preset.value)}
                >
                  {preset.value}
                </Button>
              ))}
            </div>

            <div className="grid gap-1.5 border-t border-slate-800/80 pt-2.5 sm:grid-cols-2">
              <CheckRow ok={inspection.prefixOk} label="Prefix matches PSN-" />
              <CheckRow ok={inspection.lengthOk} label="Exact 6-character suffix (len=10)" />
              <CheckRow ok={inspection.charsetOk} label="Crockford Base-32 alphabet only" />
              <CheckRow ok={inspection.hasAlphaChar} label=">= 1 alphabetic char (no PSN-\\d{6})" />
            </div>

            {!inspection.valid ? (
              <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/5 px-2.5 py-1.5 font-mono text-[11px] text-red-200">
                <ShieldBan className="h-3.5 w-3.5 shrink-0 text-red-400" />
                <span>Rejected: {inspection.reasons.join(", ")}</span>
              </div>
            ) : null}
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}
