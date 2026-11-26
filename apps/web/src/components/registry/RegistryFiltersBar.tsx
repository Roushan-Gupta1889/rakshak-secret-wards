import { FilterX, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent } from "@/components/ui/card";
import type { AvailableRegistryFacets } from "@/lib/sanitizedRegistryParser";

export interface RegistryFiltersState {
  pseudonymQuery: string;
  clinicalQuery: string;
  diagnosis: string;
  department: string;
  hospital: string;
  gender: string;
  ageBand: string;
}

export const INITIAL_REGISTRY_FILTERS: RegistryFiltersState = {
  pseudonymQuery: "",
  clinicalQuery: "",
  diagnosis: "",
  department: "",
  hospital: "",
  gender: "",
  ageBand: "",
};

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  return (
    <label className="block min-w-0 space-y-1 text-xs">
      <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-slate-700/80 bg-[#080E1C] px-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
      >
        <option value="">All ({options.length})</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RegistryFiltersBar({
  filters,
  facets,
  totalRecords,
  filteredCount,
  onChange,
  onReset,
}: {
  filters: RegistryFiltersState;
  facets: AvailableRegistryFacets;
  totalRecords: number;
  filteredCount: number;
  onChange: (next: RegistryFiltersState) => void;
  onReset: () => void;
}) {
  const hasAnyFacet =
    facets.diagnoses.length > 0 ||
    facets.departments.length > 0 ||
    facets.hospitals.length > 0 ||
    facets.genders.length > 0 ||
    facets.ageBands.length > 0;

  const activeCount = [
    filters.pseudonymQuery.trim(),
    filters.clinicalQuery.trim(),
    filters.diagnosis,
    filters.department,
    filters.hospital,
    filters.gender,
    filters.ageBand,
  ].filter(Boolean).length;

  return (
    <Panel className="min-w-0">
      <PanelContent className="space-y-3 py-3.5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block min-w-0 space-y-1 text-xs">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-400">
              Search by Pseudonym
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                aria-label="Search by pseudonym"
                placeholder="PSN-XXXXXX..."
                value={filters.pseudonymQuery}
                onChange={(e) => onChange({ ...filters, pseudonymQuery: e.target.value })}
                className="h-8 w-full rounded-md border border-slate-700/80 bg-[#080E1C] pr-3 pl-8 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </label>

          <label className="block min-w-0 space-y-1 text-xs">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-400">
              Search Clinical Attributes
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                aria-label="Search clinical attributes"
                placeholder="Diagnosis, procedure, lab, hospital, medication..."
                value={filters.clinicalQuery}
                onChange={(e) => onChange({ ...filters, clinicalQuery: e.target.value })}
                className="h-8 w-full rounded-md border border-slate-700/80 bg-[#080E1C] pr-3 pl-8 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </label>
        </div>

        {/* Dynamic facets: ONLY render dropdowns for attributes genuinely present in dataset */}
        {hasAnyFacet ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {facets.diagnoses.length > 0 ? (
              <FacetSelect
                label="Diagnosis"
                value={filters.diagnosis}
                options={facets.diagnoses}
                onChange={(v) => onChange({ ...filters, diagnosis: v })}
              />
            ) : null}
            {facets.departments.length > 0 ? (
              <FacetSelect
                label="Department"
                value={filters.department}
                options={facets.departments}
                onChange={(v) => onChange({ ...filters, department: v })}
              />
            ) : null}
            {facets.hospitals.length > 0 ? (
              <FacetSelect
                label="Hospital"
                value={filters.hospital}
                options={facets.hospitals}
                onChange={(v) => onChange({ ...filters, hospital: v })}
              />
            ) : null}
            {facets.genders.length > 0 ? (
              <FacetSelect
                label="Gender"
                value={filters.gender}
                options={facets.genders}
                onChange={(v) => onChange({ ...filters, gender: v })}
              />
            ) : null}
            {facets.ageBands.length > 0 ? (
              <FacetSelect
                label="Age Range"
                value={filters.ageBand}
                options={facets.ageBands}
                onChange={(v) => onChange({ ...filters, ageBand: v })}
              />
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">
            No optional demographic or facility filter facets (diagnosis, department, hospital, gender, age band) were found in this run&apos;s sanitized records.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="cyan">
              Showing {filteredCount} / {totalRecords} records
            </Badge>
            {activeCount > 0 ? (
              <Badge variant="default">{activeCount} active filter{activeCount > 1 ? "s" : ""}</Badge>
            ) : null}
          </div>
          {activeCount > 0 ? (
            <Button type="button" size="sm" variant="secondary" onClick={onReset}>
              <FilterX className="h-3.5 w-3.5" />
              Clear Filters
            </Button>
          ) : null}
        </div>
      </PanelContent>
    </Panel>
  );
}
