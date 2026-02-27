import { ResearchSearchBodySchema } from "@humandbs/backend/types";
import type { ResearchSearchUnifiedResponse } from "@humandbs/backend/types";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, functionalUpdate } from "@tanstack/react-router";
import {
  createColumnHelper,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { startTransition, useCallback, useMemo } from "react";
import { useTranslations } from "use-intl";

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

export const researchesSearchParamsSchema = ResearchSearchBodySchema.omit({
  lang: true,
  includeFacets: true,
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/",
)({
  component: RouteComponent,
  validateSearch: researchesSearchParamsSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) => {
    context.queryClient.ensureQueryData(
      getResearchesQueryOptions({
        ...deps,
        lang: context.lang,
      }),
    );

    context.queryClient.ensureQueryData(getAllFacetsQueryOptions());
  },
  errorComponent: ({ error }) => {
    return <div>{error.message}</div>;
  },
});

function RouteComponent() {
  const t = useTranslations("Research-list");
  const search = Route.useSearch();
  const { setFilters } = useFilters(Route.id);

  return (
    <FilterableCard
      caption={({ onFilterClick }) => (
        <SearchCaption
          title={t("research-list")}
          committedQuery={search.query ?? ""}
          onQueryChange={(query) => setFilters({ query })}
          onFilterClick={onFilterClick}
        />
      )}
      renderPanel={({ onClose }) => <FacetsAdapter onClose={onClose} />}
    >
      <CardContent />
    </FilterableCard>
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
      },
      {
        type: "date-range-filter",
        id: "dateModified",
        value: filters.dateModified ?? {},
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
      onSetFilters={setFilters}
      sections={sections}
    />
  );
}

function CardContent() {
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();

  const t = useTranslations("Research-list");

  const { data: researchesData } = useSuspenseQuery(
    getResearchesQueryOptions({ ...search, lang }),
  );

  const sorting = useMemo(() => {
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
      <div className="overflow-x-auto">
        <Table
          className="mt-4 text-sm"
          columns={columns}
          data={researchesData.data}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          meta={{ t, lang }}
        />
      </div>

      <Pagination pagination={researchesData.meta.pagination} />
    </>
  );
}

const columnHelper =
  createColumnHelper<ResearchSearchUnifiedResponse["data"][number]>();

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
        </div>
      );
    },
    size: 15,
  }),
  columnHelper.accessor("datasetIds", {
    id: "datasets",
    header: "Datasets",
    cell: (ctx) => {
      return (
        <ul>
          {ctx.row.original.datasetIds.map((datasetId) => (
            <li key={datasetId}>
              <Route.Link
                className="text-secondary"
                to="../datasets/$datasetId"
                params={{ datasetId }}
              >
                <TextWithIcon icon={FA_ICONS.dataset}>{datasetId}</TextWithIcon>
              </Route.Link>
            </li>
          ))}
        </ul>
      );
    },
    size: 15,
  }),
  columnHelper.accessor("title", {
    id: "title",
    header: (ctx) => <SortHeader ctx={ctx} label={"研究題目"} />,
    cell: (ctx) => ctx.getValue(),
  }),
  columnHelper.accessor((row) => row.versions[0], {
    id: "datePublished",
    header: (ctx) => <SortHeader ctx={ctx} label="Date published" />,
    size: 10,
    cell: (ctx) => (
      <div>
        <span>{ctx.getValue().releaseDate}</span>

        <Route.Link
          to="$humId/$version"
          className="whitespace-nowrap inline-block ml-2"
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
    header: (ctx) => <SortHeader ctx={ctx} label="Date Modified" />,
    cell: (ctx) => (
      <div>
        <span>{ctx.getValue().releaseDate}</span>

        <Route.Link
          to="$humId/$version"
          className="whitespace-nowrap inline-block ml-2"
          params={{
            humId: ctx.row.original.humId,
            version: ctx.getValue().version,
          }}
        >
          <span className="text-sm">({ctx.getValue().version})</span>
        </Route.Link>
      </div>
    ),
    size: 15,
  }),
  columnHelper.accessor("methods", {
    id: "methods",
    header: "手法",
    cell: (ctx) => <p className="text-sm">{ctx.renderValue()}</p>,
  }),
];
