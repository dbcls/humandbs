import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";

import { Suspense, useEffect, useRef } from "react";

import type { ResearchSearchResponse, ResearchSummary } from "@humandbs/backend/types";
import { ResearchStatusSchema } from "@humandbs/backend/types";

import { AddNewButton } from "@/components/AddNewButton";
import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { FilterSearchInput } from "@/components/FilterSearchInput";
import { ListItem } from "@/components/ListItem";
import { SkeletonLoadingPanelItems } from "@/components/Skeleton";
import { StatusTag } from "@/components/StatusTag";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Locale } from "@/config/i18n";
import { useCan } from "@/hooks/useCan";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";
import {
  $deleteResearch,
  getAuthedResearchesInfiniteQueryOptions,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";

import { AdminListItem } from "../../-components/AdminListItem";
import { NoItemsMessage } from "../../-components/NoItemsMessage";
import { createDummyResearch, DUMMY_HUM_ID, isDummyResearch } from "./utils/dummyResearch";

type ResearchesInfiniteData = {
  pages: Array<{ data: ResearchSummary[] }>;
  pageParams: unknown[];
};

export function ResearchesList({
  lang,
  selectedHumId,
  onSelectResearch,
}: {
  lang: Locale;
  selectedHumId: string | null;
  onSelectResearch: (humId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { openConfirmation } = useConfirmationStore();
  const { can: canCreate } = useCan({
    resource: "researches",
    action: "create",
  });
  const { can: canDelete } = useCan({
    resource: "researches",
    action: "delete",
  });

  const { filters } = useFilters("/{-$lang}/_layout/_authed/admin/researches/");

  const hasDummy =
    (selectedHumId ? isDummyResearch(selectedHumId) : false) ||
    queryClient
      .getQueriesData<ResearchesInfiniteData>({
        queryKey: ["researches", "list", "infinite"],
      })
      .some(([, data]) => data?.pages.some((page) => page.data.some(hasDummyResearch)));

  function handleAddNew() {
    const dummy = createDummyResearch(lang);
    const updatedLists = queryClient.setQueriesData<ResearchesInfiniteData>(
      { queryKey: ["researches", "list", "infinite"] },
      (old) => {
        if (!old) return old;
        if (old.pages.some((page) => page.data.some((r) => hasDummyResearch(r)))) {
          return old;
        }
        return {
          ...old,
          pages: old.pages.map((page, i) =>
            i === 0 ? { ...page, data: [dummy, ...page.data] } : page,
          ),
        };
      },
    );
    if (updatedLists.length === 0) return;
    onSelectResearch(DUMMY_HUM_ID);
  }

  // Delete mutation with optimistic update
  const { mutate: deleteResearch } = useMutation({
    mutationFn: async (humId: string) => {
      const result = await $deleteResearch({ data: { humId } });
      if (!result.ok && result.code !== "NOT_FOUND") {
        throw new Error(result.error);
      }
    },
    onMutate: async (humId) => {
      await queryClient.cancelQueries({ queryKey: ["researches", "list"] });

      const previousLists = queryClient.getQueriesData<unknown>({
        queryKey: ["researches", "list"],
      });

      queryClient.setQueriesData<ResearchSearchResponse | ResearchesInfiniteData>(
        { queryKey: ["researches", "list"] },
        (oldData) => {
          if (!oldData) return oldData;

          if ("pages" in oldData) {
            return {
              ...oldData,
              pages: oldData.pages.map((page) => ({
                ...page,
                data: page.data.filter((research) => research.humId !== humId),
              })),
            };
          }

          return {
            ...oldData,
            data: oldData.data.filter((research) => research.humId !== humId),
          };
        },
      );

      return { previousLists };
    },
    onError: (_error, _humId, context) => {
      context?.previousLists.forEach(([queryKey, previousData]) => {
        queryClient.setQueryData(queryKey, previousData);
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
    },
  });

  function handleDelete(humId: string) {
    openConfirmation({
      title: "Delete Research",
      description: `Are you really want to delete research \`${humId}\` ?`,
      actionLabel: "Delete",
      onAction: () => {
        deleteResearch(humId);
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-col gap-3">
        <ResearchFilters />

        {canCreate && <AddNewButton disabled={hasDummy} onClick={handleAddNew} />}
      </div>

      <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
        <ErrorResetBoundary getResetKey={() => JSON.stringify(filters)}>
          <Suspense fallback={<SkeletonLoadingPanelItems />}>
            <ListItems
              lang={lang}
              selectedHumId={selectedHumId}
              onSelectResearch={onSelectResearch}
              onDeleteResearch={handleDelete}
              canDelete={canDelete}
            />
          </Suspense>
        </ErrorResetBoundary>
      </div>
    </div>
  );
}

function ListItems({
  lang,
  selectedHumId,
  onSelectResearch,
  onDeleteResearch,
  canDelete,
}: {
  lang: Locale;
  selectedHumId: string | null;
  onSelectResearch: (humId: string) => void;
  onDeleteResearch: (humId: string) => void;
  canDelete: boolean;
}) {
  const { filters } = useFilters("/{-$lang}/_layout/_authed/admin/researches/");

  const infiniteOpts = getAuthedResearchesInfiniteQueryOptions({
    lang,
    ...filters,
  });

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } =
    useSuspenseInfiniteQuery(infiniteOpts);

  const allResearches = data.pages.flatMap((page) => page.data);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (allResearches.length === 0) {
    return <NoItemsMessage>No researches found</NoItemsMessage>;
  }

  return (
    <>
      <div
        className={cn(
          "h-full overflow-y-auto overflow-x-hidden transition-opacity",
          isFetching && !isFetchingNextPage && "opacity-60",
        )}
      >
        <ul>
          {allResearches.map((research, index) => {
            const isActive = research.humId === selectedHumId;
            const isDummy = isDummyResearch(research.humId);

            const translations = Object.entries(research.title).map(([lang, title]) => ({
              lang: lang as Locale,
              status: research.status,
              title: title ?? undefined,
            }));

            return (
              <li key={`${research.humId}`}>
                <ListItem
                  role="menuitem"
                  onClick={() => onSelectResearch(research.humId)}
                  isActive={isActive}
                  className={cn("mb-2", {
                    "border border-dashed": isDummy,
                  })}
                >
                  <AdminListItem
                    id={research.humId}
                    translations={translations}
                    meta={<StatusTag className="capitalize" status={research.status} />}
                    hideUnpublishedDot
                    menuItems={
                      canDelete && !isDummy
                        ? [
                            {
                              label: (
                                <Label>
                                  <Trash2Icon />
                                  Delete
                                </Label>
                              ),
                              onSelect: () => onDeleteResearch(research.humId),
                              variant: "destructive",
                            },
                          ]
                        : []
                    }
                  />
                </ListItem>
                {index < allResearches.length - 1 && <hr className="my-2 border-gray-200" />}
              </li>
            );
          })}
        </ul>

        <div ref={sentinelRef} className="h-4 shrink-0">
          {isFetchingNextPage && (
            <span className="block py-2 text-center text-foreground-light text-xs">
              Loading more…
            </span>
          )}
        </div>
      </div>

      {isFetching && !isFetchingNextPage ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
          <div className="mx-2 h-1 rounded-full bg-primary/20">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      ) : null}
    </>
  );
}

function hasDummyResearch(research: ResearchSummary) {
  return isDummyResearch(research.humId);
}

const statuses = [...ResearchStatusSchema.options, "all"] as const;

/** Research filters on top of the Researches Card */
function ResearchFilters() {
  const { filters, setFilters } = useFilters("/{-$lang}/_layout/_authed/admin/researches/");

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        type="single"
        value={filters.status ?? "all"}
        onValueChange={(value) => {
          if (!value) return;
          setFilters({ status: value === "all" ? undefined : value });
        }}
      >
        {statuses.map((status) => (
          <ToggleGroupItem className="cursor-pointer capitalize" key={status} value={status}>
            {status}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <FilterSearchInput value={filters.q} onChange={(q) => setFilters({ q })} />
    </div>
  );
}
