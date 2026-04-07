import { useQueryClient, useSuspenseInfiniteQuery } from "@tanstack/react-query";
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

import { Tag } from "@/components/StatusTag";
import { cn } from "@/lib/utils";
import {
  createDraftNewsItem,
  DRAFT_NEWS_ID,
  isDraftNewsItem,
} from "./-draftNewsItem";
import { AddNewButton } from "./AddNewButton";
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

  const listQO = newsItemsInfiniteQueryOptions;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
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
        queryClient.invalidateQueries(listQO);
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
        pages: prev.pages.map((page, i) =>
          i === 0 ? [draft, ...page] : page,
        ),
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
      containerClassName="overflow-auto flex-1 max-h-full"
    >
      <AddNewButton
        className="mb-5"
        onClick={handleClickAdd}
        disabled={hasDraft}
      />
      <ul>
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
              <div className="text-sm font-medium">
                <span>{item.publishedAt || "No data"}</span>
                {item.alert ? (
                  <div className="text-xs">
                    <LucideBell className="text-accent mr-1 inline size-4" />
                    <span>{`${item.alert.from} - ${item.alert.to}`}</span>
                  </div>
                ) : null}
                <ul className="space-y-1">
                  {item.translations &&
                    Object.entries(item.translations).map(
                      ([lang, tr], index) => (
                        <li
                          key={`${lang}-${index}`}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Tag tag={lang} isActive={isActive} />
                          <span>{tr.title}</span>
                        </li>
                      ),
                    )}
                </ul>
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
      </ul>
      <div ref={sentinelRef} className="h-1" />
    </Card>
  );
}
