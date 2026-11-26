import { useState } from "react";
import { Download, FileText, Info, Loader2, ShieldAlert, UserCheck } from "lucide-react";
import {
  ApiRequestError,
  buildSanitizedFileDownloadUrl,
  downloadRunArtifact,
} from "@/api/client";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state-views";
import type { SanitizedRegistryRecord } from "@/lib/sanitizedRegistryParser";

function DetailField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded border border-slate-800/80 bg-[#080E1C] px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 break-words text-xs text-slate-100">
        {value ? value : <span className="italic text-slate-500">Not available</span>}
      </div>
    </div>
  );
}

export function RecordDetailPanel({
  runId,
  record,
}: {
  runId: string | null;
  record: SanitizedRegistryRecord | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!record) {
    return (
      <Panel className="min-w-0">
        <PanelHeader>
          <PanelTitle>Sanitized Record Detail</PanelTitle>
          <ProvenanceBadge kind="EMPTY" label="SELECT ROW" />
        </PanelHeader>
        <PanelContent>
          <EmptyState
            title="Select a record to inspect"
            description="Choose any row from the sanitized registry table to view generalized demographics, diagnoses, dates, and redacted marker provenance."
          />
        </PanelContent>
      </Panel>
    );
  }

  const markerEntries = Object.entries(record.redactionMarkers).sort((a, b) => b[1] - a[1]);

  const handleDownloadSource = async () => {
    if (!runId) return;
    setDownloading(true);
    setDownloadError(null);
    const filename = record.sourceFile.split("/").pop() || "sanitized_source.txt";
    try {
      await downloadRunArtifact(buildSanitizedFileDownloadUrl(runId, record.sourceFile, true), filename);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setDownloadError(`${err.code}: ${err.message}`);
      } else {
        setDownloadError("Unable to download sanitized source artifact.");
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Panel className="min-w-0" data-testid="record-detail-panel">
      <PanelHeader>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <UserCheck className="h-4 w-4 text-cyan-400" />
            <PanelTitle className="font-mono">{record.pseudonym}</PanelTitle>
            <ProvenanceBadge kind="DERIVED" label="DERIVED · SANITIZED ARTIFACT" />
          </div>
          <PanelDescription className="break-all font-mono text-[11px]">
            {record.sourceFile} · {record.loc}
          </PanelDescription>
        </div>
        <Badge variant="default">{record.sourceFormat}</Badge>
      </PanelHeader>

      <PanelContent className="space-y-4">
        {/* Pseudonym & Non-Reconstruction Advisory */}
        <div className="flex items-start gap-2 rounded-md border border-cyan-500/25 bg-cyan-500/5 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <span>
            Pseudonyms are deterministic within one secret and <code className="font-mono text-slate-200">phase-1e-v1</code> key space (6-char Crockford base-32) and are <strong>not globally unique</strong>. Raw identifiers, phones, addresses, and relatives are excluded.
          </span>
        </div>

        {record.parseState === "index_only_oversized" ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Source artifact exceeded client parsing limit (512 KiB). Showing safe <code className="font-mono">records.jsonl</code> index metadata only.
            </span>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Generalized Demographics & Geography */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Generalized Demographics &amp; Geography
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <DetailField label="Pseudonym" value={record.pseudonym} />
              <DetailField label="Age / Generalized Band" value={record.ageBand} />
              <DetailField label="Gender (Retained)" value={record.gender} />
              <DetailField
                label="District / PIN Prefix"
                value={
                  record.district || record.postalPrefix
                    ? [record.district, record.postalPrefix].filter(Boolean).join(" · ")
                    : null
                }
              />
            </div>
          </div>

          {/* Hospital & Encounter Dates */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Care Context &amp; Shifted Clinical Dates
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <DetailField label="Hospital / Facility" value={record.hospital} />
              <DetailField label="Department / Ward" value={record.department} />
              <DetailField label="Admission Date" value={record.admissionDate} />
              <DetailField label="Discharge Date" value={record.dischargeDate} />
              <DetailField label="Visit / Collected Date" value={record.visitOrReportDate} />
              <DetailField label="Attending Clinician" value={record.clinician} />
            </div>
          </div>

          {/* Clinical Information */}
          <div className="space-y-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Sanitized Clinical Information
            </p>
            <div className="space-y-2 rounded-md border border-slate-800/80 bg-[#080E1C] p-3 text-xs">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Diagnosis / Conditions
                </span>
                {record.diagnoses.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {record.diagnoses.map((d) => (
                      <Badge key={d} variant="cyan" className="whitespace-normal break-words">
                        {d}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-0.5 italic text-slate-500">Not available</p>
                )}
              </div>

              <div className="border-t border-slate-800/70 pt-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Procedures
                </span>
                {record.procedures.length > 0 ? (
                  <p className="mt-0.5 text-slate-200">{record.procedures.join(" · ")}</p>
                ) : (
                  <p className="mt-0.5 italic text-slate-500">Not available</p>
                )}
              </div>

              <div className="border-t border-slate-800/70 pt-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  Medications
                </span>
                {record.medications.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-slate-200">
                    {record.medications.map((m) => (
                      <li key={m} className="break-words">
                        • {m}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 italic text-slate-500">Not available</p>
                )}
              </div>

              {record.observations.length > 0 ? (
                <div className="border-t border-slate-800/70 pt-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Lab Observations
                  </span>
                  <ul className="mt-1 space-y-1 font-mono text-[11px] text-slate-200">
                    {record.observations.slice(0, 8).map((o, idx) => (
                      <li key={`${o.test}-${idx}`}>
                        {o.test}: {o.value}
                        {o.unit ? ` ${o.unit}` : ""}
                        {o.range ? ` (ref ${o.range})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {record.vitals.length > 0 ? (
                <div className="border-t border-slate-800/70 pt-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    Vitals
                  </span>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-200">
                    {record.vitals.join(" · ")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Redaction Markers & Artifact Download */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              Verified Redaction Markers in Source
            </span>
            {record.recordStatus ? (
              <Badge variant="live">status: {record.recordStatus}</Badge>
            ) : null}
          </div>
          {markerEntries.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {markerEntries.map(([tag, count]) => (
                <Badge key={tag} variant="default">
                  [{tag}] × {count}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">No placeholder markers tallied in parsed text.</p>
          )}

          {downloadError ? <ErrorState title="Download failed" message={downloadError} /> : null}

          {runId ? (
            <div className="pt-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={downloading}
                onClick={() => void handleDownloadSource()}
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <FileText className="h-3.5 w-3.5" />
                Download Sanitized Source File
              </Button>
            </div>
          ) : null}
        </div>
      </PanelContent>
    </Panel>
  );
}
