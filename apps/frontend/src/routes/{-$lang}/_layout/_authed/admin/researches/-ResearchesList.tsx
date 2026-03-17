import type { ResearchSearchResponse } from "@humandbs/backend/types";
import {
  type QueryKey,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { ListItem } from "@/components/ListItem";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/config/i18n";
import {
  $deleteResearch,
  getResearchesInfiniteQueryOptions,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";

import { CreateResearchDialog } from "./-CreateResearchDialog";

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

  const infiniteOpts = getResearchesInfiniteQueryOptions({ lang });
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(infiniteOpts);

  const allResearches = data.pages.flatMap((page) => page.data);

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

      const previousLists =
        queryClient.getQueriesData<ResearchSearchResponse>({
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
      <ResearchFilters />
      <CreateResearchDialog />

      <ul className="mt-3">
        {allResearches.map((research) => {
          const isActive = research.humId === selectedHumId;
          const title = research.title[lang] || research.title.ja || research.title.en;

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


function ResearchFilters() {
  
}