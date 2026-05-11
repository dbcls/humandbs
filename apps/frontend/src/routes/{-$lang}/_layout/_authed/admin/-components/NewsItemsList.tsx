import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import {
  SidebarCloseIcon,
  SidebarOpenIcon,
  Trash2,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { ListItem } from "@/components/ListItem";
import {
  $deleteNewsItem,
  newsItemsInfiniteQueryOptions,
  type NewsItemResponse,
} from "@/serverFunctions/news";
import useConfirmationStore from "@/stores/confirmationStore";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  createDraftNewsItem,
  DRAFT_NEWS_ID,
  isDraftNewsItem,
} from "./draftNewsItem";
import { AdminListItem } from "./AdminListItem";
import { AddNewButton } from "./AddNewButton";
import { NewsFiltersBar } from "./NewsFiltersBar";
import { TagPill } from "@/components/TagPill";
import { useRouteContext } from "@tanstack/react-router";
import { Label } from "@/components/ui/label";
import { useTogglePanel } from "@/hooks/useTogglePanel";
import { Button } from "@/components/ui/button";

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

  const { open, togglePanel, renderContent, handleTransitionEnd } =
    useTogglePanel();

  console.log("renderContent", renderContent);
  const queryClient = useQueryClient();

  const routeApi = getRouteApi("/{-$lang}/_layout/_authed/admin/news");
  const { q, publishedFrom, publishedTo, tagIds } = routeApi.useSearch();

  const listQO = newsItemsInfiniteQueryOptions({
    titleOrContent: q,
    publishedFrom,
    publishedTo,
    tagIds: tagIds && tagIds.length > 0 ? tagIds : undefined,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery(listQO);

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
          <Trash2Icon className="mr-2 inline size-5 text-white" />
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
      caption={
        <div className="relative flex justify-between">
          {open && <span>News</span>}
          <Button onClick={togglePanel} variant={"ghost"} size={"icon"}>
            {open ? (
              <SidebarCloseIcon className="size-4" />
            ) : (
              <SidebarOpenIcon className="size-4" />
            )}
          </Button>
        </div>
      }
      className={cn("flex h-full flex-col transition-[width]", {
        "w-18 overflow-clip **:min-w-max": !open,
        "w-cms-list-panel": open,
      })}
      onTransitionEnd={handleTransitionEnd}
      containerClassName="flex-1 flex flex-col max-h-full"
    >
      {renderContent && (
        <>
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
                {newsItems.map((item, index) => {
                  const isActive = item.id === selectedNewsItemId;
                  const isDraft = isDraftNewsItem(item.id);
                  return (
                    <li key={item.id}>
                      <ListItem
                        onClick={() => onSelectNewsItem(item.id)}
                        isActive={isActive}
                        className={cn("mb-2", {
                          "border border-dashed": isDraft,
                        })}
                      >
                        <AdminListItem
                          id={item.id}
                          header={
                            isDraft
                              ? "New news item"
                              : item.publishedAt || "No date"
                          }
                          translations={Object.entries(
                            item.translations ?? {},
                          ).map(([lang, tr]) => ({
                            lang,
                            statuses: {
                              published: tr.title,
                            },
                          }))}
                          meta={
                            item.tags && item.tags.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {item.tags.map((tag) => (
                                  <TagPill key={tag.id} color={tag.color}>
                                    {tag.name}
                                  </TagPill>
                                ))}
                              </div>
                            ) : null
                          }
                          menuItems={[
                            {
                              label: (
                                <Label className="text-danger flex justify-between">
                                  <Trash2 className="size-4" />
                                  Delete
                                </Label>
                              ),
                              onSelect: () => handleClickDelete(item),
                              variant: "destructive",
                            },
                          ]}
                        />
                      </ListItem>
                      {index < newsItems.length - 1 ? (
                        <hr className="my-2 border-gray-200" />
                      ) : null}
                    </li>
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
                <div className="bg-primary/20 mx-2 h-1 rounded-full">
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
        </>
      )}
    </Card>
  );
}
