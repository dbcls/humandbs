import { DatasetSearchBodySchema } from "@humandbs/backend/types";
import type { DatasetSearchResponse } from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, functionalUpdate } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type SortingState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { startTransition, Suspense, useCallback, useMemo } from "react";

import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { SortHeader, Table } from "@/components/Table";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/config/i18n";
import { useFilters } from "@/hooks/useFilters";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";

import { CreateDatasetDialog } from "./-CreateDatasetDialog";

const searchSchema = DatasetSearchBodySchema.omit({
  lang: true,
  includeFacets: true,
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/datasets/",
)({
  component: RouteComponent,
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) => {
    context.queryClient.ensureQueryData(
      getDatasetsPaginatedQueryOptions({
        ...deps,
        sort: deps.sort ?? "datasetId",
        lang: context.lang,
      }),
    );
  },
});

function RouteComponent() {
  return (
    <Card
      className="flex h-full flex-1 flex-col"
      caption="Datasets"
      containerClassName="flex flex-1 flex-col overflow-hidden"
    >
      <div className="flex justify-between pb-2">
        <CreateDatasetDialog />
      </div>
      <CardContent />
    </Card>
  );
}

function CardContent() {
  const { lang } = Route.useRouteContext();
  const search = Route.useSearch();
  const { setFilters } = useFilters(Route.id);

  const sorting = useMemo(() => {
    if (!search.sort) return [];
    return [{ id: search.sort, desc: search.order === "desc" }];
  }, [search.sort, search.order]);

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const sortingState: SortingState = [
        { id: search.sort ?? "datasetId", desc: search.order === "desc" },
      ];
      const newState = functionalUpdate(updater, sortingState);

      startTransition(() => {
        setFilters({
          sort: newState[0]?.id,
          order: newState[0]?.desc ? "desc" : "asc",
        });
      });
    },
    [setFilters, search],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<TableSkeleton />}>
          <DatasetsTable
            lang={lang}
            sorting={sorting}
            onSortingChange={handleSortingChange}
          />
        </Suspense>
      </div>
      <Suspense>
        <TablePagination lang={lang} />
      </Suspense>
    </div>
  );
}

function DatasetsTable({
  lang,
  sorting,
  onSortingChange,
}: {
  lang: Locale;
  sorting: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
}) {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(
    getDatasetsPaginatedQueryOptions({
      ...search,
      sort: search.sort ?? "datasetId",
      lang,
    }),
  );
  const columns = useMemo(() => getColumns(lang), [lang]);

  return (
    <Table
      className="text-sm"
      columns={columns}
      data={data.data}
      sorting={sorting}
      onSortingChange={onSortingChange}
    />
  );
}

function TablePagination({ lang }: { lang: Locale }) {
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(
    getDatasetsPaginatedQueryOptions({
      ...search,
      sort: search.sort ?? "datasetId",
      lang,
    }),
  );
  return <Pagination pagination={data.meta.pagination} />;
}

function TableSkeleton() {
  const columns = useMemo(() => getColumns("ja"), []);
  const table = useReactTable({
    data: [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    defaultColumn: { maxSize: 20, minSize: 5 },
    state: { sorting: [] },
    onSortingChange: () => {},
    manualSorting: true,
  });

  return (
    <table className="w-full table-fixed align-top text-sm">
      <thead className="text-white">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            key={headerGroup.id}
            className="from-secondary-light to-secondary-lighter rounded bg-linear-to-r text-left"
          >
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className="p-2 first-of-type:rounded-l last-of-type:rounded-r"
                style={{ width: `${header.getSize()}rem` }}
              >
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {Array.from({ length: 8 }).map((_, i) => (
          <tr key={i}>
            {table.getAllColumns().map((col) => (
              <td
                key={col.id}
                className="border-foreground-light/50 border-b-2 p-2"
              >
                <Skeleton className="h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const columnHelper =
  createColumnHelper<DatasetSearchResponse["data"][number]>();

function getColumns(lang: Locale) {
  return [
    columnHelper.accessor("datasetId", {
      id: "datasetId",
      header: (ctx) => <SortHeader ctx={ctx} label="Dataset ID" />,
      cell: (ctx) => <span className="font-mono">{ctx.getValue()}</span>,
      size: 15,
    }),
    columnHelper.accessor("releaseDate", {
      id: "releaseDate",
      header: (ctx) => <SortHeader ctx={ctx} label="Release Date" />,
      cell: (ctx) => <span>{ctx.getValue()}</span>,
      size: 12,
    }),
    columnHelper.accessor("typeOfData", {
      id: "typeOfData",
      header: "Type of Data",
      cell: (ctx) => {
        const value = ctx.getValue();
        return value[lang] ?? value.en ?? value.ja ?? "";
      },
      size: 15,
    }),
    columnHelper.accessor("experiments", {
      id: "experiments",
      header: "Experiments",
      cell: (ctx) => {
        const experiments = ctx.getValue();
        if (experiments.length === 0) return null;

        return (
          <ul className="space-y-2">
            {experiments.map((experiment, i) => (
              <li key={i}>
                {experiment.header[lang]?.text ??
                  experiment.header.en?.text ??
                  experiment.header.ja?.text}
              </li>
            ))}
          </ul>
        );
      },
      size: 25,
    }),
    columnHelper.accessor("criteria", {
      id: "criteria",
      header: "Criteria",
      cell: (ctx) => <span className="text-xs">{ctx.getValue()}</span>,
      size: 15,
    }),
  ];
}
