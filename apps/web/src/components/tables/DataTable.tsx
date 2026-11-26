import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state-views";
import { cn } from "@/lib/utils";

export function DataTable<TData>({
  data,
  columns,
  loading = false,
  emptyTitle = "No rows available",
  emptyDescription = "No entries match the current dataset.",
  className,
}: {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div className="space-y-2 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!data.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn("overflow-x-auto rounded-md border border-slate-800/80", className)}>
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-[#090F1E] text-[11px] uppercase tracking-wider text-slate-400">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-slate-800/80">
              {hg.headers.map((header) => (
                <th key={header.id} className="px-3 py-2.5 font-medium">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-800/70 bg-[#0D1424]/70">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-800/35">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2.5 align-top text-slate-200">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
