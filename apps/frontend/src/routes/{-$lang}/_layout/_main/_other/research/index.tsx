import type { ResearchSearchResponse } from "@humandbs/backend/types";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, functionalUpdate } from "@tanstack/react-router";
import {
  createColumnHelper,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { startTransition, Suspense, useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";

import { copyTableData, downloadCsv, downloadExcel } from "@/utils/exportTable";

import { FilterableCard } from "@/components/FilterableCard";
import { Pagination } from "@/components/Pagination";
import { SearchCaption } from "@/components/SearchCaption";
import { SearchPanel, type SectionConfig } from "@/components/SearchPanel";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { getAllFacetsQueryOptions } from "@/serverFunctions/facets";
import { getResearchesQueryOptions } from "@/serverFunctions/researches";
import { buildFacetSections } from "@/utils/buildFacetSections";
import { researchesSearchParamsSchema } from "@/utils/queryParams";
import { CollapsiblePreview } from "@/components/CollapsiblePreview";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/research/",
)({
  component: RouteComponent,
  validateSearch: researchesSearchParamsSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(
        getResearchesQueryOptions({
          ...deps,
          lang: context.lang,
        }),
      ),

      context.queryClient.ensureQueryData(getAllFacetsQueryOptions()),
    ]);
  },
  errorComponent: ({ error }) => {
    return <div>{error.message}</div>;
  },
});

function RouteComponent() {
  const t = useTranslations("Research");
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();
  const { setFilters, resetFilters, filters } = useFilters(Route.id);

  const { data: researchesData } = useQuery(
    getResearchesQueryOptions({ ...search, lang }),
  );

  const exportData = useMemo(() => {
    type Row = ResearchSearchResponse["data"][number];
    const columns: { header: string; value: (row: Row) => string }[] = [
      { header: t("research-id"), value: (row) => row.humId },
      { header: t("datasets"), value: (row) => row.datasetIds.join(", ") },
      { header: t("title"), value: (row) => row.title[lang] ?? "" },
      {
        header: t("datePublished"),
        value: (row) =>
          `${row.versions[0]?.releaseDate ?? ""} (${row.versions[0]?.version ?? ""})`,
      },
      {
        header: t("dateModified"),
        value: (row) =>
          `${row.versions.at(-1)?.releaseDate ?? ""} (${row.versions.at(-1)?.version ?? ""})`,
      },
      { header: t("methods"), value: (row) => row.methods ?? "" },
      { header: t("typeOfData"), value: (row) => row.typeOfData.join(", ") },
      { header: t("platforms"), value: (row) => row.platforms.join(", ") },
      { header: t("targets"), value: (row) => row.targets },
      { header: t("criteria"), value: (row) => row.criteria },
      {
        header: t("dataProvider"),
        value: (row) => row.dataProvider.join(", "),
      },
    ];
    return {
      headers: columns.map((c) => c.header),
      rows: (researchesData?.data ?? []).map((row) =>
        columns.map((c) => c.value(row)),
      ),
    };
  }, [researchesData, lang, t]);

  return (
    <FilterableCard
      className="flex flex-col"
      caption={({ onFilterClick, isOpen, filterButtonRef }) => (
        <SearchCaption
          filterButtonRef={filterButtonRef}
          title={t("research-list")}
          committedQuery={search.query ?? ""}
          onQueryChange={(query) => {
            setFilters({ query });
          }}
          onResetFilters={() => {
            resetFilters();
          }}
          resultsCount={
            <Suspense
              fallback={<Skeleton className="h-9 w-24 animate-pulse" />}
            >
              <ResultsCount />
            </Suspense>
          }
          filtersCount={Object.keys(filters.datasetFilters || {}).length}
          onFilterClick={onFilterClick}
          isPanelOpen={isOpen}
          onCopy={() => copyTableData(exportData)}
          onCsv={() => downloadCsv(exportData, "research-list")}
          onExcel={() => downloadExcel(exportData, "research-list")}
        />
      )}
      renderPanel={({ onClose }) => <FacetsAdapter onClose={onClose} />}
    >
      <CardContent />
    </FilterableCard>
  );
}

function ResultsCount() {
  const { lang } = Route.useRouteContext();

  const search = Route.useSearch();

  const t = useTranslations("common");

  const { data: researchesData } = useSuspenseQuery(
    getResearchesQueryOptions({ ...search, lang }),
  );

  return (
    <p className="text-muted-foreground text-sm">
      {t("total-results", {
        count: researchesData?.meta.pagination.total ?? 0,
      })}
    </p>
  );
}

function FacetsAdapter({ onClose }: { onClose: () => void }) {
  const { lang } = Route.useRouteContext();

  const { filters, setFilters } = useFilters(Route.id);

  const { data: searchResults, isFetching } = useQuery(
    getResearchesQueryOptions({ ...filters, lang }),
  );

  const { data: allFacetsData } = useSuspenseQuery(getAllFacetsQueryOptions());

  const sections = useMemo((): SectionConfig[] => {
    const topLevel: SectionConfig[] = [
      {
        type: "date-range-filter",
        id: "datePublished",
        value: filters.datePublished ?? {},
        uiGroup: "dates",
      },
      {
        type: "date-range-filter",
        id: "dateModified",
        value: filters.dateModified ?? {},
        uiGroup: "dates",
      },
    ];

    return [
      ...topLevel,
      ...buildFacetSections(
        filters.datasetFilters ?? {},
        "datasetFilters",
        allFacetsData?.data,
      ),
    ];
  }, [filters, allFacetsData]);

  return (
    <SearchPanel
      onClose={onClose}
      isFetching={isFetching}
      facetCounts={searchResults?.facets}
      //@ts-ignore TODO fix types
      onSetFilters={setFilters}
      sections={sections}
    />
  );
}

