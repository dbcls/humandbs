import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  $deleteNewsItem,
  getNewsItemsQueryOptions,
  GetNewsItemsResponse,
} from "@/serverFunctions/news";
import useConfirmationStore from "@/stores/confirmationStore";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

export function NewsItemsList({
  onClickAdd,
  selectedNewsItem,
  onSelectNewsItem,
}: {
  onClickAdd: () => void;
  selectedNewsItem: GetNewsItemsResponse[number] | undefined;
  onSelectNewsItem: (item: GetNewsItemsResponse[number]) => void;
}) {
  const { openConfirmation } = useConfirmationStore();
  const t = useTranslations("DeleteDialog");

  const queryClient = useQueryClient();
  const { data: newsItems } = useSuspenseQuery(
    getNewsItemsQueryOptions({ limit: 100 })
  );

  const locale = useLocale();

  async function handleClickDeleteNewsItem(item: GetNewsItemsResponse[number]) {
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
    <ul>
      {newsItems.map((item) => {
        return (
          <li key={item.id} className="flex items-start gap-1">
            <Button
              size={"slim"}
              className={cn({
                "border-secondary-light border":
                  item.id === selectedNewsItem?.id,
              })}
              onClick={() => onSelectNewsItem(item)}
              variant={"toggle"}
            >
              <p className="text-xs">
                {item.publishedAt?.toLocaleDateString(locale) || "No data"}
                {item.translations?.[0] &&
                  item.translations.map((tr, index) => (
                    <span
                      className="bg-secondary-light ml-2 rounded-full px-2 text-xs text-white"
                      key={`${tr?.lang}-${index}`}
                    >
                      {tr?.lang}
                    </span>
                  ))}
              </p>
              <p className="text-sm">{getNewsItemTitle(item, locale)}</p>
            </Button>
            <Button
              variant={"cms-table-action"}
              size={"slim"}
              onClick={() => handleClickDeleteNewsItem(item)}
            >
              <Trash2Icon className="size-5 text-red-700" />
            </Button>
          </li>
        );
      })}
      <li>
        <Button onClick={onClickAdd} variant={"toggle"}>
          + Add news
        </Button>
      </li>
    </ul>
  );
}

function getNewsItemTitle(item: GetNewsItemsResponse[number], locale: string) {
  return (
    item.translations.find((tr) => tr?.lang === locale)?.title ||
    item.translations[0]?.title ||
    "No title"
  );
}
