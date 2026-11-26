import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state-views";
import type { SanitizedRegistryRecord } from "@/lib/sanitizedRegistryParser";
import { cn } from "@/lib/utils";

function MissingCell() {
  return <span className="text-[11px] italic text-slate-500">Not available</span>;
}

function summarizeClinical(rec: SanitizedRegistryRecord): string | null {
  if (rec.diagnoses.length > 0) return rec.diagnoses.join("; ");
  if (rec.procedures.length > 0) return rec.procedures.join("; ");
  if (rec.observations.length > 0) {
    const first = rec.observations[0];
    return `${first.test}: ${first.value}${first.unit ? ` ${first.unit}` : ""}`;
  }
  if (rec.medications.length > 0) return rec.medications[0];
  return null;
}

export function RegistryTable({
  records,
  selectedKey,
  onSelectRecord,
}: {
  records: SanitizedRegistryRecord[];
  selectedKey: string | null;
  onSelectRecord: (rec: SanitizedRegistryRecord) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [records.length]);

  const columns = useMemo<ColumnDef<SanitizedRegistryRecord, unknown>[]>(
    () => [
      {
        accessorKey: "pseudonym",
        header: "Pseudonym",
        cell: ({ getValue }) => (
          <Badge variant="cyan" className="font-mono">
            {String(getValue())}
          </Badge>
        ),
      },
      {
        id: "ageBand",
        accessorFn: (row) => row.ageSortValue ?? 999,
        sortDescFirst: false,
        header: "Age Band",
        cell: ({ row }) =>
          row.original.ageBand ? (
            <span className="font-mono text-[11px] text-slate-100">{row.original.ageBand}</span>
          ) : (
            <MissingCell />
          ),
      },
      {
        accessorKey: "gender",
        header: "Gender",
        cell: ({ getValue }) => {
          const val = getValue();
          return val ? (
            <span className="text-xs text-slate-200">{String(val)}</span>
          ) : (
            <MissingCell />
          );
        },
      },
      {
        id: "clinicalSummary",
        accessorFn: (row) => summarizeClinical(row) ?? "",
        header: "Diagnosis / Clinical",
        cell: ({ row }) => {
          const summary = summarizeClinical(row.original);
          return summary ? (
            <span className="line-clamp-2 max-w-[240px] text-xs text-slate-200">{summary}</span>
          ) : (
            <MissingCell />
          );
        },
      },
      {
        id: "hospitalDept",
        accessorFn: (row) => `${row.hospital ?? ""} ${row.department ?? ""}`.trim(),
        header: "Hospital / Dept",
        cell: ({ row }) => {
          const { hospital, department } = row.original;
          if (!hospital && !department) return <MissingCell />;
          return (
            <div className="max-w-[200px] space-y-0.5">
              {hospital ? <div className="truncate text-xs text-slate-200">{hospital}</div> : null}
              {department ? (
                <div className="truncate text-[11px] text-slate-400">{department}</div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "primaryDate",
        accessorFn: (row) => row.primaryDate ?? "",
        header: "Dates",
        cell: ({ row }) => {
          const { admissionDate, dischargeDate, visitOrReportDate } = row.original;
          if (admissionDate || dischargeDate) {
            return (
              <span className="font-mono text-[11px] text-slate-300">
                {admissionDate ?? "?"} → {dischargeDate ?? "?"}
              </span>
            );
          }
          if (visitOrReportDate) {
            return <span className="font-mono text-[11px] text-slate-300">{visitOrReportDate}</span>;
          }
          return <MissingCell />;
        },
      },
      {
        id: "source",
        accessorFn: (row) => `${row.sourceFile} ${row.loc}`,
        header: "Source",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="default">{row.original.sourceFormat}</Badge>
              <span className="font-mono text-[10px] text-slate-400">{row.original.loc}</span>
            </div>
            <div className="max-w-[170px] truncate font-mono text-[10px] text-slate-400">
              {row.original.sourceFile.replace(/^sanitized\//, "")}
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: records,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (!records.length) {
    return (
      <EmptyState
        title="No matching sanitized records"
        description="No records match the current pseudonym search or attribute filters."
      />
    );
  }

  const { pageIndex, pageSize } = table.getState().pagination;
  const startItem = pageIndex * pageSize + 1;
  const endItem = Math.min((pageIndex + 1) * pageSize, records.length);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-slate-800/80">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-[#090F1E] text-[11px] uppercase tracking-wider text-slate-400">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-slate-800/80">
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <th
                      key={header.id}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                      }
                      className="px-3 py-2.5 font-medium"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex cursor-pointer items-center gap-1 text-left uppercase tracking-wider text-slate-300 hover:text-cyan-300 focus-visible:outline-none focus-visible:text-cyan-300"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3 text-cyan-400" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3 text-cyan-400" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-slate-600" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-800/70 bg-[#0D1424]/70">
            {table.getRowModel().rows.map((row) => {
              const selected = row.original.recordKey === selectedKey;
              return (
                <tr
                  key={row.original.recordKey}
                  data-selected={selected ? "true" : "false"}
                  tabIndex={0}
                  onClick={() => onSelectRecord(row.original)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectRecord(row.original);
                    }
                  }}
                  className={cn(
                    "cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-400",
                    selected
                      ? "bg-cyan-500/12 hover:bg-cyan-500/15"
                      : "hover:bg-slate-800/40",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[11px] tabular-nums">
            Showing {startItem}–{endItem} of {records.length}
          </span>
          <label className="flex items-center gap-1.5 text-[11px]">
            <span>Rows:</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-7 rounded border border-slate-700/80 bg-[#080E1C] px-1.5 font-mono text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              {[10, 25, 50].map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="mr-1 font-mono text-[11px] tabular-nums">
            Page {pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