function CardContent() {
  const { lang } = Route.useRouteContext();

  const search = Route.useSearch();

  const t = useTranslations("Research");

  const { data: researchesData } = useSuspenseQuery(
    getResearchesQueryOptions({ ...search, lang }),
  );

  const sorting = useMemo((): SortingState => {
    if (!search.sort) return [];
    return [{ id: search.sort, desc: search.order === "desc" }];
  }, [search.sort, search.order]);

  const { filters, setFilters } = useFilters(Route.id);

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const sortingState: SortingState = [
        { id: filters.sort ?? "humId", desc: filters.order === "desc" },
      ];
      const newState = functionalUpdate(updater, sortingState);

      startTransition(() => {
        setFilters({
          sort: newState[0]?.id,
          order: newState[0]?.desc ? "desc" : "asc",
        });
      });
    },
    [setFilters, filters],
  );

  return (
    <>
      <div className="flex max-h-[calc(100vh-16rem)] min-w-full flex-1 flex-col overflow-auto">
        <Table
          className={cn("mt-4 min-h-full w-max min-w-full flex-1 text-sm")}
          columns={columns}
          data={researchesData.data}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          meta={{ t, lang }}
        />
      </div>
      <Pagination
        className="pr-5"
        pagination={researchesData.meta.pagination}
      />
    </>
  );
}

const columnHelper =
  createColumnHelper<ResearchSearchResponse["data"][number]>();

const columns = [
  columnHelper.accessor("humId", {
    id: "humId",
    header: (ctx) => (
      <SortHeader ctx={ctx} label={ctx.table.options.meta?.t("research-id")} />
    ),

    cell: function Cell(ctx) {
      return (
        <Route.Link to="$humId" params={{ humId: ctx.getValue() }}>
          <TextWithIcon icon={FA_ICONS.books}>{ctx.getValue()}</TextWithIcon>
        </Route.Link>
      );
    },
    size: 15,
  }),
  columnHelper.accessor("datasetIds", {
    id: "datasets",
    header: (ctx) => ctx.table.options.meta?.t("datasets"),
    cell: (ctx) => {
      return (
        <CollapsiblePreview
          items={ctx.row.original.datasetIds.map((id) => ({
            id,
            content: (
              <Route.Link to="../dataset/$datasetId" params={{ datasetId: id }}>
                <TextWithIcon icon={FA_ICONS.dataset}>{id}</TextWithIcon>
              </Route.Link>
            ),
          }))}
        />
      );
    },
    size: 15,
  }),
  columnHelper.accessor("title", {
    id: "title",
    header: (ctx) => ctx.table.options.meta?.t?.("title"),
    cell: function Cell(ctx) {
      return ctx.renderValue()?.[ctx.table.options.meta?.lang!];
    },
  }),
  columnHelper.accessor((row) => row.versions[0], {
    id: "datePublished",
    header: (ctx) => (
      <SortHeader
        ctx={ctx}
        label={ctx.table.options.meta?.t?.("datePublished")}
      />
    ),
    minSize: 0,
    maxSize: 14,
    cell: (ctx) => (
      <div>
        <span>{ctx.getValue().releaseDate}</span>

        <Route.Link
          to="$humId/$version"
          className="ml-2 inline-block whitespace-nowrap"
          params={{
            humId: ctx.row.original.humId,
            version: ctx.getValue().version,
          }}
        >
          <span className="text-sm">({ctx.getValue().version})</span>
        </Route.Link>
      </div>
    ),
  }),

  columnHelper.accessor((row) => row.versions[row.versions.length - 1], {
    id: "dateModified",
    header: (ctx) => (
      <SortHeader
        ctx={ctx}
        label={ctx.table.options.meta?.t?.("dateModified")}
      />
    ),
    minSize: 0,
    maxSize: 14,
    cell: (ctx) => (
      <div>
        <span>{ctx.getValue().releaseDate}</span>

        <Route.Link
          to="$humId/$version"
          className="ml-2 inline-block whitespace-nowrap"
          params={{
            humId: ctx.row.original.humId,
            version: ctx.getValue().version,
          }}
        >
          <span className="text-sm">({ctx.getValue().version})</span>
        </Route.Link>
      </div>
    ),
  }),
  columnHelper.accessor("methods", {
    id: "methods",
    header: (ctx) => ctx.table.options.meta?.t("methods"),
    cell: (ctx) => <p className="text-sm break-all">{ctx.renderValue()}</p>,
  }),
  columnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => ctx.table.options.meta?.t("typeOfData"),
    cell: (ctx) => (
      <CollapsiblePreview
        items={ctx
          .renderValue()
          ?.map((item, i) => ({ id: i, content: <p>{item}</p> }))}
      />
    ),
  }),
  columnHelper.accessor("platforms", {
    id: "platforms",
    header: (ctx) => ctx.table.options.meta?.t("platforms"),
    cell: (ctx) => (
      <CollapsiblePreview
        items={ctx
          .renderValue()
          ?.map((item, i) => ({ id: i, content: <p>{item}</p> }))}
      />
    ),
  }),
  columnHelper.accessor("targets", {
    id: "targets",
    header: (ctx) => ctx.table.options.meta?.t("targets"),
  }),
  columnHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    // @ts-ignore TODO fix types
    cell: (ctx) => ctx.table.options.meta?.t(ctx.getValue()),
  }),
  columnHelper.accessor("dataProvider", {
    id: "dataProvider",
    header: (ctx) => ctx.table.options.meta?.t("dataProvider"),
    cell: (ctx) => (
      <CollapsiblePreview
        items={ctx
          .renderValue()
          ?.map((item, i) => ({ id: i, content: <p>{item}</p> }))}
      />
    ),
  }),
];
