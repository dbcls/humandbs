import {
  DatasetSearchBodySchema,
  type DatasetSearchBody,
  type DatasetSearchResponse,
} from "@humandbs/backend/types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  functionalUpdate,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { zodValidator } from "@tanstack/zod-adapter";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useLocale, useTranslations } from "use-intl";

import { copyTableData, downloadCsv, downloadExcel } from "@/utils/exportTable";

import { FilterableCard } from "@/components/FilterableCard";
import { Pagination, PaginationLoadingSkeleton } from "@/components/Pagination";
import { SearchCaption } from "@/components/SearchCaption";
import { SearchPanel, type SectionConfig } from "@/components/SearchPanel";
import { SkeletonLoading } from "@/components/Skeleton";
import { SortHeader, Table, TableLoadingSpinner } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { i18n } from "@/config/i18n";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";
import { getAllFacetsQueryOptions } from "@/serverFunctions/facets";
import { buildFacetSections } from "@/utils/buildFacetSections";
import { ModalCell } from "@/components/ModalCell";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AddToCartToggle } from "@/components/AddToCartToggle";
import { useCartTableHeader, useCartTableRow } from "@/hooks/useCart";

const datasetListQuerySchema = DatasetSearchBodySchema.omit({
  lang: true,
  includeFacets: true,
}).extend({
  sort: DatasetSearchBodySchema.shape.sort.default("relevance"),
});

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/dataset/")(
  {
    component: RouteComponent,
    validateSearch: zodValidator(datasetListQuerySchema),
    errorComponent: ({ error }) => <div>{error.message}</div>,
    loader: ({ context, location }) => {
      return Promise.all([
        context.queryClient.ensureQueryData(
          getDatasetsPaginatedQueryOptions({
            ...(location.search as Omit<DatasetSearchBody, "includeFacets">),
            lang: context.lang,
          }),
        ),
        context.queryClient.ensureQueryData(getAllFacetsQueryOptions()),
      ]);
    },
    wrapInSuspense: true,
    pendingComponent: () => <SkeletonLoading />,
  },
);

