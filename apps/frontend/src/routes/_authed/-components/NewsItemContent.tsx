import { Card } from "@/components/Card";
import { DatePicker, DateRangePicker } from "@/components/DatePicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NewsTranslationSelect } from "@/db/types";
import { i18n } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  $deleteNewsTranslation,
  $updateNewsItem,
  $upsertNewsTranslation,
  getNewsItemsQueryOptions,
  NewsItemResponse,
} from "@/serverFunctions/news";
import { useQueryClient } from "@tanstack/react-query";
import MDEditor from "@uiw/react-md-editor";
import { LucideBell, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { Locale, useLocale } from "use-intl";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { DateRange } from "react-day-picker";

export function NewsItemContent({
  newsItem,
  className,
}: {
  newsItem: NewsItemResponse | undefined;
  className?: string;
}) {
  const locale = useLocale();
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

  const [isAlert, setIsAlert] = useState(false);

  const [dateRange, setDateRange] = useState<DateRange>();

  useEffect(() => {
    setValue(
      newsItem?.translations?.find((tr) => tr?.lang === selectedLocale)?.content
    );
    setTitle(
      newsItem?.translations?.find((tr) => tr?.lang === selectedLocale)?.title
    );

    setIsAlert(!!newsItem?.alert);

    if (newsItem?.alert) {
      setDateRange({
        from: newsItem?.alert?.from,
        to: newsItem?.alert?.to,
      });
    }

    setPublishedDate(newsItem?.publishedAt ?? undefined);
  }, [newsItem, selectedLocale]);

  async function handleSave() {
    if (!newsItem) return;

    if (publishedDate) {
      await $updateNewsItem({
        data: {
          publishedAt: publishedDate,
          id: newsItem.id,
          alert:
            isAlert && dateRange && dateRange?.from && dateRange?.to
              ? (dateRange as { from: Date; to: Date })
              : undefined,
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

  const selectedTranslation =
    newsItem?.translations.find((t) => t?.lang === selectedLocale) ??
    ({} as NewsTranslationSelect);

  if (!newsItem) return null;

  return (
    <Card
      caption={
        <span className="flex items-center gap-5">
          <span>Content</span>

          <LocaleSwitcher
            locale={selectedLocale}
            onSwitchLocale={setSelectedLocale}
          />
        </span>
      }
      className={cn("flex h-full flex-1 flex-col", className)}
      containerClassName="flex flex-col flex-1 gap-4"
    >
      <div className="flex items-start gap-6">
        <DatePicker
          label="Publication date"
          dateValue={publishedDate}
          onChangeDateValue={setPublishedDate}
        />
        <TitleValue
          title="Created at:"
          value={newsItem.createdAt.toLocaleDateString(locale)}
        />
        <TitleValue
          title="Updated at:"
          value={selectedTranslation?.updatedAt?.toLocaleDateString(locale)}
        />
        <TitleValue title="Author:" value={newsItem.author.name} />
      </div>

      <Label className="cursor-pointer">
        <Checkbox
          checked={isAlert}
          onCheckedChange={(value) => setIsAlert(!!value)}
        />
        <LucideBell className="size-4" />
        Set as alert
      </Label>

      {isAlert ? (
        <DateRangePicker
          label="Alert active date range"
          value={dateRange}
          onSelect={setDateRange}
        />
      ) : null}

      <Label className="flex flex-col items-start gap-2">
        <span>Title</span>
        <Input value={title ?? ""} onChange={(e) => setTitle(e.target.value)} />
      </Label>

      <div className="flex flex-1 flex-col gap-2 text-sm font-medium">
        <span>Content</span>
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
    </Card>
  );
}

function TitleValue({
  title,
  value,
}: {
  title: string;
  value: string | undefined;
}) {
  return (
    <p className="flex flex-col items-start gap-2">
      <span className="text-sm leading-none font-medium">{title}</span>
      <span className="text-xs">{value}</span>
    </p>
  );
}
