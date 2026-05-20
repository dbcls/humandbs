import type {
  ResearchSearchBody,
  ResearchSearchResponse,
} from "@humandbs/backend/types";
import { useQuery } from "@tanstack/react-query";
import {
  ClientOnly,
  createFileRoute,
  functionalUpdate,
} from "@tanstack/react-router";
import {
  createColumnHelper,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { copyTableData, downloadCsv, downloadExcel } from "@/utils/exportTable";
import { useLocale, useTranslations } from "use-intl";

import { ModalCell } from "@/components/ModalCell";
import { AddToCartToggle } from "@/components/AddToCartToggle";
import { FilterableCard } from "@/components/FilterableCard";
import { Pagination, PaginationLoadingSkeleton } from "@/components/Pagination";
import { SearchCaption } from "@/components/SearchCaption";
import { SearchPanel, type SectionConfig } from "@/components/SearchPanel";
import { SortHeader, Table, TableLoadingSpinner } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { useCartTableHeader } from "@/hooks/useCart";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShoppingCartIcon } from "lucide-react";
import { getDatasetsOfResearchQueryOptions } from "@/serverFunctions/datasets";
import { getAllFacetsQueryOptions } from "@/serverFunctions/facets";
import { getResearchesQueryOptions } from "@/serverFunctions/researches";
import { buildFacetSections } from "@/utils/buildFacetSections";
import { researchesSearchParamsSchema } from "@/utils/queryParams";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/research/",
)({
  component: RouteComponent,
  validateSearch: researchesSearchParamsSchema,
  loader: ({ context, location }) => {
    return Promise.all([
      context.queryClient.ensureQueryData(
        getResearchesQueryOptions({
          ...(location.search as Omit<ResearchSearchBody, "includeFacets">),
          lang: context.lang,
        }),
      ),
      context.queryClient.ensureQueryData(getAllFacetsQueryOptions()),
    ]);
  },
});

function RouteComponent() {
  const t = useTranslations("Research");
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();
  const { setFilters, resetFilters, filters } = useFilters(Route.id);

  const { data: researchesData } = useResearchesSearchQuery();

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
          resultsCount={<ResultsCount />}
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
  const t = useTranslations("common");

  const { data: researchesData } = useResearchesSearchQuery();

  if (!researchesData) {
    return <Skeleton className="h-9 w-24 animate-pulse" />;
  }

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

  const { data: searchResults, isPending: isDataPending } = useQuery(
    getResearchesQueryOptions({ ...filters, lang }),
  );

  const { data: allFacetsData, isPending: isFacetsPending } = useQuery(
    getAllFacetsQueryOptions(),
  );

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
      isFetching={isFacetsPending || isDataPending}
      facetCounts={searchResults?.facets}
      //@ts-ignore TODO fix types
      onSetFilters={setFilters}
      sections={sections}
    />
  );
}

function CardContent() {
  return (
    <>
      <div className="flex max-h-[calc(100vh-16rem)] min-w-full flex-1 flex-col overflow-auto mt-4">
        <TableWrapper />
      </div>
      <PaginationWrapper />
    </>
  );
}

function useResearchesSearchQuery() {
  const search = Route.useSearch();
  const lang = useLocale();
  const searchParams = { ...search, lang };
  const lastResolvedSearchRef = useRef<
    Omit<ResearchSearchBody, "includeFacets"> | undefined
  >(undefined);

  const query = useQuery({
    ...getResearchesQueryOptions(searchParams),
    placeholderData: (previousData, previousQuery) => {
      const previousSearch = previousQuery
        ? (previousQuery.queryKey as readonly unknown[])[2]
        : undefined;

      return isBackgroundTransition(previousSearch, searchParams)
        ? previousData
        : undefined;
    },
  });

  const transitionType = getSearchTransitionType(
    lastResolvedSearchRef.current,
    searchParams,
  );

  useEffect(() => {
    if (!query.isFetching && query.data) {
      lastResolvedSearchRef.current = searchParams;
    }
  }, [query.isFetching, query.data, searchParams]);

  return { ...query, transitionType };
}

