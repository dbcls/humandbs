import {
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { LucideBell, Trash2Icon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { ListItem } from "@/components/ListItem";
import { TrashButton } from "@/components/TrashButton";
import {
  $deleteNewsItem,
  newsItemsInfiniteQueryOptions,
  type NewsItemResponse,
} from "@/serverFunctions/news";
import useConfirmationStore from "@/stores/confirmationStore";

import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/StatusTag";
import { cn } from "@/lib/utils";
import {
  createDraftNewsItem,
  DRAFT_NEWS_ID,
  isDraftNewsItem,
} from "./-draftNewsItem";
import { AddNewButton } from "./AddNewButton";
import { NewsFiltersBar } from "./NewsFiltersBar";
import { TagPill } from "@/components/TagPill";
import { useRouteContext } from "@tanstack/react-router";

export function NewsItemsList({
  selectedNewsItemId,
  onSelectNewsItem,
}: {
  selectedNewsItemId: string | undefined;
  onSelectNewsItem: (itemId: string | undefined) => void;
}) {
  const { user } = useRouteContext({ from: "__root__" });
  const { openConfirmation } = useConfirmationStore();
  const t = useTranslations("DeleteDialog");

  const queryClient = useQueryClient();

  const routeApi = getRouteApi("/{-$lang}/_layout/_authed/admin/news");
  const { q, publishedFrom, publishedTo, isAlert, tagIds } = routeApi.useSearch();

  const listQO = newsItemsInfiniteQueryOptions({
    titleOrContent: q,
    publishedFrom,
    publishedTo,
    isAlert: isAlert === "alert" ? true : isAlert === "news" ? false : undefined,
    tagIds: tagIds && tagIds.length > 0 ? tagIds : undefined,
  });

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isPending } =
    useInfiniteQuery(listQO);

  const newsItems = data?.pages.flat() ?? [];

  const locale = useLocale();

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

  async function handleClickDeleteNewsItem(item: NewsItemResponse) {
    openConfirmation({
      title: t("title"),
      description: t("delete-newsItem-message", {
        itemName: item.translations[locale]?.title || "Unknown",
      }),
      onAction: async () => {
        await $deleteNewsItem({ data: { id: item.id } });
        queryClient.invalidateQueries({ queryKey: ["news", "items"] });
      },
      cancelLabel: t("cancel"),
      actionLabel: (
        <>
          <Trash2Icon className="mr-2 inline size-5 text-white" />{" "}
          {t("confirm")}
        </>
      ),
    });
  }

  const hasDraft = newsItems.some((item) => isDraftNewsItem(item.id));

  /** Add draft dummy to query cache */
  function handleClickAdd() {
    if (hasDraft) {
      onSelectNewsItem(DRAFT_NEWS_ID);
      return;
    }
    const draft = createDraftNewsItem({
      name: user?.name ?? null,
      email: user?.email ?? "",
    });

    queryClient.setQueryData(listQO.queryKey, (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((page, i) => (i === 0 ? [draft, ...page] : page)),
      };
    });

    onSelectNewsItem(DRAFT_NEWS_ID);
  }

  function handleDiscardDraft() {
    queryClient.setQueryData(listQO.queryKey, (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((page) =>
          page.filter((i) => !isDraftNewsItem(i.id)),
        ),
      };
    });
    onSelectNewsItem(undefined);
  }

  function handleClickDelete(item: NewsItemResponse) {
    if (isDraftNewsItem(item.id)) {
      handleDiscardDraft();
    } else {
      handleClickDeleteNewsItem(item);
    }
  }

  return (
    <Card
      caption="News"
      className="w-cms-list-panel flex h-full flex-col"
      containerClassName="overflow-auto flex-1 flex flex-col max-h-full"
    >
      <div>
        <NewsFiltersBar />
        <AddNewButton
          className="mb-5"
          onClick={handleClickAdd}
          disabled={hasDraft}
        />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <ul
            className={cn(
              "h-full overflow-y-auto transition-opacity",
              isFetching && !isFetchingNextPage && "opacity-60",
            )}
          >
            {newsItems.map((item) => {
              const isActive = item.id === selectedNewsItemId;
              const isDraft = isDraftNewsItem(item.id);
              return (
                <ListItem
                  key={item.id}
                  onClick={() => onSelectNewsItem(item.id)}
                  isActive={isActive}
                  className={cn({ "border border-dashed": isDraft })}
                >
                  <div className="flex flex-col gap-1 items-start min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="block font-mono text-xs">
                        {item.publishedAt || "No date"}
                      </span>
                      {item.alert ? (
                        <span className="flex items-center gap-0.5">
                          <LucideBell className="text-accent inline size-3" />
                          <span className="font-mono text-xs opacity-70">
                            {item.alert.from}
                            {item.alert.to && item.alert.to !== item.alert.from
                              ? ` – ${item.alert.to}`
                              : null}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    {item.translations &&
                      Object.entries(item.translations).map(([lang, tr], index) => (
                        <div key={`${lang}-${index}`} className="flex items-center gap-1 w-full">
                          <Tag tag={lang} isActive={isActive} />
                          <span className="block min-w-0 truncate text-xs opacity-70">
                            {tr.title}
                          </span>
                        </div>
                      ))}
                    {item.tags && item.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <TagPill key={tag.id} color={tag.color}>
                            {tag.name}
                          </TagPill>
                        ))}
                      </div>
                    )}
                  </div>

                  <TrashButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClickDelete(item);
                    }}
                    isActive={isActive}
                  />
                </ListItem>
              );
            })}
            <div ref={sentinelRef} className="h-4 shrink-0">
              {isFetchingNextPage && (
                <span className="text-foreground-light block py-2 text-center text-xs">
                  Loading more…
                </span>
              )}
            </div>
          </ul>
        )}

        {isFetching && !isFetchingNextPage && data ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
            <div className="mx-2 h-1 rounded-full bg-primary/20">
              <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
            </div>
          </div>
        ) : null}

        {!isPending && data && newsItems.length === 0 ? (
          <div className="text-foreground-light flex h-full items-center justify-center text-sm">
            No news items found
          </div>
        ) : null}
      </div>
    </Card>
  );
}
