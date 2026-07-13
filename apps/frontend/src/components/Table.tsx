import type {
  ColumnDef,
  DeepValue,
  HeaderContext,
  OnChangeFn,
  RowData,
  SortingState,
  TableMeta,
  VisibilityColumn,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "use-intl";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { LoadingSpinner } from "./LoadingSpinner";
import { Button } from "./ui/button";

const tableHeaderRowVariants = cva("rounded bg-linear-to-r text-left text-white", {
  variants: {
    variant: {
      default: "from-secondary-light to-secondary-lighter",
      darker: "from-secondary to-secondary-light",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Table<T extends Record<string, unknown>>({
  className,
  columns,
  data,
  sorting,
  onSortingChange,
  onRowClick,
  meta,
  variant,
  isDimmed,
  stickyColumnCount = 0,
  columnVisibility,
}: {
  className?: string;
  columns: ColumnDef<T, any>[];
  data: T[];
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  onRowClick?: (row: T) => void;
  meta?: TableMeta<T>;
  variant?: VariantProps<typeof tableHeaderRowVariants>["variant"];
  isDimmed?: boolean;
  stickyColumnCount?: 0 | 1 | 2;
  columnVisibility?: VisibilityState;
}) {
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  const t = useTranslations("common");
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const isControlledSorting = sorting !== undefined && onSortingChange !== undefined;

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
    state: {
      sorting: isControlledSorting ? sorting : localSorting,
      columnOrder: columnOrder,
      columnVisibility,
    },
    onSortingChange: isControlledSorting ? onSortingChange : setLocalSorting,
    manualSorting: isControlledSorting,
    onColumnOrderChange: setColumnOrder,
  });

  return (
    <table className={cn("w-full table-auto text-pretty align-top", className)}>
      <thead className="sticky top-0 z-30 text-white">
        {table.getHeaderGroups().map((headerGroup) => {
          return (
            <tr key={headerGroup.id} className={tableHeaderRowVariants({ variant })}>
              {headerGroup.headers.map((header, index) => {
                const isSticky = index < stickyColumnCount;
                const isCartColumn = header.column.id === "cart";
                return (
                  <th
                    key={header.id}
                    className={cn(
                      "max-w-[300px] p-2 first-of-type:rounded-l last-of-type:rounded-r",
                      {
                        "sticky left-0 z-40 px-1.5 py-2": isSticky && index === 0,
                        "w-12 min-w-12 max-w-12": isSticky && index === 0 && isCartColumn,
                        "sticky left-12 z-40 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]":
                          isSticky && index === 1,
                        "bg-secondary-light":
                          isSticky &&
                          (index === 0 || index === 1) &&
                          (variant === "default" || !variant),
                        "bg-secondary":
                          isSticky && (index === 0 || index === 1) && variant === "darker",
                      },
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          );
        })}
      </thead>

      <tbody
        className={cn("transition-opacity", {
          "pointer-events-none opacity-40": isDimmed,
        })}
      >
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            className={cn("bg-white transition-colors", {
              "group cursor-pointer hover:bg-gray-50": onRowClick,
            })}
          >
            {row.getVisibleCells().map((cell, index) => {
              const isSticky = index < stickyColumnCount;
              const isCartColumn = cell.column.id === "cart";
              return (
                <td
                  key={cell.id}
                  className={cn(
                    "max-w-[300px] border-foreground-light/50 border-b-2 p-2 align-top",
                    {
                      "sticky left-0 z-20 bg-inherit px-1.5 py-2": isSticky && index === 0,
                      "w-12 min-w-12 max-w-12": isSticky && index === 0 && isCartColumn,
                      "sticky left-12 z-20 bg-inherit shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]":
                        isSticky && index === 1,
                    },
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              );
            })}
          </tr>
        ))}
        {data.length === 0 ? (
          <tr>
            <td
              colSpan={table.getAllLeafColumns().length}
              className="h-10 text-center text-neutral-400"
            >
              {t("no-data")}
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
                  : flexRender(header.column.columnDef.footer, header.getContext())}
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
  const activeSort = ctx.table.options.meta?.activeSort;
  const localSort = ctx.table
    .getState()
    .sorting?.find((sortEntry) => sortEntry.id === ctx.column.id);
  const sortingState =
    activeSort?.id === ctx.column.id
      ? activeSort.desc
        ? "desc"
        : "asc"
      : localSort
        ? localSort.desc
          ? "desc"
          : "asc"
        : false;
  return (
    <div className="flex items-center gap-2 text-white">
      <span>{label}</span>
      {ctx.table.options.meta?.loadingSortColumnId === ctx.column.id ? (
        <div className="h-fit px-4 py-2">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
      ) : (
        <Button
          variant="ghost"
          className="h-8 w-8 p-0 text-white hover:bg-white/20"
          onClick={ctx.column.getToggleSortingHandler()}
        >
          <span className="m-auto flex flex-col items-center justify-center text-[10px] leading-[0.8]">
            <span
              className={cn(
                "inline-block scale-x-125 scale-y-[0.6]",
                sortingState === "asc" ? "opacity-100" : "opacity-40",
              )}
            >
              ▲
            </span>
            <span
              className={cn(
                "inline-block scale-x-125 scale-y-[0.6]",
                sortingState === "desc" ? "opacity-100" : "opacity-40",
              )}
            >
              ▼
            </span>
          </span>
        </Button>
      )}
    </div>
  );
}

function TableLoadingSpinner<T extends Record<string, unknown>>({
  columns,
  className,
  meta,
}: {
  columns: ColumnDef<T, any>[];
  className?: string;
  meta?: TableMeta<T>;
}) {
  const table = useReactTable({
    data: [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { maxSize: 20, minSize: 5 },
    meta,
  });

  return (
    <table className={cn("w-full table-fixed text-pretty align-top", className)}>
      <thead className="relative z-10 text-white">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className={tableHeaderRowVariants()}>
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className={"p-2 first-of-type:rounded-l last-of-type:rounded-r"}
                style={{ width: `${header.getSize()}rem` }}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        <tr>
          <td colSpan={columns.length} className="h-32">
            <div className="flex items-center justify-center">
              <LoadingSpinner variant={"secondary"} size={"lg"} />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export { SortHeader, Table, TableLoadingSpinner };
