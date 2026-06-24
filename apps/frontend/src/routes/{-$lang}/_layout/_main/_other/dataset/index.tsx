import { useQuery } from "@tanstack/react-query";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { zodValidator } from "@tanstack/zod-adapter";
import { useLocale, useTranslations } from "use-intl";

import { startTransition, useEffect, useMemo, useRef } from "react";

import type { DatasetSearchBody, DatasetSearchResponse } from "@humandbs/backend/types";

import { AccessCriteriaLabel } from "@/components/AccessCriteriaLabel";
import { AddToCartToggle } from "@/components/AddToCartToggle";
import { DatasetCartRowButton } from "@/components/DatasetCartRowButton";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { FilterableCard } from "@/components/FilterableCard";
import { ModalCell } from "@/components/ModalCell";
import { Pagination, PaginationLoadingSkeleton } from "@/components/Pagination";
import { SearchCaption } from "@/components/SearchCaption";
import type { SectionConfig } from "@/components/SearchPanel";
import { SearchPanel } from "@/components/SearchPanel";
import { SkeletonLoading } from "@/components/Skeleton";
import { SortDropdown } from "@/components/SortDropdown";
import { Table, TableLoadingSpinner } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Skeleton } from "@/components/ui/skeleton";
import { i18n } from "@/config/i18n";
import { useCartTableHeader } from "@/hooks/useCart";
import { useFilters } from "@/hooks/useFilters";
import { useMaxHeight } from "@/hooks/useMaxHeight";
import { FA_ICONS } from "@/lib/faIcons";
import { cn } from "@/lib/utils";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";
import { getAllFacetsQueryOptions } from "@/serverFunctions/facets";
import { buildFacetSections } from "@/utils/build-facet-sections";
import { copyTableData, downloadCsv, downloadExcel } from "@/utils/export-table";
import { isCancelledError } from "@/utils/is-cancelled-error";
import { datasetListQuerySchema } from "@/utils/query-params";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/dataset/")({
  component: RouteComponent,
  validateSearch: zodValidator(datasetListQuerySchema),
  errorComponent: (props) =>
    isCancelledError(props.error) ? null : <DefaultCatchBoundary {...props} />,
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
});

