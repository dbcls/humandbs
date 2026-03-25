import {
  ResearchStatusSchema,
  type ResearchSearchResponse,
  type ResearchSummary,
} from "@humandbs/backend/types";
import {
  type QueryKey,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { ListItem } from "@/components/ListItem";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/config/i18n";
import { useCan } from "@/hooks/useCan";
import {
  $deleteResearch,
  getAuthedResearchesInfiniteQueryOptions,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";

import {
  createDummyResearch,
  DUMMY_HUM_ID,
  isDummyResearch,
} from "./-dummyResearch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFilters } from "@/hooks/useFilters";
import { Input } from "@/components/Input";
import { Tag } from "@/components/StatusTag";
import { cn } from "@/lib/utils";

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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(infiniteOpts);

  const allResearches = data.pages.flatMap(
    (page) => page.data,
  ) as ResearchSummary[];
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

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <ul>
          {allResearches.map((research) => {
            const isActive = research.humId === selectedHumId;
            const isDummy = isDummyResearch(research.humId);
            const title =
              research.title[lang] || research.title.ja || research.title.en;
            const englishTitle = research.title.en;

            return (
              <ListItem
                key={research.humId}
                role="menuitem"
                onClick={() => onSelectResearch(research.humId)}
                isActive={isActive}
                className={cn("flex-1 flex-col gap-1 items-start", {
                  "border border-dashed": isDummy,
                })}
              >
                <div className="flex items-center gap-2">
                  <span className="block font-mono text-xs">
                    {research.humId}
                  </span>
                  {research.status ? <Tag tag={research.status} /> : null}
                </div>
                <span className="block truncate text-xs opacity-70">
                  {title}
                </span>
                {englishTitle && englishTitle !== title ? (
                  <span className="block truncate text-xs opacity-70">
                    {englishTitle}
                  </span>
                ) : null}
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
    </div>
  );
}

const statuses = [...ResearchStatusSchema.options, "all"] as const;

/** Research filters on top of the Researches Card */
function ResearchFilters() {
  const { filters, setFilters } = useFilters(
    "/{-$lang}/_layout/_authed/admin/researches/",
  );

  const debouncedSetQuery = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return (value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setFilters({ q: value ?? undefined });
      }, 300);
    };
  }, [setFilters]);

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        type="single"
        value={filters.status ?? "all"}
        onValueChange={(value) => {
          if (!value) return;

          if (value === "all") {
            setFilters({ status: undefined });
          } else {
            setFilters({ status: value });
          }
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

      <Input
        type="text"
        placeholder="Search…"
        defaultValue={filters.q ?? ""}
        onChange={(e) => {
          if (e.target.value !== "" || e.target.value.length <= 3) return;
          debouncedSetQuery(e.target.value);
        }}
      />
    </div>
  );
}
