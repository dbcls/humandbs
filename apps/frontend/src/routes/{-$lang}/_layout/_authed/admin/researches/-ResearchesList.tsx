import {
  ResearchStatusSchema,
  type ResearchSearchResponse,
  type ResearchSummary,
} from "@humandbs/backend/types";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { ListItem } from "@/components/ListItem";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/config/i18n";
import { useCan } from "@/hooks/useCan";
import {
  $deleteResearch,
  getAuthedResearchesInfiniteQueryOptions,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";

import { FilterSearchInput } from "@/components/FilterSearchInput";
import { Tag } from "@/components/StatusTag";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";
import {
  createDummyResearch,
  DUMMY_HUM_ID,
  isDummyResearch,
} from "./-dummyResearch";
import { AdminListItem } from "../-components/AdminListItem";
import { Trash2Icon } from "lucide-react";
import { Label } from "@/components/ui/label";

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

  const infiniteOpts = getAuthedResearchesInfiniteQueryOptions({
    lang,
    ...filters,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery(infiniteOpts);

  const allResearches =
    (data?.pages.flatMap((page) => page.data) as
      | ResearchSummary[]
      | undefined) ?? [];
  const hasDummy = allResearches.some((r) => isDummyResearch(r.humId));

  function handleAddNew() {
    if (hasDummy) return;
    const dummy = createDummyResearch(lang);
    queryClient.setQueriesData<{
      pages: Array<{ data: ResearchSummary[] }>;
      pageParams: unknown[];
    }>({ queryKey: ["researches", "list", "infinite"] }, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page, i) =>
          i === 0 ? { ...page, data: [dummy, ...page.data] } : page,
        ),
      };
    });
    onSelectResearch(DUMMY_HUM_ID);
  }
  // Infinite scroll sentinel
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

  // Delete mutation with optimistic update
  const { mutate: deleteResearch } = useMutation<
    void,
    Error,
    string,
    { previousLists: [QueryKey, ResearchSearchResponse | undefined][] }
  >({
    mutationFn: async (humId) => {
      const result = await $deleteResearch({ data: { humId } });
      if (!result.ok && result.code !== "NOT_FOUND") {
        throw new Error(result.error);
      }
    },
    onMutate: async (humId) => {
      await queryClient.cancelQueries({ queryKey: ["researches", "list"] });

      const previousLists = queryClient.getQueriesData<ResearchSearchResponse>({
        queryKey: ["researches", "list"],
      });

      queryClient.setQueriesData<ResearchSearchResponse>(
        { queryKey: ["researches", "list"] },
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            data: oldData.data.filter((r) => r.humId !== humId),
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

  const handleDelete = useCallback(
    (humId: string) => {
      openConfirmation({
        title: "Delete Research",
        description: `are you really want to delete research ${humId} ?`,
        actionLabel: "Delete",
        onAction: () => {
          deleteResearch(humId);
        },
      });
    },
    [deleteResearch, openConfirmation],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-col gap-3">
        <ResearchFilters />

        {canCreate && (
          <Button
            variant="accent"
            className="text-center"
            disabled={hasDummy}
            onClick={handleAddNew}
          >
            Add New
          </Button>
        )}
      </div>

      <div className="relative mt-3 min-h-0 flex-1 overflow-hidden">
        {isPending && !data ? (
          <div className="flex h-full flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <div
            className={cn(
              "h-full overflow-x-hidden overflow-y-auto transition-opacity",
              isFetching && !isFetchingNextPage && "opacity-60",
            )}
          >
            <ul>
              {allResearches.map((research) => {
                const isActive = research.humId === selectedHumId;
                const isDummy = isDummyResearch(research.humId);
                const title =
                  research.title[lang] ||
                  research.title.ja ||
                  research.title.en;
                const englishTitle = research.title.en;

                return (
                  <ListItem
                    key={research.humId}
                    role="menuitem"
                    onClick={() => onSelectResearch(research.humId)}
                    isActive={isActive}
                    className={cn("flex-1 flex-col items-start gap-1", {
                      "border border-dashed": isDummy,
                    })}
                  >
                    <AdminListItem
                      header={research.humId}
                      id={research.humId}
                      translations={Object.entries(research.title).map(
                        ([lang, title]) => ({
                          lang,
                          statuses: { [research.status]: title },
                        }),
                      )}
                      menuItems={[
                        {
                          label: (
                            <Label>
                              <Trash2Icon />
                              Delete
                            </Label>
                          ),
                          onSelect: () => handleDelete(research.humId),
                          variant: "destructive",
                        },
                      ]}
                    ></AdminListItem>
                  </ListItem>
                );
              })}
            </ul>

            <div ref={sentinelRef} className="h-4 shrink-0">
              {isFetchingNextPage && (
                <span className="text-foreground-light block py-2 text-center text-xs">
                  Loading more…
                </span>
              )}
            </div>
          </div>
        )}

        {isFetching && !isFetchingNextPage && data ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
            <div className="bg-primary/20 mx-2 h-1 rounded-full">
              <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
            </div>
          </div>
        ) : null}

        {!isPending && data && allResearches.length === 0 ? (
          <div className="text-foreground-light flex h-full items-center justify-center text-sm">
            No researches found
          </div>
        ) : null}
      </div>
    </div>
  );
}

const statuses = [...ResearchStatusSchema.options, "all"] as const;

/** Research filters on top of the Researches Card */
function ResearchFilters() {
  const { filters, setFilters } = useFilters(
    "/{-$lang}/_layout/_authed/admin/researches/",
  );

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
          <ToggleGroupItem
            className="cursor-pointer capitalize"
            key={status}
            value={status}
          >
            {status}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <FilterSearchInput
        value={filters.q}
        onChange={(q) => setFilters({ q })}
      />
    </div>
  );
}