function RouteComponent() {
  const t = useTranslations("Dataset");
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();
  const { filters, setFilters } = useFilters(Route.id);

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
          sortControl={<DatasetSortSelect />}
          onCopy={() => {
            copyTableData(exportData);
          }}
          onCsv={() => {
            downloadCsv(exportData, "dataset-list");
          }}
          onExcel={() => {
            downloadExcel(exportData, "dataset-list");
          }}
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

  const { data: allFacetsData, isPending: isFacetsPending } = useQuery(getAllFacetsQueryOptions());

  const sections = useMemo((): SectionConfig[] => {
    const topLevel: SectionConfig[] = [
      {
        type: "text-filter",
        id: "humId",
        value: filters.humId ?? "",
        uiGroup: "basic-info",
      },
    ];
    const facetSections = buildFacetSections(filters.filters ?? {}, "filters", allFacetsData?.data);
    const dateSections = facetSections.filter((section) => section.uiGroup === "dates");
    const remainingFacetSections = facetSections.filter((section) => section.uiGroup !== "dates");

    return [...dateSections, ...topLevel, ...remainingFacetSections];
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
  const t = useTranslations("Dataset");
  const { containerRef, maxHeight } = useMaxHeight(130);

  return (
    <>
      <p className="text-muted-foreground mb-2 text-sm">{t("cart-note")}</p>
      <div
        ref={containerRef}
        style={{ maxHeight }}
        className="flex min-w-full flex-1 flex-col overflow-auto"
      >
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
  const lastResolvedSearchRef = useRef<Omit<DatasetSearchBody, "includeFacets"> | undefined>(
    undefined,
  );

  const query = useQuery({
    ...getDatasetsPaginatedQueryOptions(searchParams),
    placeholderData: (previousData, previousQuery) => {
      const previousSearch = previousQuery
        ? (previousQuery.queryKey as readonly unknown[])[2]
        : undefined;

      return isBackgroundTransition(previousSearch, searchParams) ? previousData : undefined;
    },
  });

  const transitionType = getSearchTransitionType(lastResolvedSearchRef.current, searchParams);

  useEffect(() => {
    if (!query.isFetching && query.data) {
      lastResolvedSearchRef.current = { ...search, lang };
    }
  }, [query.isFetching, query.data, search, lang]);

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
  const { sort: _sort, order: _order, ...rest } = value as Record<string, unknown>;

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
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

const DATASET_SORT_OPTIONS = [
  { sort: "datasetId", order: "asc" },
  { sort: "datasetId", order: "desc" },
  { sort: "releaseDate", order: "desc" },
  { sort: "releaseDate", order: "asc" },
] as const;

function DatasetSortSelect() {
  const t = useTranslations("common");
  const tD = useTranslations("Dataset");
  const { filters, setFilters } = useFilters(Route.id);

  const fieldLabels: Record<string, string> = {
    datasetId: tD("datasetId"),
    releaseDate: tD("releaseDate"),
  };

  const currentSort = filters.sort ?? "datasetId";
  const currentOrder = filters.order ?? "asc";
  // const value = `${currentSort}:${currentOrder}`;

  const sortOptions = DATASET_SORT_OPTIONS.map(({ sort, order }) => ({
    label: t("sort-by", {
      field: fieldLabels[sort],
    }),
    value: `${sort}:${order}`,
    order,
  }));

  return (
    <SortDropdown
      options={sortOptions}
      value={`${currentSort}:${currentOrder}`}
      onSelect={(newSort) => {
        startTransition(() => {
          setFilters(newSort);
        });
      }}
    />
  );
}

function TableWrapper() {
  const lang = useLocale();
  const t = useTranslations("Dataset");

  const { data, isFetching, isPlaceholderData, transitionType } = useDatasetsSearchQuery();

  const isPaginating = isFetching && isPlaceholderData && transitionType === "pagination";

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
      meta={{ t, lang }}
      columns={datasetsColumns}
      data={data.data}
      isDimmed={isPaginating}
      stickyColumnCount={2}
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

export const datasetsColumnHelper = createColumnHelper<DatasetSearchResponse["data"][number]>();

export const datasetsColumns = [
  datasetsColumnHelper.display({
    id: "cart",
    header: (ctx) => (
      <div className="flex w-full items-center justify-center">
        <ClientOnly fallback={<span className="inline-block w-9" aria-hidden="true" />}>
          <DatasetsCartHeaderButton tableDatasets={ctx.table.options.data} />
        </ClientOnly>
      </div>
    ),
    cell: (ctx) => (
      <div className="flex w-full items-center justify-center">
        <ClientOnly fallback={<span className="inline-block w-9" aria-hidden="true" />}>
          <DatasetCartRowButton dataset={ctx.row.original} />
        </ClientOnly>
      </div>
    ),
    maxSize: 1,
    size: 1,
  }),
  datasetsColumnHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => ctx.table.options.meta?.t("datasetId"),
    cell: (ctx) => (
      <Route.Link to="$datasetId" params={{ datasetId: ctx.getValue() }}>
        <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
          {ctx.renderValue()}
        </TextWithIcon>
      </Route.Link>
    ),
    maxSize: 10,
  }),

  datasetsColumnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => {
      return <p>{ctx.table.options.meta?.t?.("typeOfData")}</p>;
    },
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale] ?? "",
  }),
  datasetsColumnHelper.accessor("experiments", {
    id: "experiments",
    header: (ctx) => ctx.table.options.meta?.t("experiments"),
    cell: (ctx) => (
      <ModalCell>
        <ul className="space-y-4">
          {ctx.getValue().map((item) => (
            <li key={`${item.header.ja?.text}-${item.header.en?.text}`}>
              <span>{item.header?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text}</span>
            </li>
          ))}
        </ul>
      </ModalCell>
    ),
  }),
  datasetsColumnHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    cell: (ctx) => <AccessCriteriaLabel criteria={ctx.getValue()} />,
  }),
  datasetsColumnHelper.accessor("releaseDate", {
    id: "releaseDate",
    header: (ctx) => ctx.table.options.meta?.t?.("releaseDate"),
  }),

  datasetsColumnHelper.accessor("versionReleaseDate", {
    id: "versionReleaseDate",
    header: (ctx) => ctx.table.options.meta?.t?.("version-release-date"),
  }),
];

function DatasetsCartHeaderButton({
  tableDatasets,
}: {
  tableDatasets: DatasetSearchResponse["data"];
}) {
  const t = useTranslations("common");
  const { allInCart, someInCart, handleToggleDatasets } = useCartTableHeader({
    tableDatasets,
  });

  return (
    <AddToCartToggle
      variant={"header"}
      state={allInCart || (someInCart ? "indeterminate" : false)}
      onClick={handleToggleDatasets}
      aria-label={allInCart ? t("already-in-cart") : t("add-all-to-cart")}
    />
  );
}
