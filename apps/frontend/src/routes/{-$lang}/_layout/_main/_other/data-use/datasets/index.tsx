import {
  DatasetSearchBodySchema,
  type DatasetSearchResponse,
} from "@humandbs/backend/types";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  functionalUpdate,
  type SortingState,
} from "@tanstack/react-table";
import { zodValidator } from "@tanstack/zod-adapter";
import { startTransition, useMemo } from "react";
import { useTranslations } from "use-intl";

import { copyTableData, downloadCsv, downloadExcel } from "@/utils/exportTable";

import { FilterableCard } from "@/components/FilterableCard";
import { Pagination } from "@/components/Pagination";
import { SearchCaption } from "@/components/SearchCaption";
import { SearchPanel, type SectionConfig } from "@/components/SearchPanel";
import { SkeletonLoading } from "@/components/Skeleton";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { i18n } from "@/config/i18n";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";
import { getAllFacetsQueryOptions } from "@/serverFunctions/facets";
import { buildFacetSections } from "@/utils/buildFacetSections";
import { CollapsiblePreview } from "@/components/CollapsiblePreview";
import { cn } from "@/lib/utils";

const datasetListQuerySchema = DatasetSearchBodySchema.omit({
  lang: true,
  includeFacets: true,
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-use/datasets/",
)({
  component: RouteComponent,
  validateSearch: zodValidator(datasetListQuerySchema),
  loaderDeps: ({ search }) => search,
  errorComponent: ({ error }) => <div>{error.message}</div>,
  loader: ({ context, deps }) => {
    context.queryClient.ensureQueryData(
      getDatasetsPaginatedQueryOptions({
        ...deps,
        sort: deps.sort ?? "datasetId",
        lang: context.lang,
      }),
    );
    context.queryClient.ensureQueryData(getAllFacetsQueryOptions());
  },
  wrapInSuspense: true,
  pendingComponent: () => <SkeletonLoading />,
});

function RouteComponent() {
  const t = useTranslations("Dataset");
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();
  const { setFilters } = useFilters(Route.id);

  const { data } = useQuery(
    getDatasetsPaginatedQueryOptions({
      ...search,
      lang,
    }),
  );

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

  return (
    <FilterableCard
      captionSize="lg"
      caption={({ onFilterClick, isOpen }) => (
        <SearchCaption
          title={t("dataset-list")}
          committedQuery={search.query ?? ""}
          onQueryChange={(query) => {
            setFilters({ query });
          }}
          isPanelOpen={isOpen}
          onFilterClick={onFilterClick}
          onCopy={() => copyTableData(exportData)}
          onCsv={() => downloadCsv(exportData, "dataset-list")}
          onExcel={() => downloadExcel(exportData, "dataset-list")}
        />
      )}
      renderPanel={({ onClose }) => <FacetsAdapter onClose={onClose} />}
      renderChildren={({ panelOpen }) => <CardContent panelOpen={panelOpen} />}
    ></FilterableCard>
  );
}

function FacetsAdapter({ onClose }: { onClose: () => void }) {
  const { lang } = Route.useRouteContext();

  const { filters, setFilters } = useFilters(Route.id);

  const { data: searchResults, isFetching } = useQuery(
    getDatasetsPaginatedQueryOptions({
      ...filters,
      lang,
    }),
  );

  const { data: allFacetsData } = useSuspenseQuery(getAllFacetsQueryOptions());

  const sections = useMemo((): SectionConfig[] => {
    const topLevel: SectionConfig[] = [
      { type: "text-filter", id: "humId", value: filters.humId ?? "" },
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
      isFetching={isFetching}
      facetCounts={searchResults?.facets}
      onSetFilters={setFilters}
      sections={sections}
    />
  );
}

function CardContent({ panelOpen }: { panelOpen: boolean }) {
  const search = Route.useSearch();

  const { lang } = Route.useRouteContext();
  const { data } = useSuspenseQuery(
    getDatasetsPaginatedQueryOptions({
      ...search,
      lang,
    }),
  );

  const { filters, setFilters } = useFilters(Route.id);

  const sortingState: SortingState = [
    { id: filters.sort ?? "datasetId", desc: filters.order === "desc" },
  ];

  const t = useTranslations("Dataset");

  return (
    <>
      <div className="overflow-x-auto min-h-">
        <Table
          className={cn("mt-4 text-sm transition-[margin]", {
            "mr-filter-panel": panelOpen,
          })}
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
    </>
  );
}

export const datasetsColumnHelper =
  createColumnHelper<DatasetSearchResponse["data"][number]>();

export const datasetsColumns = [
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
      <CollapsiblePreview
        items={ctx.getValue().map((item, i) => ({
          id: i,
          content: () => (
            <span>
              {
                item.header?.[
                  ctx.table.options.meta?.lang ?? i18n.defaultLocale
                ]?.text
              }
            </span>
          ),
        }))}
      />
    ),
  }),
  datasetsColumnHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    //@ts-ignore TODO fix types`
    cell: (ctx) => ctx.table.options.meta?.t(ctx.getValue()),
  }),
];
