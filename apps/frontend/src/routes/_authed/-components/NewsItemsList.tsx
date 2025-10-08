import { Card } from "@/components/Card";
import { ListItem } from "@/components/ListItem";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  $deleteNewsItem,
  getNewsItemsQueryOptions,
  NewsItemResponse,
} from "@/serverFunctions/news";
import useConfirmationStore from "@/stores/confirmationStore";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { LucideBell, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";
import { Tag } from "./StatusTag";
import { AddNewButton } from "./AddNewButton";
import { TrashButton } from "@/components/TrashButton";

export function NewsItemsList({
  onClickAdd,
  selectedNewsItem,
  onSelectNewsItem,
}: {
  onClickAdd: () => void;
  selectedNewsItem: NewsItemResponse | undefined;
  onSelectNewsItem: (item: NewsItemResponse) => void;
}) {
  const { openConfirmation } = useConfirmationStore();
  const t = useTranslations("DeleteDialog");

  const queryClient = useQueryClient();
  const { data: newsItems } = useSuspenseQuery(
    getNewsItemsQueryOptions({ limit: 100 })
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
      onCancel: () => {},
      cancelLabel: t("cancel"),
      actionLabel: (
        <>
          <Trash2Icon className="mr-2 inline size-5 text-white" />{" "}
          {t("confirm")}
        </>
      ),
    });
  }

  return (
    <Card
      caption="News"
      className="w-cms-list-panel flex h-full flex-col"
      containerClassName="overflow-auto flex-1 max-h-full"
    >
      <ul>
        <li className="mb-5">
          <AddNewButton onClick={onClickAdd} />
        </li>
        {newsItems.map((item) => {
          const isActive = item.id === selectedNewsItem?.id;
          return (
            <ListItem
              key={item.id}
              onClick={() => onSelectNewsItem(item)}
              isActive={isActive}
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
                      )
                    )}
                </ul>
              </div>

              <TrashButton
                onClick={(e) => {
                  e.stopPropagation();
                  handleClickDeleteNewsItem(item);
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
