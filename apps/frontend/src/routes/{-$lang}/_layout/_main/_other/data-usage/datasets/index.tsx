import {
  DatasetListingQuerySchema,
  type DatasetSearchUnifiedResponse,
} from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  functionalUpdate,
  type SortingState,
} from "@tanstack/react-table";
import { zodValidator } from "@tanstack/zod-adapter";
import { startTransition } from "react";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { SkeletonLoading } from "@/components/Skeleton";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { i18n } from "@/config/i18n";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";

const datasetListQuerySchema = DatasetListingQuerySchema.omit({ lang: true });

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets/",
)({
  component: RouteComponent,
  validateSearch: zodValidator(datasetListQuerySchema),
  loaderDeps: ({ search }) => search,
  errorComponent: ({ error }) => <div>{error.message}</div>,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      getDatasetsPaginatedQueryOptions({ ...deps, lang: context.lang }),
    );
  },
  wrapInSuspense: true,
  pendingComponent: () => <SkeletonLoading />,
});

function RouteComponent() {
  const search = Route.useSearch();

  const { lang } = Route.useRouteContext();
  const { data } = useSuspenseQuery(
    getDatasetsPaginatedQueryOptions({ ...search, lang }),
  );

  console.log("data", data);

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
          meta={{ t, lang }}
          columns={datasetsColumns}
          data={data.data}
        />
      </div>
      <Pagination pagination={data.meta.pagination} />
    </Card>
  );
}

export const datasetsColumnHelper =
  createColumnHelper<DatasetSearchUnifiedResponse["data"][number]>();

export const datasetsColumns = [
  datasetsColumnHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => (
      <SortHeader ctx={ctx} label={ctx.table.options.meta?.t("dataset-id")} />
    ),
    cell: (ctx) => (
      <Route.Link to="$datasetId" params={{ datasetId: ctx.getValue() }}>
        <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
          {ctx.renderValue()}
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
  }),
  datasetsColumnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => {
      return <p>{ctx.table.options.meta?.t?.("type-of-data")}</p>;
    },
    cell: (ctx) =>
      ctx.getValue()[ctx.table.options.meta?.lang ?? i18n.defaultLocale],
  }),
  datasetsColumnHelper.accessor("experiments", {
    id: "experiments",
    header: "Experiments",
    cell: (ctx) => (
      <ul className="space-y-4">
        {ctx.getValue().map((e, i) => (
          <li key={i}>
            {e.header[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text}
          </li>
        ))}
      </ul>
    ),
  }),
  datasetsColumnHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
  }),
];
