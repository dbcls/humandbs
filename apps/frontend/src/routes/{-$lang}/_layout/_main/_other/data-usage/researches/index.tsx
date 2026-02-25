import { ResearchSearchBodySchema } from "@humandbs/backend/types";
import type { ResearchSearchUnifiedResponse } from "@humandbs/backend/types";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, functionalUpdate } from "@tanstack/react-router";
import {
  createColumnHelper,
  type SortingState,
  type Updater,
} from "@tanstack/react-table";
import { Search, X as XIcon } from "lucide-react";
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
import { SkeletonLoading } from "@/components/Skeleton";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
        includeFacets: true,
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
    >
      <div className="relative overflow-hidden">
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
            <Facets
              onClose={() => {
                setPanelOpen(false);
              }}
            />
          </Suspense>
        </div>
      </div>
    </Card>
  );
}

function Facets({ onClose }: { onClose: () => void }) {
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();

  const { data: searchResults, isFetching } = useQuery(
    getResearchesQueryOptions({ ...search, lang, includeFacets: true }),
  );

  const { data: allFacetsData } = useSuspenseQuery(getAllFacetsQueryOptions());

  const { filters, setFilters, resetFilters, toggleArrayFilter } = useFilters(
    Route.id,
  );

  // Optimistic local state: tracks pending checkbox changes before the URL updates.
  // Shape: { "criteria:Unrestricted-access": true, "assayType:WGS": false, ... }
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});

  const hasAnyFilter =
    filters.datasetFilters != null &&
    Object.keys(filters.datasetFilters).length > 0;

  const resetGroup = (groupKey: string) => {
    const activeValues =
      (filters.datasetFilters?.[
        groupKey as keyof typeof filters.datasetFilters
      ] as string[] | undefined) ?? [];
    const { [groupKey as keyof typeof filters.datasetFilters]: _, ...rest } =
      filters.datasetFilters ?? {};
    setFilters({
      datasetFilters: Object.keys(rest).length > 0 ? rest : undefined,
      page: 1,
    } as never);
    // Optimistically mark each value in this group as unchecked so they
    // don't flicker back to checked while the URL catches up.
    setOptimistic((prev) => ({
      ...prev,
      ...Object.fromEntries(
        activeValues.map((v) => [`${groupKey}:${v}`, false]),
      ),
    }));
  };

  if (!allFacetsData.data) return null;

  return (
    <div>
      <div className="flex items-center justify-between p-3">
        <span className="text-sm font-medium">Filters</span>
        <div className="flex items-center gap-1">
          {hasAnyFilter && (
            <Button
              variant="ghost"
              size="slim"
              className="text-xs text-muted-foreground"
              onClick={() => {
                // Optimistically mark every active value as unchecked
                const allUnchecked = Object.fromEntries(
                  Object.entries(filters.datasetFilters ?? {}).flatMap(
                    ([groupKey, vals]) =>
                      ((vals as string[] | undefined) ?? []).map((v) => [
                        `${groupKey}:${v}`,
                        false,
                      ]),
                  ),
                );
                setOptimistic(allUnchecked);
                resetFilters();
              }}
            >
              Reset all
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
      <Accordion
        type="multiple"
        className="px-3"
        defaultValue={Object.keys(filters.datasetFilters ?? {})}
      >
        {Object.entries(allFacetsData.data).map(([key, value]) => (
          <AccordionItem
            key={key}
            value={key}
            className={"border-b-primary-translucent"}
          >
            <AccordionTrigger className="text-secondary font-bold relative">
              <span>{key}</span>
              {(
                (filters.datasetFilters?.[
                  key as keyof typeof filters.datasetFilters
                ] as string[] | undefined) ?? []
              ).length > 0 && (
                <Button
                  asChild
                  variant="ghost"
                  size="slim"
                  className="absolute right-0 top-0 h-auto px-0 text-xs text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetGroup(key);
                  }}
                >
                  <div>Reset</div>
                </Button>
              )}
            </AccordionTrigger>
            <AccordionContent className="pl-5 py-1 ">
              <ul className="space-y-2">
                {value.map((val) => {
                  const optimisticKey = `${key}:${val.value}`;
                  const urlActive = (
                    (filters.datasetFilters?.[
                      key as keyof typeof filters.datasetFilters
                    ] as string[] | undefined) ?? []
                  ).includes(val.value);
                  const isChecked =
                    optimisticKey in optimistic
                      ? optimistic[optimisticKey]
                      : urlActive;

                  const count =
                    searchResults?.facets?.[key]?.find(
                      (f) => f.value === val.value,
                    )?.count ?? 0;

                  return (
                    <li key={`${key}-${val.value}`}>
                      <Label className="flex justify-between items-start">
                        <span>
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              // Update local state immediately for instant feedback
                              setOptimistic((prev) => ({
                                ...prev,
                                [optimisticKey]: !!checked,
                              }));
                              startTransition(() => {
                                toggleArrayFilter(
                                  "datasetFilters",
                                  key,
                                  val.value,
                                  !!checked,
                                );
                              });
                            }}
                          />
                          <span
                            className={cn("ml-2", { "opacity-40": isFetching })}
                          >
                            {val.value}
                          </span>
                        </span>
                        <span>{count}</span>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function CardContent() {
  const search = Route.useSearch();
  const { lang } = Route.useRouteContext();

  const { data: researchesData } = useSuspenseQuery(
    getResearchesQueryOptions({ ...search, lang, includeFacets: true }),
  );

  const sorting = useMemo(() => {
    if (!search.sort) return [];
    return [{ id: search.sort, desc: search.order === "desc" }];
  }, [search.sort, search.order]);

  const { filters, setFilters } = useFilters(Route.id);

  const handleSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const sortingState: SortingState = [
        { id: filters.sort, desc: filters.order === "desc" },
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
                {version.version}
              </span>
            </Route.Link>
          </li>
        ))}
      </ul>
    ),
  }),

  columnHelper.accessor(
    (row) => row.versions[row.versions.length - 1]?.releaseDate,
    {
      id: "releaseDate",
      header: (ctx) => <SortHeader ctx={ctx} label="Release Date" />,
      cell: (ctx) => ctx.renderValue(),
      size: 15,
    },
  ),
  columnHelper.accessor("methods", {
    id: "methods",
    header: "手法",
    cell: (ctx) => <p className="text-sm">{ctx.renderValue()}</p>,
  }),
];
