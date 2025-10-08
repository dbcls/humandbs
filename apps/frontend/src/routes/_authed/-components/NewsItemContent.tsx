import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { Button } from "@/components/ui/button";
import { i18n } from "@/lib/i18n-config";
import { cn, DateStringRange } from "@/lib/utils";
import {
  $updateNewsItem,
  getNewsItemsQueryOptions,
  NewsItemResponse,
} from "@/serverFunctions/news";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LucideBell } from "lucide-react";
import { Suspense, useEffect } from "react";
import { Locale, useLocale } from "use-intl";

type FormDataType = {
  translations: Record<Locale, { title: string; content: string }>;
  isAlert: boolean;
  alertRange: DateStringRange | null;
  locale: Locale;
  publishedAt: string | null;
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

              translations: Object.entries(item.translations).reduce<
                NewsItemResponse["translations"]
              >((acc, curr) => {
                const [key, value] = curr;

                acc[key as Locale] = {
                  ...value,
                  ...inputValues.translations[key as Locale],
                };
                return acc;
              }, {}),
            };
          }
          return item;
        });
      });

      return { prevNewsItems };
    },
    onError: (_, __, context) => {
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

  const form = useAppForm({
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

  if (!newsItem) return null;

  return (
    <Card
      caption={
        <span className="flex items-center gap-5">
          <span>Details</span>

          <form.AppField name="locale">
            {(field) => <field.LocaleSwitchField />}
          </form.AppField>
        </span>
      }
      className={cn("flex h-full flex-1 flex-col", className)}
      containerClassName="flex flex-col flex-1 gap-4"
    >
      <div className="flex items-start gap-6">
        <form.AppField name="publishedAt">
          {(field) => (
            <Suspense fallback={<div>Loading...</div>}>
              <field.DateField label="Published At" />
            </Suspense>
          )}
        </form.AppField>

        <TitleValue
          title="Created at:"
          value={newsItem.createdAt.toLocaleDateString(locale)}
        />
        <TitleValue
          title="Updated at:"
          value={newsItem.translations[
            form.state.values.locale
          ]?.updatedAt?.toLocaleDateString()}
        />
        <TitleValue title="Author:" value={newsItem.author.name} />
      </div>

      <form.AppField
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
          <field.CheckboxField
            label={
              <>
                <LucideBell className="size-4" />
                Set as alert
              </>
            }
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.isAlert}>
        {(isAlert) => {
          if (!isAlert) return null;
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <form.AppField name={"alertRange"}>
                {(field) => (
                  <field.DateRangeField
                    className="ml-5"
                    label="Alert date range"
                  />
                )}
              </form.AppField>
            </Suspense>
          );
        }}
      </form.Subscribe>

      <form.Subscribe selector={(state) => state.values.locale}>
        {(locale) => (
          <>
            <form.AppField name={`translations.${locale}.title`}>
              {(field) => <field.TextField label="Title" />}
            </form.AppField>
            <form.AppField name={`translations.${locale}.content`}>
              {(field) => (
                <Suspense fallback={<div>Loading...</div>}>
                  <field.ContentAreaField label="Content" />
                </Suspense>
              )}
            </form.AppField>
          </>
        )}
      </form.Subscribe>

      <div className="flex items-center justify-end">
        <form.Subscribe
          selector={(state) => [
            state.isSubmitting,
            state.isTouched,
            state.isValid,
          ]}
        >
          {([isSubmitting, isTouched, isValid]) => (
            <Button
              disabled={isSubmitting || !isTouched || !isValid}
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
