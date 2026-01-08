import { Dataset, DatasetsQuerySchema } from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  functionalUpdate,
  SortingState,
} from "@tanstack/react-table";
import { zodValidator } from "@tanstack/zod-adapter";
import { startTransition } from "react";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { SkeletonLoading } from "@/components/Skeleton";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";

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
      <div className="overflow-x-auto">
        <Table
          className="text-sm"
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
        />
      </div>
      <Pagination
        totalPages={data.pagination.totalPages}
        page={data.pagination.page}
        itemsPerPage={data.pagination.limit}
      />
    </Card>
  );
}

export const datasetsColumnHelper = createColumnHelper<Dataset>();

export const datasetsColumns = [
  datasetsColumnHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => (
      <SortHeader ctx={ctx} label={ctx.table.options.meta?.t?.("dataset-id")} />
    ),
    cell: (ctx) => (
      <Route.Link to="$datasetId" params={{ datasetId: ctx.getValue() }}>
        <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
          {ctx.getValue()}
        </TextWithIcon>
      </Route.Link>
    ),
    maxSize: 10,
  }),

  datasetsColumnHelper.accessor("releaseDate", {
    id: "releaseDate",
    header: (ctx) => (
      <SortHeader
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
