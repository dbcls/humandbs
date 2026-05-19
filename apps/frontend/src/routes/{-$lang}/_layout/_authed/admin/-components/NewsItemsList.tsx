import {
  type InfiniteData,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { getRouteApi, useRouteContext } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Suspense, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "use-intl";

import { CollapsibleCard } from "@/components/CollapsibleCard";
import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { ListItem } from "@/components/ListItem";
import { SkeletonLoadingPanelItems } from "@/components/Skeleton";
import { TagPill } from "@/components/TagPill";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  $deleteNewsItem,
  newsItemsInfiniteQueryOptions,
  type NewsItemResponse,
} from "@/serverFunctions/news";
import useConfirmationStore from "@/stores/confirmationStore";

import { AddNewButton } from "./AddNewButton";
import { AdminListItem } from "./AdminListItem";
import {
  createDraftNewsItem,
  DRAFT_NEWS_ID,
  isDraftNewsItem,
} from "./draftNewsItem";
import { NewsFiltersBar } from "./NewsFiltersBar";
import { NoItemsMessage } from "./NoItemsMessage";

const routeApi = getRouteApi("/{-$lang}/_layout/_authed/admin/news");

export function NewsItemsList({
  selectedNewsItemId,
  onSelectNewsItem,
}: {
  selectedNewsItemId: string | undefined;
  onSelectNewsItem: (itemId: string | undefined) => void;
}) {
  const { user } = useRouteContext({ from: "__root__" });
  const queryClient = useQueryClient();

  const { q, publishedFrom, publishedTo, tagIds } = routeApi.useSearch();
  const listQO = newsItemsInfiniteQueryOptions({
    titleOrContent: q,
    publishedFrom,
    publishedTo,
    tagIds: tagIds && tagIds.length > 0 ? tagIds : undefined,
  });

  const hasDraft = selectedNewsItemId === DRAFT_NEWS_ID;

  /** Add draft dummy to query cache */
  function handleClickAdd() {
    const existingData = queryClient.getQueryData<
      InfiniteData<NewsItemResponse[], number>
    >(listQO.queryKey);
    const cacheHasDraft =
      existingData?.pages.some((page) =>
        page.some((item) => isDraftNewsItem(item.id)),
      ) ?? false;

    if (cacheHasDraft) {
      onSelectNewsItem(DRAFT_NEWS_ID);
      return;
    }
    const draft = createDraftNewsItem({
      name: user?.name ?? null,
      email: user?.email ?? "",
    });

    queryClient.setQueryData<InfiniteData<NewsItemResponse[], number>>(
      listQO.queryKey,
      (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page, i) =>
            i === 0 ? [draft, ...page] : page,
          ),
        };
      },
    );

    onSelectNewsItem(DRAFT_NEWS_ID);
  }

  return (
    <CollapsibleCard title={"News"}>
      <div>
        <NewsFiltersBar />
        <AddNewButton
          className="mb-5"
          onClick={handleClickAdd}
          disabled={hasDraft}
        />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ErrorResetBoundary
          getResetKey={() =>
            `${q}-${publishedFrom}-${publishedTo}-${tagIds?.join(",")}`
          }
        >
          <Suspense fallback={<SkeletonLoadingPanelItems />}>
            <ListItems
              selectedNewsItemId={selectedNewsItemId}
              onSelectNewsItem={onSelectNewsItem}
            />
          </Suspense>
        </ErrorResetBoundary>
      </div>
    </CollapsibleCard>
  );
}

function ListItems({
  selectedNewsItemId,
  onSelectNewsItem,
}: {
  selectedNewsItemId: string | undefined;
  onSelectNewsItem: (itemId: string | undefined) => void;
}) {
  const { openConfirmation } = useConfirmationStore();
  const t = useTranslations("DeleteDialog");

  const queryClient = useQueryClient();

  const { q, publishedFrom, publishedTo, tagIds } = routeApi.useSearch();

  const listQO = newsItemsInfiniteQueryOptions({
    titleOrContent: q,
    publishedFrom,
    publishedTo,
    tagIds: tagIds && tagIds.length > 0 ? tagIds : undefined,
  });

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage } =
    useSuspenseInfiniteQuery(listQO);

  const newsItems = data.pages.flat();

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
          <Trash2 className="mr-2 inline size-5 text-white" />
          {t("confirm")}
        </>
      ),
    });
  }

  function handleDiscardDraft() {
    queryClient.setQueryData<InfiniteData<NewsItemResponse[], number>>(
      listQO.queryKey,
      (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) =>
            page.filter((i) => !isDraftNewsItem(i.id)),
          ),
        };
      },
    );
    onSelectNewsItem(undefined);
  }

  function handleClickDelete(item: NewsItemResponse) {
    if (isDraftNewsItem(item.id)) {
      handleDiscardDraft();
    } else {
      handleClickDeleteNewsItem(item);
    }
  }

  if (newsItems.length === 0) {
    return <NoItemsMessage>No news items found</NoItemsMessage>;
  }

  return (
    <>
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
                    isDraft ? "New news item" : item.publishedAt || "No date"
                  }
                  translations={Object.entries(item.translations ?? {}).map(
                    ([lang, tr]) => ({
                      lang,
                      statuses: {
                        published: tr.title,
                      },
                    }),
                  )}
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
                        <Label>
                          <Trash2 />
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

      {isFetching && !isFetchingNextPage ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
          <div className="bg-primary/20 mx-2 h-1 rounded-full">
            <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
          </div>
        </div>
      ) : null}
    </>
  );
}
