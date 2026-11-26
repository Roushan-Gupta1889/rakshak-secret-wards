import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Database, FileCheck2, Fingerprint, Info, ShieldCheck } from "lucide-react";
import { ApiRequestError, fetchRunSummary } from "@/api/client";
import { useHealthQuery } from "@/api/queries";
import { KpiCard } from "@/components/common/KpiCard";
import { RecordDetailPanel } from "@/components/registry/RecordDetailPanel";
import {
  INITIAL_REGISTRY_FILTERS,
  RegistryFiltersBar,
  type RegistryFiltersState,
} from "@/components/registry/RegistryFiltersBar";
import { RegistryTable } from "@/components/registry/RegistryTable";
import { SessionRunLookupBar } from "@/components/studio/SessionRunLookupBar";
import { Badge, ProvenanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, OfflineApiBanner, SectionHeader } from "@/components/ui/state-views";
import { useSanitizedRegistryQuery } from "@/hooks/useSanitizedRegistry";
import { useRunStore } from "@/stores/runStore";
import { useUiStore } from "@/stores/uiStore";

export function MedicalRegistryPage() {
  const healthQuery = useHealthQuery();
  const setActivePage = useUiStore((s) => s.setActivePage);
  const { activeRunId, activeRun, setActiveRun, clearExpiredSessionRun } = useRunStore();

  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [filters, setFilters] = useState<RegistryFiltersState>(INITIAL_REGISTRY_FILTERS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const registryQuery = useSanitizedRegistryQuery(activeRunId);

  const handleLoadRun = async (runId: string, clearSessionIf404 = false) => {
    setLookupBusy(true);
    setLookupError(null);
    try {
      const summary = await fetchRunSummary(runId);
      setActiveRun(summary);
      setFilters(INITIAL_REGISTRY_FILTERS);
      setSelectedKey(null);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (clearSessionIf404 && err.status === 404) {
          clearExpiredSessionRun(
            `Session run ${runId} expired or is no longer retained by the local API adapter.`,
          );
        } else {
          setLookupError(`${err.code}: ${err.message}`);
        }
      } else {
        setLookupError("Unable to retrieve run summary from the local API.");
      }
    } finally {
      setLookupBusy(false);
    }
  };

  useEffect(() => {
    if (activeRunId && !activeRun) {
      void handleLoadRun(activeRunId, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId, activeRun]);

  useEffect(() => {
    setSelectedKey(null);
    setFilters(INITIAL_REGISTRY_FILTERS);
  }, [activeRunId]);

  const filteredRecords = useMemo(() => {
    const all = registryQuery.data?.records ?? [];
    const psnQ = filters.pseudonymQuery.trim().toLowerCase();
    const clinQ = filters.clinicalQuery.trim().toLowerCase();

    return all.filter((rec) => {
      if (psnQ && !rec.pseudonym.toLowerCase().includes(psnQ)) return false;
      if (clinQ && !rec.clinicalSearchBlob.includes(clinQ)) return false;
      if (filters.diagnosis && !rec.diagnoses.includes(filters.diagnosis)) return false;
      if (filters.department && rec.department !== filters.department) return false;
      if (filters.hospital && rec.hospital !== filters.hospital) return false;
      if (filters.gender && rec.gender !== filters.gender) return false;
      if (filters.ageBand && rec.ageBand !== filters.ageBand) return false;
      return true;
    });
  }, [filters, registryQuery.data?.records]);

  const selectedRecord = useMemo(() => {
    if (!filteredRecords.length) return null;
    if (selectedKey) {
      const found = filteredRecords.find((r) => r.recordKey === selectedKey);
      if (found) return found;
    }
    return filteredRecords[0];
  }, [filteredRecords, selectedKey]);

  const data = registryQuery.data;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Medical Registry"
        subtitle="Sanitized patient-record explorer built strictly from actual run artifacts in sanitized/ and records.jsonl. Never synthetic or reconstructed."
        provenance={data ? "DERIVED" : "EMPTY"}
        provenanceLabel={data ? "DERIVED · SANITIZED OUTPUTS ONLY" : "NO RUN LOADED"}
        rightSlot={
          <Button size="sm" variant="secondary" onClick={() => setActivePage("studio")}>
            Open Sanitization Studio
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      {healthQuery.isError ? (
        <OfflineApiBanner onRetry={() => void healthQuery.refetch()} />
      ) : null}

      <SessionRunLookupBar
        activeRunId={activeRunId}
        isBusy={lookupBusy || registryQuery.isFetching}
        onLookupRun={(id) => handleLoadRun(id, false)}
        onRefreshActive={async () => {
          if (activeRunId) {
            await handleLoadRun(activeRunId, true);
            await registryQuery.refetch();
          }
        }}
      />

      {lookupError ? (
        <ErrorState title="Unable to load run into Medical Registry" message={lookupError} />
      ) : null}

      {!activeRunId ? (
        <EmptyState
          title="No active sanitization run selected"
          description="Submit files in Sanitization Studio or enter a retained 16-hex run ID above to inspect genuine sanitized records."
        />
      ) : registryQuery.isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : registryQuery.isError ? (
        <ErrorState
          title="Failed to build sanitized registry"
          message={
            registryQuery.error instanceof Error
              ? registryQuery.error.message
              : "Invalid or unreachable sanitized output response."
          }
          onRetry={() => {
            void registryQuery.refetch();
          }}
        />
      ) : data ? (
        <div className="space-y-4">
          {/* Privacy & API Boundary Disclosure */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-4 py-2.5 text-xs">
            <div className="flex items-start gap-2 text-slate-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <span>
                Exploring run <code className="font-mono text-cyan-300">{data.runId}</code> sanitized artifacts only. Raw <code className="font-mono text-slate-300">/records[].preview</code> slices are withheld; structured clinical fields are extracted client-side with strict sensitive-field filtering.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ProvenanceBadge kind="DERIVED" label="SANITIZED ONLY" />
              {data.stats.safeguardScrubsCount > 0 ? (
                <Badge variant="frozen">
                  Client Safeguard Masked: {data.stats.safeguardScrubsCount}
                </Badge>
              ) : null}
            </div>
          </div>

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Sanitized Patient Records"
              value={String(data.stats.patientRecordsCount)}
              sublabel={`Index total ${data.stats.indexTotal} (records.jsonl)`}
              provenance="DERIVED"
              icon={<Database className="h-4 w-4" />}
              tone="cyan"
            />
            <KpiCard
              label="Distinct Pseudonyms"
              value={String(data.stats.distinctPseudonyms)}
              sublabel="Within active secret only"
              provenance="DERIVED"
              icon={<Fingerprint className="h-4 w-4" />}
              tone="emerald"
            />
            <KpiCard
              label="Clean Files Parsed"
              value={`${data.stats.filesParsedCount} / ${data.stats.filesReferencedCount}`}
              sublabel={
                data.stats.filesSkippedOversized.length > 0
                  ? `${data.stats.filesSkippedOversized.length} oversized skipped`
                  : "JSON, FHIR R4, CSV, TSV, TXT"
              }
              provenance="LIVE"
              icon={<FileCheck2 className="h-4 w-4" />}
            />
            <KpiCard
              label="Non-Patient Refs Excluded"
              value={String(data.stats.nonPatientExcludedCount)}
              sublabel="patient: null docs omitted"
              provenance="DERIVED"
              icon={<ShieldCheck className="h-4 w-4" />}
            />
          </div>

          {data.stats.patientRecordsCount === 0 ? (
            <EmptyState
              title="No patient-linked records in this run"
              description="The selected run contains zero sanitized entries with a linked pseudonym in records.jsonl (e.g., reference tables only or all inputs quarantined)."
            />
          ) : (
            <>
              <RegistryFiltersBar
                filters={filters}
                facets={data.facets}
                totalRecords={data.records.length}
                filteredCount={filteredRecords.length}
                onChange={setFilters}
                onReset={() => setFilters(INITIAL_REGISTRY_FILTERS)}
              />

              <div className="space-y-4">
                <Panel className="min-w-0">
                  <PanelContent className="p-4">
                    <RegistryTable
                      records={filteredRecords}
                      selectedKey={selectedRecord?.recordKey ?? null}
                      onSelectRecord={(rec) => setSelectedKey(rec.recordKey)}
                    />
                  </PanelContent>
                </Panel>

                <RecordDetailPanel runId={data.runId} record={selectedRecord} />
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
