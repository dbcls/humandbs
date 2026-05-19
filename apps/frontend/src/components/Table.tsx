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
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  LoaderCircle,
} from "lucide-react";

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
  isDimmed,
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
      className={cn("w-full table-auto align-top text-pretty", className)}
    >
      <thead className="sticky top-0 z-30 text-white">
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
                    "p-2 first-of-type:rounded-l last-of-type:rounded-r max-w-[300px]"
                  }
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

      <tbody
        className={cn("transition-opacity", {
          relative: data.length === 0,
          "pointer-events-none opacity-40": isDimmed,
        })}
      >
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            className={cn({
              "cursor-pointer hover:bg-gray-50": onRowClick,
            })}
          >
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                className="border-foreground-light/50 border-b-2 p-2 align-top max-w-[300px]"
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
  const activeSort = ctx.table.options.meta?.activeSort;
  const sortingState =
    activeSort?.id === ctx.column.id
      ? activeSort.desc
        ? "desc"
        : "asc"
      : ctx.column.getIsSorted();

  return (
    <p className="flex items-center gap-2 text-white">
      <span>{label}</span>
      {ctx.table.options.meta?.loadingSortColumnId === ctx.column.id ? (
        <div className="h-fit px-4 py-2">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
      ) : (
        <Button
          variant={"ghost"}
          className="text-white h-8 w-8 hover:bg-white/20"
          onClick={ctx.column.getToggleSortingHandler()}
        >
          <span className="flex flex-col items-center justify-center text-[10px] leading-[0.8]">
            <span className={cn("inline-block scale-y-[0.6] scale-x-125", sortingState === "asc" ? "opacity-100" : "opacity-40")}>▲</span>
            <span className={cn("inline-block scale-y-[0.6] scale-x-125", sortingState === "desc" ? "opacity-100" : "opacity-40")}>▼</span>
          </span>
        </Button>
      )}
    </p>
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
    <table
      className={cn("w-full table-fixed align-top text-pretty", className)}
    >
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
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        <tr>
          <td colSpan={columns.length} className="h-32">
            <div className="flex items-center justify-center">
              <LoaderCircle className="text-secondary size-8 animate-spin" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export { Table, SortHeader, TableLoadingSpinner };
