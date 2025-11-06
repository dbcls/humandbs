import { createFileRoute } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp, Search } from "lucide-react";

import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { SkeletonLoading } from "@/components/Skeleton";
import { Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { FA_ICONS } from "@/lib/faIcons";
import { getResearchesQueryOptions } from "@/serverFunctions/researches";
import {
  ResearchesQuerySchema,
  ResearchSummary,
} from "@humandbs/backend/types";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";

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
          // onKeyDown={(e) => {
          //   if (e.key === "Enter") {
          //     // Handle search logic here
          //     navigate({
          //       search: { filter: (e.target as HTMLInputElement).value },
          //     });
          //   }
          // }}
        />
      </div>
    </div>
  );
}

const columnHelper = createColumnHelper<ResearchSummary>();

const columns = [
  columnHelper.accessor("humId", {
    id: "humId",
    header: (ctx) => {
      const sortDirection = ctx.column.getIsSorted();
      const sortIcon =
        sortDirection === "desc" ? (
          <ChevronDown size={18} />
        ) : sortDirection === "asc" ? (
          <ChevronUp size={18} />
        ) : (
          <ChevronsUpDown size={18} />
        );

      return (
        <div className="flex items-center whitespace-nowrap">
          <div>Research ID </div>
          <Button
            onClick={ctx.column.getToggleSortingHandler()}
            variant={"plain"}
            className="p-0"
          >
            {sortIcon}
          </Button>
        </div>
      );
    },
    cell: function Cell(ctx) {
      const researchIdWithVer = ctx.getValue();
      const researchId = researchIdWithVer.split(".")[0];
      const researchVer = researchIdWithVer.split(".")[1];
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
                <TextWithIcon
                  className="text-secondary"
                  icon={FA_ICONS.dataset}
                >
                  {dataset}
                </TextWithIcon>
              </li>
            ))}
          </ul>
        </div>
      );
    },
    sortingFn: "alphanumeric",
  }),
  columnHelper.accessor("title", {
    id: "title",
    header: "研究題目",
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor("versions", {
    id: "versions",
    header: "Versions",
    cell: (ctx) =>
      ctx.renderValue()?.map((version) => (
        <span className="flex gap-2" key={version.version}>
          <span>{version.version}:</span>
          <span>{version.releaseDate.replaceAll(/-/g, "/")}</span>
        </span>
      )),
  }),

  columnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: "データタイプ",
    cell: (ctx) => <p className="text-sm">{ctx.getValue()}</p>,
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
  const navigate = Route.useNavigate();

  const { data: researchesData } = useSuspenseQuery(
    getResearchesQueryOptions({ ...search, lang })
  );

  const sorting = useMemo(() => {
    if (!search.sort) return [];
    return [{ id: search.sort, desc: search.order === "desc" }];
  }, [search.sort, search.order]);

  const handleSortingChange = useCallback(
    (updater: any) => {
      const newSorting =
        typeof updater === "function" ? updater(sorting) : updater;

      if (newSorting.length === 0) {
        // Clear sorting
        navigate({
          search: (prev) => ({
            ...prev,
            sort: "humId",
            order: "asc",
            page: 1,
          }),
        });
      } else {
        const { id, desc } = newSorting[0];
        navigate({
          search: (prev) => ({
            ...prev,
            sort: id,
            order: desc ? "desc" : "asc",
            page: 1,
          }),
        });
      }
    },
    [navigate, sorting]
  );

  return (
    <>
      <Table
        className="mt-4"
        columns={columns}
        data={researchesData.data}
        sorting={sorting}
        onSortingChange={handleSortingChange}
      />
      <Pagination
        totalPages={researchesData.pagination.totalPages}
        page={researchesData.pagination.page}
      />
    </>
  );
}

function Pagination({
  totalPages,
  page,
}: {
  totalPages: number;
  page: number;
}) {
  const navigate = Route.useNavigate();

  return (
    <div className="mt-4 flex justify-center gap-5">
      <button
        className="btn btn-sm btn-outline"
        onClick={() =>
          navigate({ search: (prev) => ({ page: prev.page - 1 }) })
        }
        disabled={page === 1}
      >
        Previous
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button
        className="btn btn-sm btn-outline"
        onClick={() =>
          navigate({ search: (prev) => ({ page: prev.page + 1 }) })
        }
        disabled={page === totalPages}
      >
        Next
      </button>
    </div>
  );
}
