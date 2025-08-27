import { Card } from "@/components/Card";
import { DatePicker, DateRangePicker } from "@/components/DatePicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { i18n } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  $updateNewsItem,
  getNewsItemsQueryOptions,
  NewsItemResponse,
} from "@/serverFunctions/news";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import MDEditor from "@uiw/react-md-editor";
import { LucideBell } from "lucide-react";
import { useEffect } from "react";
import { DateRange } from "react-day-picker";
import { Locale, useLocale } from "use-intl";
import { LocaleSwitcher } from "./LocaleSwitcher";

type FormDataType = {
  translations: Record<Locale, { title: string; content: string }>;
  isAlert: boolean;
  alertRange: DateRange | null;
  locale: Locale;
  publishedAt: Date | null;
};

export function NewsItemContent({
  newsItem,
  className,
}: {
  newsItem: NewsItemResponse | undefined;
  className?: string;
}) {
  const locale = useLocale();
  const queryClient = useQueryClient();

  const newsItemsListQO = getNewsItemsQueryOptions({ limit: 100 });

  const { mutate: updateNewsItem } = useMutation({
    mutationFn: async (values: FormDataType) => {
      if (!newsItem?.id) return;
      await $updateNewsItem({
        data: {
          id: newsItem.id,
          ...values,
          alert: values.alertRange,
        },
      });
    },
    onMutate: async (inputValues) => {
      await queryClient.cancelQueries(newsItemsListQO);

      const prevNewsItems = queryClient.getQueryData(newsItemsListQO.queryKey);

      queryClient.setQueryData(newsItemsListQO.queryKey, (prev) => {
        if (!prev) return prev;

        return prev.map((item) => {
          if (item.id === newsItem?.id) {
            return {
              ...item,
              ...inputValues,
              alert: inputValues.alertRange,
              translations: Object.entries(item.translations).reduce(
                (acc, curr) => {
                  const [key, value] = curr as [
                    Locale,
                    {
                      title: string;
                      content: string;
                      updatedAt: Date | null;
                    },
                  ];

                  acc[key] = { ...value, ...inputValues.translations[key] };
                  return acc;
                },
                {} as Record<
                  Locale,
                  {
                    title: string;
                    content: string;
                    updatedAt: Date | null;
                  }
                >
              ),
            };
          }
          return item;
        });
      });

      return { prevNewsItems };
    },
    onError: (error, variables, context) => {
      if (context?.prevNewsItems) {
        queryClient.setQueryData(
          newsItemsListQO.queryKey,
          context.prevNewsItems
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(newsItemsListQO);
    },
  });

  const form = useForm({
    defaultValues: {
      translations: newsItem?.translations || {},
      isAlert: !!newsItem?.alert,
      alertRange: newsItem?.alert,
      locale: i18n.defaultLocale,
      publishedAt: newsItem?.publishedAt,
    } as FormDataType,
    onSubmit: ({ value }) => {
      updateNewsItem(value);
    },
  });

  useEffect(() => {
    form.reset();
  }, [form, newsItem]);

  if (!newsItem) return null;

  return (
    <Card
      caption={
        <span className="flex items-center gap-5">
          <span>Content</span>

          <form.Field name="locale">
            {(field) => (
              <LocaleSwitcher
                locale={field.state.value}
                onSwitchLocale={field.setValue}
              />
            )}
          </form.Field>
        </span>
      }
      className={cn("flex h-full flex-1 flex-col", className)}
      containerClassName="flex flex-col flex-1 gap-4"
    >
      <div className="flex items-start gap-6">
        <form.Field name="publishedAt">
          {(field) => {
            return (
              <DatePicker
                label="Publication date"
                dateValue={field.state.value}
                onChangeDateValue={(value) => value && field.setValue(value)}
              />
            );
          }}
        </form.Field>

        <TitleValue
          title="Created at:"
          value={newsItem.createdAt.toLocaleDateString(locale, {
            timeZone: "UTC",
          })}
        />
        <TitleValue
          title="Updated at:"
          value={newsItem.translations[
            form.state.values.locale
          ]?.updatedAt?.toLocaleDateString(locale, { timeZone: "UTC" })}
        />
        <TitleValue title="Author:" value={newsItem.author.name} />
      </div>

      <form.Field
        name="isAlert"
        listeners={{
          onChange: ({ value }) => {
            // set range to null if checkbox is unchecked
            if (!value) {
              form.setFieldValue("alertRange", null);
            }
          },
        }}
      >
        {(field) => (
          <Label className="cursor-pointer">
            <Checkbox
              checked={field.state.value}
              onCheckedChange={(value) => {
                field.handleChange(!!value);
              }}
            />
            <LucideBell className="size-4" />
            Set as alert
          </Label>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.isAlert}>
        {(isAlert) => {
          return (
            <form.Field name={"alertRange"}>
              {(field) => {
                if (!isAlert) return null;
                return (
                  <DateRangePicker
                    label="Alert active date range"
                    value={field.state.value ?? undefined}
                    onSelect={(value) =>
                      field.handleChange((old) => ({ ...old, ...value }))
                    }
                  />
                );
              }}
            </form.Field>
          );
        }}
      </form.Subscribe>

      <form.Subscribe selector={(state) => state.values.locale}>
        {(locale) => (
          <>
            <form.Field name={`translations.${locale}.title`}>
              {(field) => (
                <Label className="flex flex-col items-start gap-2">
                  <span>Title</span>
                  <Input
                    value={field.state.value ?? ""}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </Label>
              )}
            </form.Field>
            <form.Field name={`translations.${locale}.content`}>
              {(field) => (
                <div className="flex flex-1 flex-col gap-2 text-sm font-medium">
                  <span>Content</span>
                  <div data-color-mode="light" className="flex-1">
                    <MDEditor
                      highlightEnable={true}
                      value={field.state.value ?? ""}
                      onChange={(value) => field.handleChange(value || "")}
                      height="100%"
                      className="md-editor flex-1"
                      components={{
                        preview: (source) => {
                          const { content } = transformMarkdoc({
                            rawContent: source,
                          });

                          return <RenderMarkdoc content={content} />;
                        },
                      }}
                    />
                  </div>
                </div>
              )}
            </form.Field>
          </>
        )}
      </form.Subscribe>

      <div className="flex items-center justify-end">
        <form.Subscribe selector={(state) => state.isDirty}>
          {(isDirty) => (
            <Button
              disabled={!isDirty}
              size="lg"
              onClick={() => form.handleSubmit()}
            >
              Update
            </Button>
          )}
        </form.Subscribe>
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
