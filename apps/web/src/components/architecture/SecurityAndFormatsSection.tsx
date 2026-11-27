import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Compass, FileCode2, ShieldCheck } from "lucide-react";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/state-views";
import {
  FORMAT_SUPPORT_MATRIX,
  SECURITY_BOUNDARIES_MATRIX,
  type SecurityClassification,
} from "@/lib/policyArchitectureCatalog";

const SEC_FILTERS: Array<{ id: "ALL" | SecurityClassification; label: string }> = [
  { id: "ALL", label: "All Entries" },
  { id: "VERIFIED_BEHAVIOR", label: "Verified Behavior" },
  { id: "CONFIG_CHOICE", label: "Config Choice" },
  { id: "DESIGN_ASSUMPTION", label: "Design Assumption" },
  { id: "KNOWN_LIMITATION", label: "Known Limitation" },
];

function classificationBadge(c: SecurityClassification) {
  switch (c) {
    case "VERIFIED_BEHAVIOR":
      return <Badge variant="live">VERIFIED BEHAVIOR</Badge>;
    case "CONFIG_CHOICE":
      return <Badge variant="derived">CONFIG CHOICE</Badge>;
    case "DESIGN_ASSUMPTION":
      return <Badge variant="default">DESIGN ASSUMPTION</Badge>;
    case "KNOWN_LIMITATION":
      return <Badge variant="frozen">KNOWN LIMITATION</Badge>;
  }
}

export function SecurityAndFormatsSection() {
  const [secFilter, setSecFilter] = useState<"ALL" | SecurityClassification>("ALL");

  const filteredSec = useMemo(
    () =>
      secFilter === "ALL"
        ? SECURITY_BOUNDARIES_MATRIX
        : SECURITY_BOUNDARIES_MATRIX.filter((s) => s.classification === secFilter),
    [secFilter],
  );

  return (
    <div className="space-y-8">
      {/* 3. Security & Trust Boundaries */}
      <section className="space-y-4" data-testid="security-boundaries-section">
        <SectionHeader
          title="3. Security Controls, Assumptions & Known Limitations"
          subtitle="Explicit classification separating verified software invariants from configuration decisions, threat-model assumptions, and non-guarantees."
          provenance="FROZEN"
          provenanceLabel="SOURCE-AUDITED BOUNDARIES"
        />

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter security entries by class">
          {SEC_FILTERS.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="sm"
              variant={secFilter === f.id ? "primary" : "secondary"}
              onClick={() => setSecFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {filteredSec.map((item) => {
            const Icon =
              item.classification === "VERIFIED_BEHAVIOR"
                ? ShieldCheck
                : item.classification === "KNOWN_LIMITATION"
                  ? AlertTriangle
                  : item.classification === "CONFIG_CHOICE"
                    ? CheckCircle2
                    : Compass;
            return (
              <Panel key={item.id} className="min-w-0">
                <PanelHeader>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                    <PanelTitle className="text-xs leading-snug">{item.title}</PanelTitle>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {classificationBadge(item.classification)}
                    <ProvenanceBadge kind={item.provenance} label={item.provenance} />
                  </div>
                </PanelHeader>
                <PanelContent className="space-y-2 text-[11px] leading-relaxed text-slate-300">
                  <p>{item.detail}</p>
                  <code className="block break-words font-mono text-[10px] text-cyan-300/90">
                    {item.sourceRef}
                  </code>
                </PanelContent>
              </Panel>
            );
          })}
        </div>
      </section>

      {/* 4. Supported Formats, Encodings & Constraints */}
      <section className="space-y-4" data-testid="formats-constraints-section">
        <SectionHeader
          title="4. Supported File Formats & Upload Constraints"
          subtitle="Distinguishes direct Stage 1 CLI quarantine rules from Phase 2A HTTP upload allowlist & payload limits."
          provenance="FROZEN"
          provenanceLabel="STAGE 1 + PHASE 2A CONTRACT"
        />

        <Panel className="min-w-0">
          <PanelHeader>
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-cyan-400" />
              <PanelTitle>Input Format, Encoding &amp; API Ingestion Matrix</PanelTitle>
            </div>
            <Badge variant="default">50 files · 5 MiB/file · 25 MiB/batch</Badge>
          </PanelHeader>
          <PanelContent>
            <div className="overflow-x-auto rounded-md border border-slate-800/80">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead className="bg-[#090F1E] text-[10px] uppercase tracking-wider text-slate-400">
                  <tr className="border-b border-slate-800/80">
                    <th className="px-3 py-2.5 font-medium">Format / Extension</th>
                    <th className="px-3 py-2.5 font-medium">Phase 2A HTTP Upload Gate</th>
                    <th className="px-3 py-2.5 font-medium">Stage 1 CLI Behavior</th>
                    <th className="px-3 py-2.5 font-medium">Source Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 bg-[#0D1424]/70">
                  {FORMAT_SUPPORT_MATRIX.map((row) => (
                    <tr key={row.extensionOrFormat}>
                      <td className="px-3 py-2.5 align-top font-mono text-xs font-medium text-cyan-300">
                        {row.extensionOrFormat}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Badge
                          variant={
                            row.phase2aUploadStatus === "Process (.sanitized)"
                              ? "live"
                              : row.phase2aUploadStatus === "Quarantine Test (Accepted)"
                                ? "frozen"
                                : "danger"
                          }
                        >
                          {row.phase2aUploadStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 align-top text-[11px] leading-relaxed text-slate-300">
                        <div>{row.stage1Handling}</div>
                        <div className="mt-1 text-slate-400">{row.notes}</div>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <code className="block break-words font-mono text-[10px] text-emerald-300/90">
                          {row.sourceRef}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelContent>
        </Panel>
      </section>
    </div>
  );
}
