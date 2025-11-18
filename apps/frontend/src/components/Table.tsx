import { cn } from "@/lib/utils";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  OnChangeFn,
  SortingState,
  TableMeta,
  useReactTable,
} from "@tanstack/react-table";

function Table<T extends Record<string, any>>({
  className,
  columns,
  data,
  sorting,
  onSortingChange,
  meta,
}: {
  className?: string;
  columns: ColumnDef<T, any>[];
  data: T[];
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  meta?: TableMeta<T>;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),

    meta,
    ...(sorting !== undefined && onSortingChange !== undefined
      ? {
          // Server-side sorting configuration
          state: { sorting },
          onSortingChange,
          manualSorting: true,
        }
      : {
          // Client-side sorting (default behavior)
        }),
  });

  return (
    <table className={cn("w-full align-top", className)}>
      <thead className="text-white">
        {table.getHeaderGroups().map((headerGroup) => {
          return (
            <tr
              key={headerGroup.id}
              className="from-secondary-light to-secondary-lighter rounded bg-linear-to-r text-left"
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={
                    "p-2 first-of-type:rounded-l last-of-type:rounded-r"
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          );
        })}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                className="border-foreground-light/50 border-b-2 p-2 align-top"
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot>
        {table.getFooterGroups().map((footerGroup) => (
          <tr key={footerGroup.id}>
            {footerGroup.headers.map((header) => (
              <th key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.footer,
                      header.getContext()
                    )}
              </th>
            ))}
          </tr>
        ))}
      </tfoot>
    </table>
  );
}

export { Table };
