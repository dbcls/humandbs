import { Card } from "@/components/Card";
import { Pagination } from "@/components/Pagination";
import { SkeletonLoading } from "@/components/Skeleton";
import { Table } from "@/components/Table";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";
import { Dataset, DatasetsQuerySchema } from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { useTranslations } from "use-intl";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets/"
)({
  component: RouteComponent,
  validateSearch: DatasetsQuerySchema,
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
    context.queryClient.ensureQueryData(
      getDatasetsPaginatedQueryOptions({ ...deps, lang: context.lang })
    );

    return {
      // data: datasets.data,
      // pagination: datasets.pagination,
      crumbs: context.messages.Navbar["dataset-list"],
    };
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

  const t = useTranslations("Dataset-list");

  return (
    <Card caption={t("dataset-list")} captionSize={"lg"}>
      <Table meta={{ t }} columns={datasetsColumns} data={data.data}></Table>
      <Pagination
        totalPages={data.pagination.totalPages}
        page={data.pagination.page}
      />
    </Card>
  );
}

const datasetsColumnHelper = createColumnHelper<Dataset>();

const datasetsColumns = [
  datasetsColumnHelper.accessor("datasetId", {
    id: "id",
    header: (ctx) => <p>{ctx.table.options.meta?.t?.("dataset-id")}</p>,
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
    header: (ctx) => {
      return <p>{ctx.table.options.meta?.t?.("release-date")}</p>;
    },
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
