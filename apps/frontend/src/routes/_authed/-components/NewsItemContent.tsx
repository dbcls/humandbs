import { DatePicker } from "@/components/DatePicker";
import { i18n } from "@/lib/i18n-config";
import {
  $deleteNewsTranslation,
  $updateNewsItem,
  $upsertNewsTranslation,
  getNewsItemsQueryOptions,
  GetNewsItemsResponse,
} from "@/serverFunctions/news";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Locale } from "use-intl";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import MDEditor from "@uiw/react-md-editor";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import { Button } from "@/components/ui/button";
import { Trash2Icon } from "lucide-react";

export function NewsItemContent({
  newsItem,
}: {
  newsItem: GetNewsItemsResponse[number] | undefined;
}) {
  const queryClient = useQueryClient();
  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    i18n.defaultLocale
  );

  const translation = newsItem?.translations.find(
    (tr) => tr?.lang === selectedLocale
  );

  const [value, setValue] = useState(() => translation?.content);

  const [title, setTitle] = useState(() => translation?.title);

  const [publishedDate, setPublishedDate] = useState<Date>();

  useEffect(() => {
    setValue(
      newsItem?.translations?.find((tr) => tr?.lang === selectedLocale)?.content
    );
    setTitle(
      newsItem?.translations?.find((tr) => tr?.lang === selectedLocale)?.title
    );

    setPublishedDate(newsItem?.publishedAt ?? undefined);
  }, [newsItem, selectedLocale]);

  async function handleSave() {
    if (!newsItem) return;

    if (publishedDate) {
      await $updateNewsItem({
        data: {
          publishedAt: publishedDate,
          id: newsItem.id,
        },
      });
    }

    if (value && title) {
      await $upsertNewsTranslation({
        data: {
          title,
          content: value,
          lang: selectedLocale,
          newsId: newsItem.id,
        },
      });
    }

    queryClient.invalidateQueries(getNewsItemsQueryOptions({ limit: 100 }));
  }

  async function handleDeleteTranslation() {
    if (!newsItem) return;
    if (!selectedLocale) return;

    await $deleteNewsTranslation({
      data: {
        newsId: newsItem.id,
        lang: selectedLocale,
      },
    });

    queryClient.invalidateQueries(getNewsItemsQueryOptions({ limit: 100 }));
  }

  if (!newsItem) return null;

  return (
    <>
      <DatePicker
        label="Publication date"
        dateValue={publishedDate}
        onChangeDateValue={setPublishedDate}
      />
      <LocaleSwitcher
        locale={selectedLocale}
        onSwitchLocale={setSelectedLocale}
      />
      <div>
        <Label>Title</Label>
        <Input
          value={title ?? ""}
          className="bg-white"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-1 flex-col">
        <Label className="mb-2">Content</Label>
        <div data-color-mode="light" className="flex-1">
          <MDEditor
            highlightEnable={true}
            value={value ?? ""}
            onChange={setValue}
            height="100%"
            className="md-editor flex-1"
            components={{
              preview: (source) => {
                const { content } = transformMarkdoc({ rawContent: source });

                return <RenderMarkdoc content={content} />;
              },
            }}
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Button onClick={handleDeleteTranslation} variant={"plain"}>
          <Trash2Icon className="text-red-600" />
        </Button>
        <Button size="lg" onClick={handleSave}>
          Update
        </Button>
      </div>
    </>
  );
}
