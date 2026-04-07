import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { LucideBell, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { ListItem } from "@/components/ListItem";
import { TrashButton } from "@/components/TrashButton";
import {
  $deleteNewsItem,
  getNewsItemsQueryOptions,
  type NewsItemResponse,
} from "@/serverFunctions/news";
import useConfirmationStore from "@/stores/confirmationStore";

import { Tag } from "@/components/StatusTag";
import { cn } from "@/lib/utils";
import {
  createDraftNewsItem,
  DRAFT_NEWS_ID,
  draftNewsItemQO,
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

  const listQO = getNewsItemsQueryOptions();

  const { data: newsItems } = useSuspenseQuery(listQO);

  const locale = useLocale();

  async function handleClickDeleteNewsItem(item: NewsItemResponse) {
    openConfirmation({
      title: t("title"),
      description: t("delete-newsItem-message", {
        itemName: item.translations[locale]?.title || "Unknown",
      }),
      onAction: async () => {
        await $deleteNewsItem({ data: { id: item.id } });
        queryClient.invalidateQueries(getNewsItemsQueryOptions({ limit: 100 }));
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

  /** Add draft dummy to query cache */
  function handleClickAdd() {
    const existing = queryClient.getQueryData(listQO.queryKey);
    if (existing?.some((item) => isDraftNewsItem(item.id))) {
      onSelectNewsItem(DRAFT_NEWS_ID);
      return;
    }
    const draft = createDraftNewsItem({
      name: user?.name ?? null,
      email: user?.email ?? "",
    });

    queryClient.setQueryData(listQO.queryKey, (prev) => {
      return prev ? [draft, ...prev] : [draft];
    });

    queryClient.setQueryData(draftNewsItemQO.queryKey, draft);

    onSelectNewsItem(DRAFT_NEWS_ID);
  }

  function handleDiscardDraft() {
    queryClient.setQueryData(listQO.queryKey, (old) =>
      old?.filter((i) => !isDraftNewsItem(i.id)),
    );

    onSelectNewsItem(undefined);
  }
  function handleClickDelete(item: NewsItemResponse) {
    const isDraft = isDraftNewsItem(item.id);
    if (isDraft) {
      handleDiscardDraft();
    } else {
      handleClickDeleteNewsItem(item);
    }
  }
  const isCreateMode = newsItems.some((item) => isDraftNewsItem(item.id));
  return (
    <Card
      caption="News"
      className="w-cms-list-panel flex h-full flex-col"
      containerClassName="overflow-auto flex-1 max-h-full"
    >
      <AddNewButton
        className="mb-5"
        onClick={handleClickAdd}
        disabled={!!isCreateMode}
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
    </Card>
  );
}
