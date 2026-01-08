import {
  ResearchesQuerySchema,
  ResearchSummary,
} from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, functionalUpdate } from "@tanstack/react-router";
import {
  createColumnHelper,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import { Search } from "lucide-react";
import { startTransition, Suspense, useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Pagination } from "@/components/Pagination";
import { SkeletonLoading } from "@/components/Skeleton";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { getResearchesQueryOptions } from "@/serverFunctions/researches";

export const researchesSearchParamsSchema = ResearchesQuerySchema.omit({
  lang: true,
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/"
)({
  component: RouteComponent,
  validateSearch: researchesSearchParamsSchema,
  loaderDeps: ({ search: { page, limit, sort, order } }) => ({
    page,
    limit,
    sort,
    order,
  }),

  loader: async ({ deps, context }) => {
    await context.queryClient.ensureQueryData(
      getResearchesQueryOptions({ ...deps, lang: context.lang })
    );
  },
  errorComponent: ({ error }) => {
    return <div>{error.message}</div>;
  },
});

function Caption() {
  const t = useTranslations("Research-list");

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg">{t("research-list")}</h3>

      <div className="flex items-stretch gap-4">
        <div className="flex gap-1">
          <Button variant={"tableAction"} size={"tableAction"}>
            Copy
          </Button>
          <Button variant={"tableAction"} size={"tableAction"}>
            CSV
          </Button>
          <Button variant={"tableAction"} size={"tableAction"}>
            Excel
          </Button>
        </div>

        <Input
          type="text"
          placeholder="検索"
          beforeIcon={<Search size={22} />}
        />
      </div>
    </div>
  );
}

const columnHelper = createColumnHelper<ResearchSummary>();

const columns = [
  columnHelper.accessor("humId", {
    id: "humId",
    header: (ctx) => <SortHeader ctx={ctx} label="Research ID" />,

    cell: function Cell(ctx) {
      return (
        <div>
          <Route.Link to="$humId" params={{ humId: ctx.getValue() }}>
            <TextWithIcon
              className="text-foreground-dark"
              icon={FA_ICONS.books}
            >
              {ctx.getValue()}
            </TextWithIcon>
          </Route.Link>
          <ul>
            {ctx.row.original.datasetIds.map((dataset) => (
              <li key={dataset}>
                <Route.Link
                  className="text-secondary"
                  to="../datasets/$datasetId"
                  params={{ datasetId: dataset }}
                >
                  <TextWithIcon icon={FA_ICONS.dataset}>{dataset}</TextWithIcon>
                </Route.Link>
              </li>
            ))}
          </ul>
        </div>
      );
    },
    size: 15,
  }),
  columnHelper.accessor("title", {
    id: "title",
    header: (ctx) => <SortHeader ctx={ctx} label={"研究題目"} />,
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor("versions", {
    id: "versions",
    header: "Versions",
    size: 10,
    cell: (ctx) => (
      <ul>
        <li>
          <Route.Link
            className="text-secondary text-sm"
            to="$humId/versions"
            params={{ humId: ctx.row.original.humId }}
          >
            All versions
          </Route.Link>
        </li>
        {ctx.renderValue()?.map((version) => (
          <li key={version.version}>
            <Route.Link
              to="$humId/$version"
              className="whitespace-nowrap"
              params={{
                humId: ctx.row.original.humId,
                version: version.version,
              }}
            >
              <span className="text-sm">{version.version}</span>
              <span className="text-2xs text-foreground-light ml-2">
                {version.releaseDate}
              </span>
            </Route.Link>
          </li>
        ))}
      </ul>
    ),
  }),

  columnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: "データタイプ",
    cell: (ctx) => <p className="text-sm">{ctx.getValue()}</p>,
    maxSize: 15,
  }),
  columnHelper.accessor("methods", {
    id: "methods",
    header: "手法",
    cell: (ctx) => <p className="text-sm">{ctx.getValue()}</p>,
  }),
  columnHelper.accessor("platforms", {
    id: "platforms",
    header: "プラットホーム",
    cell: (ctx) => (
      <ul>
        {ctx.getValue().map((p) => (
          <li
            key={p}
            className="text-sm"
            dangerouslySetInnerHTML={{ __html: p }}
          />
        ))}
      </ul>
    ),
  }),
  columnHelper.accessor("targets", {
    id: "targets",
    header: "目的",
    cell: (ctx) => <span className="text-sm">{ctx.getValue()}</span>,
  }),
];
// table using Tanstack table:

function RouteComponent() {
  return (
    <Card caption={<Caption />}>
      <Suspense fallback={<SkeletonLoading />}>
        <CardContent />
      </Suspense>
    </Card>
  );
}

function CardContent() {
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();

  const { data: researchesData } = useSuspenseQuery(
    getResearchesQueryOptions({ ...search, lang })
  );

  const sorting = useMemo(() => {
    if (!search.sort) return [];
    return [{ id: search.sort, desc: search.order === "desc" }];
  }, [search.sort, search.order]);

  const { filters, setFilters } = useFilters(Route.id);

  const sortingState: SortingState = [
    { id: filters.sort, desc: filters.order === "desc" },
  ];

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newState = functionalUpdate(updater, sortingState);

      startTransition(() => {
        setFilters({
          sort: newState[0]?.id,
          order: newState[0]?.desc ? "desc" : "asc",
        });
      });
    },
    [setFilters]
  );

  return (
    <>
      <div className="overflow-x-auto">
        <Table
          className="mt-4 text-sm"
          columns={columns}
          data={researchesData.data}
          sorting={sorting}
          onSortingChange={handleSortingChange}
        />
      </div>

      <Pagination
        totalPages={researchesData.pagination.totalPages}
        page={filters.page}
        itemsPerPage={filters.limit}
      />
    </>
  );
}
