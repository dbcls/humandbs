import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { SkeletonLoading } from "@/components/Skeleton";
import { Table } from "@/components/Table";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/hooks/useFilters";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";
import { Dataset, DatasetsQuerySchema } from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  DeepValue,
  functionalUpdate,
  HeaderContext,
  RowData,
  SortingState,
} from "@tanstack/react-table";
import { zodValidator } from "@tanstack/zod-adapter";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { startTransition } from "react";
import { useTranslations } from "use-intl";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets/"
)({
  component: RouteComponent,
  validateSearch: zodValidator(DatasetsQuerySchema),
  loaderDeps: ({ search: { page, limit, sort, order } }) => {
    return {
      page,
      limit,
      sort,
      order,
    };
  },
  errorComponent: ({ error }) => <div>{error.message}</div>,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      getDatasetsPaginatedQueryOptions({ ...deps, lang: context.lang })
    );
  },
  wrapInSuspense: true,
  pendingComponent: () => <SkeletonLoading />,
});

function RouteComponent() {
  const search = Route.useSearch();

  const { lang } = Route.useRouteContext();
  const { data } = useSuspenseQuery(
    getDatasetsPaginatedQueryOptions({ ...search, lang })
  );

  const { filters, setFilters } = useFilters(Route.id);

  const sortingState: SortingState = [
    { id: filters.sort, desc: filters.order === "desc" },
  ];

  const t = useTranslations("Dataset-list");

  return (
    <Card caption={t("dataset-list")} captionSize={"lg"}>
      <Table
        onSortingChange={(updater) => {
          const newState = functionalUpdate(updater, sortingState);

          startTransition(() => {
            setFilters({
              sort: newState[0]?.id,
              order: newState[0]?.desc ? "desc" : "asc",
            });
          });
        }}
        sorting={sortingState}
        meta={{ t }}
        columns={datasetsColumns}
        data={data.data}
      ></Table>
      <Pagination
        totalPages={data.pagination.totalPages}
        page={data.pagination.page}
        itemsPerPage={data.pagination.limit}
      />
    </Card>
  );
}

function SortButton<T extends RowData, V extends DeepValue<T, T>>({
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
        onClick={(e) =>
          startTransition(() => ctx.column.getToggleSortingHandler()?.(e))
        }
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
const datasetsColumnHelper = createColumnHelper<Dataset>();

const datasetsColumns = [
  datasetsColumnHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => (
      <SortButton ctx={ctx} label={ctx.table.options.meta?.t?.("dataset-id")} />
    ),
    cell: (ctx) => ctx.getValue(),
  }),
  datasetsColumnHelper.accessor("version", {
    id: "version",
    header: (ctx) => {
      return <p>{ctx.table.options.meta?.t?.("version")}</p>;
    },
    cell: (ctx) => ctx.getValue(),
  }),
  datasetsColumnHelper.accessor("releaseDate", {
    id: "releaseDate",
    header: (ctx) => (
      <SortButton
        ctx={ctx}
        label={ctx.table.options.meta?.t?.("release-date")}
      />
    ),
    cell: (ctx) => ctx.getValue(),
  }),
  datasetsColumnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => {
      return <p>{ctx.table.options.meta?.t?.("type-of-data")}</p>;
    },
    cell: (ctx) => ctx.getValue(),
  }),
];