function RouteComponent() {
  const t = useTranslations("Dataset");
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();
  const { filters, setFilters, resetFilters } = useFilters(Route.id);

  const { data } = useDatasetsSearchQuery();

  const exportData = useMemo(() => {
    type Row = DatasetSearchResponse["data"][number];
    const columns: { header: string; value: (row: Row) => string }[] = [
      { header: t("datasetId"), value: (row) => row.datasetId },
      { header: t("releaseDate"), value: (row) => row.releaseDate ?? "" },
      {
        header: t("typeOfData"),
        value: (row) => row.typeOfData?.[lang] ?? "",
      },
      {
        header: t("experiments"),
        value: (row) =>
          row.experiments
            .map((e) => e.header?.[lang]?.text ?? "")
            .filter(Boolean)
            .join("; "),
      },
      { header: t("criteria"), value: (row) => row.criteria ?? "" },
    ];
    return {
      headers: columns.map((c) => c.header),
      rows: (data?.data ?? []).map((row) => columns.map((c) => c.value(row))),
    };
  }, [data, lang, t]);

  const filtersCount = Object.keys(filters.filters || {}).length;
  return (
    <FilterableCard
      className="flex flex-col"
      captionSize="lg"
      caption={({ onFilterClick, isOpen, filterButtonRef }) => (
        <SearchCaption
          filterButtonRef={filterButtonRef}
          title={t("dataset-list")}
          committedQuery={search.query ?? ""}
          onQueryChange={(query) => {
            setFilters({ query });
          }}
          resultsCount={<ResultsCount />}
          filtersCount={filtersCount}
          isPanelOpen={isOpen}
          onFilterClick={onFilterClick}
          onCopy={() => copyTableData(exportData)}
          onCsv={() => downloadCsv(exportData, "dataset-list")}
          onExcel={() => downloadExcel(exportData, "dataset-list")}
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

  const { data: datasetsData } = useDatasetsSearchQuery();

  if (!datasetsData) {
    return <Skeleton className="h-9 w-24 animate-pulse" />;
  }

  return (
    <p className="text-muted-foreground text-sm">
      {t("total-results", {
        count: datasetsData?.meta.pagination.total ?? 0,
      })}
    </p>
  );
}

function FacetsAdapter({ onClose }: { onClose: () => void }) {
  const { lang } = Route.useRouteContext();

  const { filters, setFilters } = useFilters(Route.id);

  const { data: searchResults, isFetching: isDataFetching } = useQuery(
    getDatasetsPaginatedQueryOptions({
      ...filters,
      lang,
    }),
  );

  const { data: allFacetsData, isPending: isFacetsPending } = useQuery(
    getAllFacetsQueryOptions(),
  );

  const sections = useMemo((): SectionConfig[] => {
    const topLevel: SectionConfig[] = [
      { type: "text-filter", id: "humId", value: filters.humId ?? "", uiGroup: "basic-info" },
    ];

    return [
      ...topLevel,
      ...buildFacetSections(
        filters.filters ?? {},
        "filters",
        allFacetsData?.data,
      ),
    ];
  }, [filters, allFacetsData]);

  return (
    <SearchPanel
      onClose={onClose}
      isFetching={isDataFetching || isFacetsPending}
      facetCounts={searchResults?.facets}
      onSetFilters={setFilters}
      sections={sections}
    />
  );
}

function CardContent() {
  return (
    <>
      <div className="flex min-w-full flex-1 flex-col overflow-x-auto">
        <TableWrapper />
      </div>
      <PaginationWrapper />
    </>
  );
}

function useDatasetsSearchQuery() {
  const search = Route.useSearch();
  const lang = useLocale();
  const searchParams = { ...search, lang };
  const lastResolvedSearchRef = useRef<
    Omit<DatasetSearchBody, "includeFacets"> | undefined
  >(undefined);

  const query = useQuery({
    ...getDatasetsPaginatedQueryOptions(searchParams),
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
  currentSearch: Omit<DatasetSearchBody, "includeFacets">,
) {
  const transitionType = getSearchTransitionType(previousSearch, currentSearch);

  return transitionType === "sort" || transitionType === "pagination";
}

function getSearchTransitionType(
  previousSearch: unknown,
  currentSearch: Omit<DatasetSearchBody, "includeFacets">,
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

  const { filters, setFilters } = useFilters(Route.id);

  const t = useTranslations("Dataset");

  const sorting = useMemo((): SortingState => {
    if (!filters.sort) return [];
    return [{ id: filters.sort, desc: filters.order === "desc" }];
  }, [filters.sort, filters.order]);
  const activeSort = sorting[0];

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const sortingState: SortingState = [
        { id: filters.sort ?? "datasetId", desc: filters.order === "desc" },
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

  const { data, isFetching, isPlaceholderData, transitionType } =
    useDatasetsSearchQuery();

  const loadingSortColumnId =
    isFetching && isPlaceholderData && transitionType === "sort"
      ? (search.sort ?? "datasetId")
      : undefined;
  const isPaginating =
    isFetching && isPlaceholderData && transitionType === "pagination";

  if (!data || (isFetching && !isPlaceholderData)) {
    return (
      <TableLoadingSpinner
        className="min-h-full w-max min-w-full flex-1 text-sm"
        columns={datasetsColumns}
        meta={{ t, lang }}
      />
    );
  }

  return (
    <Table
      className={cn("min-h-full w-max min-w-full flex-1 text-sm")}
      onSortingChange={handleSortingChange}
      sorting={sorting}
      meta={{ t, lang, loadingSortColumnId, activeSort }}
      columns={datasetsColumns}
      data={data.data}
      isDimmed={isPaginating}
    />
  );
}

function PaginationWrapper() {
  const { data, isFetching, isPlaceholderData } = useDatasetsSearchQuery();

  if (!data || (isFetching && !isPlaceholderData)) {
    return <PaginationLoadingSkeleton />;
  }

  return <Pagination className="pr-5" pagination={data.meta.pagination} />;
}

export const datasetsColumnHelper =
  createColumnHelper<DatasetSearchResponse["data"][number]>();


export const datasetsColumns = [
  datasetsColumnHelper.display({
    id: "cart",
    header: (ctx) => {
      const { allInCart, someInCart, handleClickCart } = useCartTableHeader({
        tableDatasets: ctx.table.options.data,
      });

      return (
        <AddToCartToggle
          variant={"header"}
          state={allInCart || (someInCart ? "indeterminate" : false)}
          onClick={handleClickCart}
        />
      );
    },
    cell: (ctx) => {
      const { handleClickCart, inCart } = useCartTableRow({
        dataset: ctx.row.original,
      });

      return <AddToCartToggle state={inCart} onClick={handleClickCart} />;
    },
    maxSize: 1,
    size: 1,
  }),
  datasetsColumnHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => (
      <SortHeader ctx={ctx} label={ctx.table.options.meta?.t("datasetId")} />
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
        label={ctx.table.options.meta?.t?.("releaseDate")}
      />
    ),
  }),

  datasetsColumnHelper.accessor("versionReleaseDate", {
    id: "versionReleaseDate",
    header: (ctx) => ctx.table.options.meta?.t?.("version-release-date"),
  }),
  datasetsColumnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => {
      return <p>{ctx.table.options.meta?.t?.("typeOfData")}</p>;
    },
    cell: (ctx) =>
      ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale] ??
      "",
  }),
  datasetsColumnHelper.accessor("experiments", {
    id: "experiments",
    header: (ctx) => ctx.table.options.meta?.t("experiments"),
    cell: (ctx) => (
      <ModalCell>
        <ul className="space-y-4">
          {ctx.getValue().map((item, i) => (
            <li key={i}>
              <span>
                {
                  item.header?.[
                    ctx.table.options.meta?.lang ?? i18n.defaultLocale
                  ]?.text
                }
              </span>
            </li>
          ))}
        </ul>
      </ModalCell>
    ),
  }),
  datasetsColumnHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    //@ts-ignore TODO fix types`
    cell: (ctx) => (
      <ModalCell maxHeight={96}>
        <p className="text-sm whitespace-pre-wrap">{ctx.table.options.meta?.t(ctx.getValue())}</p>
      </ModalCell>
    ),
  }),
];
