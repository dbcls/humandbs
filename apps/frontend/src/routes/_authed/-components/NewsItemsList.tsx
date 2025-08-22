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
import { LucideBell, LucideBellElectric, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";
import { Tag } from "./StatusTag";

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
        itemName: getNewsItemTitle(item, locale),
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
      className="flex h-full w-96 flex-col"
      containerClassName="overflow-auto flex-1 max-h-full"
    >
      <ul>
        {newsItems.map((item) => {
          const isActive = item.id === selectedNewsItem?.id;
          return (
            <ListItem
              key={item.id}
              onClick={() => onSelectNewsItem(item)}
              isActive={isActive}
            >
              <>
                <div className="text-sm font-medium">
                  <span>
                    {item.publishedAt?.toLocaleDateString(locale, {
                      timeZone: "UTC",
                    }) || "No data"}
                  </span>
                  {item.alert ? (
                    <div className="text-xs">
                      <LucideBell className="text-accent mr-1 inline size-4" />
                      <span>
                        {`${item.alert.from.toLocaleDateString(locale, { timeZone: "UTC" })} - ${item.alert.to.toLocaleDateString(locale, { timeZone: "UTC" })}`}
                      </span>
                    </div>
                  ) : null}
                  <ul className="space-y-1">
                    {item.translations?.[0] &&
                      item.translations.map((tr, index) => (
                        <li
                          key={`${tr?.lang}-${index}`}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Tag tag={tr.lang} isActive={isActive} />
                          <span>{tr.title}</span>
                        </li>
                      ))}
                  </ul>
                </div>

                <Button
                  variant={"ghost"}
                  size={"slim"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClickDeleteNewsItem(item);
                  }}
                >
                  <Trash2Icon
                    className={cn("text-danger size-5 transition-colors", {
                      "text-white": isActive,
                    })}
                  />
                </Button>
              </>
            </ListItem>
          );
        })}
        <li>
          <Button onClick={onClickAdd} variant={"toggle"}>
            + Add news
          </Button>
        </li>
      </ul>
    </Card>
  );
}

function getNewsItemTitle(item: NewsItemResponse, locale: string) {
  return (
    item.translations.find((tr) => tr?.lang === locale)?.title ||
    item.translations[0]?.title ||
    "No title"
  );
}
