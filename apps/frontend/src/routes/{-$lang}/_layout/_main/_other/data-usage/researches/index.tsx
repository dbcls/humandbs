import { ResearchSearchBodySchema } from "@humandbs/backend/types";
import type { ResearchSearchUnifiedResponse } from "@humandbs/backend/types";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, functionalUpdate } from "@tanstack/react-router";
import {
  createColumnHelper,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { Search } from "lucide-react";
import {
  startTransition,
  Suspense,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Pagination } from "@/components/Pagination";
import { SearchPanel } from "@/components/SearchPanel";
import { SkeletonLoading } from "@/components/Skeleton";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/hooks/useFilters";
import { FA_ICONS } from "@/lib/faIcons";
import { cn } from "@/lib/utils";
import { getAllFacetsQueryOptions } from "@/serverFunctions/facets";
import { getResearchesQueryOptions } from "@/serverFunctions/researches";

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
      containerClassName="relative overflow-hidden"
    >
      <Suspense fallback={<SkeletonLoading />}>
        <CardContent />
      </Suspense>

      {/* Facets slide-in panel — overlays from the right inside the card */}
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

function FacetsAdapter({ onClose }: { onClose: () => void }) {
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();

  const { data: searchResults, isFetching } = useQuery(
    getResearchesQueryOptions({ ...search, lang }),
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
          groupKey: "datasetFilters",
          activeFilters: filters.datasetFilters ?? {},
        },
      ]}
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

function Caption({ onFilterClick }: { onFilterClick: () => void }) {
  const t = useTranslations("Research-list");

  const { setFilters } = useFilters(Route.id);

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
