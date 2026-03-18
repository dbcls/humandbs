import {
  ResearchStatusSchema,
  type ResearchSearchResponse,
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
import {
  $deleteResearch,
  getAuthedResearchesInfiniteQueryOptions,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";

import { CreateResearchDialog } from "./-CreateResearchDialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNavigate } from "@tanstack/react-router";
import { useFilters } from "@/hooks/useFilters";
import { Input } from "@/components/Input";

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

  const { filters } = useFilters("/{-$lang}/_layout/_authed/admin/researches/");

  const infiniteOpts = getAuthedResearchesInfiniteQueryOptions({
    lang,
    ...filters,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(infiniteOpts);

  const allResearches = data.pages.flatMap((page) => page.data);

  console.log("allResearches", allResearches);
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
    <>
      <div className="flex flex-col gap-3">
        <ResearchFilters />

        <CreateResearchDialog />
      </div>

      <ul className="mt-3">
        {allResearches.map((research) => {
          const isActive = research.humId === selectedHumId;
          const title =
            research.title[lang] || research.title.ja || research.title.en;

          return (
            <ListItem
              key={research.humId}
              role="menuitem"
              onClick={() => onSelectResearch(research.humId)}
              isActive={isActive}
            >
              <div className="min-w-0 flex-1">
                <span className="block font-mono text-xs">
                  {research.humId}
                </span>
                <span className="block truncate text-xs opacity-70">
                  {title}
                </span>
              </div>
              <Button
                variant="ghost"
                size="slim"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(research.humId);
                }}
              >
                <Trash2Icon className="text-danger size-4 transition-colors group-data-[active=true]:text-white" />
              </Button>
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
    </>
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
