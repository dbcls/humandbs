import {
  DatasetSearchBodySchema,
  type DatasetSearchUnifiedResponse,
} from "@humandbs/backend/types";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  functionalUpdate,
  type SortingState,
} from "@tanstack/react-table";
import { zodValidator } from "@tanstack/zod-adapter";
import { Search } from "lucide-react";
import { startTransition, Suspense, useState } from "react";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Pagination } from "@/components/Pagination";
import { SearchPanel } from "@/components/SearchPanel";
import { SkeletonLoading } from "@/components/Skeleton";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { i18n } from "@/config/i18n";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { cn } from "@/lib/utils";
import { getDatasetsPaginatedQueryOptions } from "@/serverFunctions/datasets";
import { getAllFacetsQueryOptions } from "@/serverFunctions/facets";

const datasetListQuerySchema = DatasetSearchBodySchema.omit({
  lang: true,
  includeFacets: true,
});

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets/",
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
        includeFacets: true,
      }),
    );
    context.queryClient.ensureQueryData(getAllFacetsQueryOptions());
  },
  wrapInSuspense: true,
  pendingComponent: () => <SkeletonLoading />,
});

function RouteComponent() {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <Card
      caption={
        <Caption
          onFilterClick={() => {
            setPanelOpen((v) => !v);
          }}
        />
      }
      captionSize={"lg"}
      containerClassName="relative overflow-hidden"
    >
      <Suspense fallback={<SkeletonLoading />}>
        <CardContent />
      </Suspense>
      <div
        className={cn(
          "absolute inset-y-0 right-0 z-10 w-80 overflow-y-auto border-l border-l-primary-translucent bg-white shadow-lg",
          "transition-transform duration-300 ease-in-out",
          panelOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <Suspense>
          <FacetsAdapter
            onClose={() => {
              setPanelOpen(false);
            }}
          />
        </Suspense>
      </div>
    </Card>
  );
}

function Caption({ onFilterClick }: { onFilterClick: () => void }) {
  const t = useTranslations("Dataset-list");

  const { setFilters } = useFilters(Route.id);

  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg">{t("dataset-list")}</h3>

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
          <Button
            variant={"tableAction"}
            size={"tableAction"}
            onClick={onFilterClick}
          >
            Filters
          </Button>
        </div>

        <Input
          type="text"
          placeholder="検索"
          beforeIcon={<Search size={22} />}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const target = e.target as HTMLInputElement;
              const value = target.value;

              startTransition(() => {
                setFilters({ q: value || undefined });
              });
            }
          }}
        />
      </div>
    </div>
  );
}

function FacetsAdapter({ onClose }: { onClose: () => void }) {
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();

  const { data: searchResults, isFetching } = useQuery(
    getDatasetsPaginatedQueryOptions({
      ...search,

      lang,
      includeFacets: true,
    }),
  );

  const { filters, setFilters, toggleArrayFilter } = useFilters(Route.id);

  return (
    <SearchPanel
      onClose={onClose}
      isFetching={isFetching}
      facetCounts={searchResults?.facets}
      onSetFilters={setFilters}
      onToggleArrayFilter={toggleArrayFilter}
      sections={[
        {
          type: "checkbox-facets",
          groupKey: "filters",
          activeFilters: filters.filters ?? {},
        },
      ]}
    />
  );
}

function CardContent() {
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

  const t = useTranslations("Dataset-list");

  return (
    <>
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
    </>
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
