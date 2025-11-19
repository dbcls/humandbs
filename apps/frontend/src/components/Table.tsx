import { cn } from "@/lib/utils";
import {
  ColumnDef,
  DeepValue,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  HeaderContext,
  OnChangeFn,
  RowData,
  SortingState,
  TableMeta,
  useReactTable,
} from "@tanstack/react-table";
import { Button } from "./ui/button";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";

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
    defaultColumn: {
      maxSize: 20,
      minSize: 5,
    },
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
    <table className={cn("w-full table-fixed align-top", className)}>
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
                  style={{ width: `${header.getSize()}rem` }}
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

function SortHeader<T extends RowData, V extends DeepValue<T, T>>({
  ctx,
  label,
}: {
  ctx: HeaderContext<T, V>;
  label: React.ReactNode;
}) {
  const sortingState = ctx.column.getIsSorted();

  return (
    <p className="flex gap-2 text-white">
      <span>{label}</span>
      <Button
        variant={"ghost"}
        className="text-white [&_svg]:size-5"
        onClick={ctx.column.getToggleSortingHandler()}
      >
        {sortingState ? (
          <>{sortingState === "asc" ? <ChevronUp /> : <ChevronDown />}</>
        ) : (
          <ChevronsUpDown />
        )}
      </Button>
    </p>
  );
}

export { Table, SortHeader };
