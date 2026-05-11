import { cva, type VariantProps } from "class-variance-authority";
import {
  type ColumnDef,
  type DeepValue,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type HeaderContext,
  type OnChangeFn,
  type RowData,
  type SortingState,
  type TableMeta,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "./ui/button";
import { useTranslations } from "use-intl";

const tableHeaderRowVariants = cva(
  "rounded bg-linear-to-r text-left text-white",
  {
    variants: {
      variant: {
        default: "from-secondary-light to-secondary-lighter",
        darker: "from-secondary to-secondary-light",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Table<T extends Record<string, unknown>>({
  className,
  columns,
  data,
  sorting,
  onSortingChange,
  onRowClick,
  meta,
  variant,
}: {
  className?: string;
  columns: ColumnDef<T, any>[];
  data: T[];
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  onRowClick?: (row: T) => void;
  meta?: TableMeta<T>;
  variant?: VariantProps<typeof tableHeaderRowVariants>["variant"];
}) {
  const t = useTranslations("common");
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
    <table
      className={cn("w-full table-fixed align-top text-pretty", className)}
    >
      <thead className="relative z-10 text-white">
        {table.getHeaderGroups().map((headerGroup) => {
          return (
            <tr
              key={headerGroup.id}
              className={tableHeaderRowVariants({ variant })}
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
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          );
        })}
      </thead>

      <tbody className={cn({ relative: data.length === 0 })}>
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            className={
              onRowClick ? "cursor-pointer hover:bg-gray-50" : undefined
            }
          >
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
        {data.length === 0 ? (
          <tr>
            <td className="h-10">
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-neutral-400">
                {t("no-data")}
              </p>
            </td>
          </tr>
        ) : null}
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
                      header.getContext(),
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
