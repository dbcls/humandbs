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
import { isDraftNewsItem } from "../-draftNewsItem";
import { AddNewButton } from "./AddNewButton";

export function NewsItemsList({
  onClickAdd,
  selectedNewsItem,
  onSelectNewsItem,
  draftNewsItem,
  onDiscardDraft,
}: {
  onClickAdd: () => void;
  selectedNewsItem: NewsItemResponse | undefined;
  onSelectNewsItem: (item: NewsItemResponse) => void;
  draftNewsItem: NewsItemResponse | null;
  onDiscardDraft: () => void;
}) {
  const { openConfirmation } = useConfirmationStore();
  const t = useTranslations("DeleteDialog");

  const queryClient = useQueryClient();
  const { data: newsItems } = useSuspenseQuery(
    getNewsItemsQueryOptions({ limit: 100 }),
  );

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

  const allItems = draftNewsItem
    ? [draftNewsItem, ...newsItems]
    : newsItems;

  return (
    <Card
      caption="News"
      className="w-cms-list-panel flex h-full flex-col"
      containerClassName="overflow-auto flex-1 max-h-full"
    >
      <AddNewButton
        className="mb-5"
        onClick={onClickAdd}
        disabled={!!draftNewsItem}
      />
      <ul>
        {allItems.map((item) => {
          const isActive = item.id === selectedNewsItem?.id;
          const isDraft = isDraftNewsItem(item.id);
          return (
            <ListItem
              key={item.id}
              onClick={() => onSelectNewsItem(item)}
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
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${tag.color ?? "#e5e7eb"}22`,
                          color: tag.color ?? "#6b7280",
                          border: `1px solid ${tag.color ?? "#e5e7eb"}`,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <TrashButton
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDraft) {
                    onDiscardDraft();
                  } else {
                    handleClickDeleteNewsItem(item);
                  }
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