function isBackgroundTransition(
  previousSearch: unknown,
  currentSearch: Omit<ResearchSearchBody, "includeFacets">,
) {
  const transitionType = getSearchTransitionType(previousSearch, currentSearch);

  return transitionType === "sort" || transitionType === "pagination";
}

function getSearchTransitionType(
  previousSearch: unknown,
  currentSearch: Omit<ResearchSearchBody, "includeFacets">,
): "sort" | "pagination" | "replace" {
  if (!previousSearch || typeof previousSearch !== "object") return "replace";

  if (
    stableSerialize(omitSortParams(previousSearch)) ===
    stableSerialize(omitSortParams(currentSearch))
  ) {
    return "sort";
  }

  if (
    stableSerialize(omitPageParams(previousSearch)) ===
    stableSerialize(omitPageParams(currentSearch))
  ) {
    return "pagination";
  }

  return "replace";
}

function omitSortParams(value: unknown) {
  const {
    sort: _sort,
    order: _order,
    ...rest
  } = value as Record<string, unknown>;

  return rest;
}

function omitPageParams(value: unknown) {
  const { page: _page, ...rest } = value as Record<string, unknown>;

  return rest;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableSerialize(entryValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function TableWrapper() {
  const search = Route.useSearch();

  const lang = useLocale();

  const t = useTranslations("Research");

  const sorting = useMemo((): SortingState => {
    if (!search.sort) return [];
    return [{ id: search.sort, desc: search.order === "desc" }];
  }, [search.sort, search.order]);
  const activeSort = sorting[0];

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

  const {
    data: researchesData,
    isFetching,
    isPlaceholderData,
    transitionType,
  } = useResearchesSearchQuery();

  const loadingSortColumnId =
    isFetching && isPlaceholderData && transitionType === "sort"
      ? (search.sort ?? "humId")
      : undefined;
  const isPaginating =
    isFetching && isPlaceholderData && transitionType === "pagination";

  if (!researchesData || (isFetching && !isPlaceholderData))
    return (
      <TableLoadingSpinner
        className="min-h-full w-max min-w-full flex-1 text-sm"
        columns={columns}
        meta={{ t, lang }}
      />
    );

  return (
    <Table
      className={cn("min-h-full w-max min-w-full flex-1 text-sm")}
      columns={columns}
      data={researchesData.data}
      sorting={sorting}
      onSortingChange={handleSortingChange}
      meta={{ t, lang, loadingSortColumnId, activeSort }}
      isDimmed={isPaginating}
    />
  );
}

function PaginationWrapper() {
  const {
    data: researchesData,
    isFetching,
    isPlaceholderData,
  } = useResearchesSearchQuery();

  if (!researchesData || (isFetching && !isPlaceholderData))
    return <PaginationLoadingSkeleton />;

  return (
    <Pagination className="pr-5" pagination={researchesData.meta.pagination} />
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
        <div className="flex items-center gap-3">
          <ClientOnly fallback={<div className="size-8 shrink-0" />}>
            <AddToCartAllDatasetsButton
              humId={ctx.getValue()}
              tableDatasets={ctx.row.original.datasetIds.map((id) => ({ datasetId: id }))}
            />
          </ClientOnly>
          <Route.Link to="$humId" params={{ humId: ctx.getValue() }}>
            <TextWithIcon icon={FA_ICONS.books}>{ctx.getValue()}</TextWithIcon>
          </Route.Link>
        </div>
      );
    },
    size: 15,
  }),
  columnHelper.accessor("datasetIds", {
    id: "datasets",
    header: (ctx) => ctx.table.options.meta?.t("datasets"),
    cell: (ctx) => (
      <ModalCell>
        <ul className="space-y-4">
          {ctx.getValue().map((id) => (
            <li key={id}>
              <Route.Link to="../dataset/$datasetId" params={{ datasetId: id }}>
                <TextWithIcon icon={FA_ICONS.dataset}>{id}</TextWithIcon>
              </Route.Link>
            </li>
          ))}
        </ul>
      </ModalCell>
    ),

    size: 15,
  }),
  columnHelper.accessor("title", {
    id: "title",
    header: (ctx) => ctx.table.options.meta?.t?.("title"),
    cell: function Cell(ctx) {
      return (
        <ModalCell maxHeight={96}>
          <p className="text-sm">{ctx.renderValue()?.[ctx.table.options.meta?.lang!]}</p>
        </ModalCell>
      );
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
    cell: (ctx) => (
      <ModalCell maxHeight={96}>
        <p className="text-sm break-all whitespace-pre-wrap">{ctx.renderValue()}</p>
      </ModalCell>
    ),
  }),
  columnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => ctx.table.options.meta?.t("typeOfData"),
    cell: (ctx) => (
      <ModalCell>
        <ul className="space-y-4">
          {ctx.renderValue()?.map((item, i) => (
            <li key={i}>
              <p>{item}</p>
            </li>
          ))}
        </ul>
      </ModalCell>
    ),
  }),
  columnHelper.accessor("platforms", {
    id: "platforms",
    header: (ctx) => ctx.table.options.meta?.t("platforms"),
    cell: (ctx) => (
      <ModalCell>
        <ul className="space-y-4">
          {ctx.renderValue()?.map((item, i) => (
            <li key={i}>
              <p>{item}</p>
            </li>
          ))}
        </ul>
      </ModalCell>
    ),
  }),
  columnHelper.accessor("targets", {
    id: "targets",
    header: (ctx) => ctx.table.options.meta?.t("targets"),
    cell: (ctx) => (
      <ModalCell maxHeight={96}>
        <p className="text-sm whitespace-pre-wrap">{ctx.getValue()}</p>
      </ModalCell>
    ),
  }),
  columnHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    // @ts-ignore TODO fix types
    cell: (ctx) => (
      <ModalCell maxHeight={96}>
        <p className="text-sm whitespace-pre-wrap">{ctx.table.options.meta?.t(ctx.getValue())}</p>
      </ModalCell>
    ),
  }),
  columnHelper.accessor("dataProvider", {
    id: "dataProvider",
    header: (ctx) => ctx.table.options.meta?.t("dataProvider"),
    cell: (ctx) => (
      <ModalCell>
        <ul className="space-y-4">
          {ctx.renderValue()?.map((item, i) => (
            <li key={i}>
              <p>{item}</p>
            </li>
          ))}
        </ul>
      </ModalCell>
    ),
  }),
];

function AddToCartAllDatasetsButton({
  tableDatasets,
  humId,
}: {
  humId: string;
  tableDatasets: { datasetId: string }[];
}) {
  const t = useTranslations("common");
  const datasetsQO = getDatasetsOfResearchQueryOptions(humId);

  const { data, refetch } = useQuery(datasetsQO);

  const { allInCart, someInCart, handleClickCart } = useCartTableHeader({
    tableDatasets:
      // get actual data if exist, or just add ids (on first render) so the icon would know if its in cart or no
      data?.data || tableDatasets,
  });

  async function handleAddAllToCart() {
    await refetch();
    // data updates, so need to wait until next render, in order to `data?.data` to have values
    Promise.resolve().then(() => handleClickCart());
  }

  return (
    <Button
      variant="tableAction"
      size="icon"
      disabled={allInCart}
      onClick={handleAddAllToCart}
      className="shrink-0"
      title={!allInCart ? t("add-all-datasets-to-cart") : t("already-in-cart")}
    >
      <ShoppingCartIcon className="size-5" />
    </Button>
  );
}
