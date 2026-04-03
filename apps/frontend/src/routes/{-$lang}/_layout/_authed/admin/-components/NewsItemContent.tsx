import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { LucideBell } from "lucide-react";
import { Suspense, useState } from "react";
import { type Locale, useLocale } from "use-intl";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { i18n } from "@/config/i18n";
import { cn } from "@/lib/utils";
import type { NewsTag } from "@/repositories/newsItem";
import {
  $createNewsItem,
  $createTag,
  $updateNewsItem,
  getNewsItemsQueryOptions,
  getTagsQueryOptions,
  type NewsItemResponse,
} from "@/serverFunctions/news";
import type { DateStringRange } from "@/utils/dates";

interface FormDataType {
  translations: Record<Locale, { title: string; content: string }>;
  isAlert: boolean;
  alertRange: DateStringRange | null;
  locale: Locale;
  publishedAt: string | null;
  tags: string[];
}

export function NewsItemContent({
  newsItem,
  className,
  mode = "update",
  onCreateSuccess,
}: {
  newsItem: NewsItemResponse | undefined;
  className?: string;
  mode?: "create" | "update";
  onCreateSuccess?: (newItem: NewsItemResponse) => void;
}) {
  const locale = useLocale();
  const queryClient = useQueryClient();

  const newsItemsListQO = getNewsItemsQueryOptions({ limit: 100 });
  const tagsQO = getTagsQueryOptions();

  const { data: allTags = [] } = useQuery(tagsQO);

  const { mutate: updateNewsItem } = useMutation({
    mutationFn: async (values: FormDataType) => {
      if (!newsItem?.id) return;
      await $updateNewsItem({
        data: {
          id: newsItem.id,
          ...values,
          alert: values.alertRange,
          tags: values.tags,
        },
      });
    },
    onMutate: async (inputValues) => {
      await queryClient.cancelQueries(newsItemsListQO);

      const prevNewsItems = queryClient.getQueryData(newsItemsListQO.queryKey);

      queryClient.setQueryData(newsItemsListQO.queryKey, (prev) => {
        if (!prev) return prev;

        return prev.map((item): NewsItemResponse => {
          if (item.id === newsItem?.id) {
            return {
              ...item,
              publishedAt: inputValues.publishedAt ?? item.publishedAt,
              tags: item.tags.filter((t) => inputValues.tags.includes(t.id)),
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
          context.prevNewsItems,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(newsItemsListQO);
    },
  });

  const { mutate: createNewsItem } = useMutation({
    mutationFn: async (values: FormDataType) => {
      return $createNewsItem({
        data: {
          publishedAt: values.publishedAt,
          translations: values.translations,
          alert: values.alertRange,
          tags: values.tags,
        },
      });
    },
    onSuccess: (newItem) => {
      onCreateSuccess?.(newItem);
    },
  });

  const form = useAppForm({
    defaultValues: {
      translations: newsItem?.translations || {},
      isAlert: !!newsItem?.alert,
      alertRange: newsItem?.alert,
      locale: i18n.defaultLocale,
      publishedAt: newsItem?.publishedAt,
      tags: newsItem?.tags.map((t) => t.id) ?? [],
    } as FormDataType,
    onSubmit: ({ value }) => {
      if (mode === "create") {
        createNewsItem(value);
      } else {
        updateNewsItem(value);
      }
    },
  });

  const { mutateAsync: createTag } = useMutation({
    mutationFn: (name: string) => $createTag({ data: { name } }),
    onSuccess: (newTag) => {
      queryClient.setQueryData(tagsQO.queryKey, (prev: NewsTag[] = []) => [
        ...prev,
        newTag,
      ]);
      form.setFieldValue("tags", [...form.state.values.tags, newTag.id]);
      console.log("[createTag] onSuccess", newTag, form.state.values.tags);
    },
    onError: (err) => {
      console.error("[createTag] error", err);
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

          <form.Subscribe selector={(state) => state.values.tags}>
            {(selectedTagIds) => (
              <TagPicker
                allTags={allTags}
                selectedTagIds={selectedTagIds}
                onChange={(ids) => form.setFieldValue("tags", ids)}
                onCreateTag={createTag}
              />
            )}
          </form.Subscribe>
        </span>
      }
      className={cn("flex h-full flex-1 flex-col", className)}
      containerClassName="flex flex-col flex-1 gap-4"
    >
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
              onClick={() => {
                form.handleSubmit();
              }}
            >
              {mode === "create" ? "Create" : "Update"}
            </Button>
          )}
        </form.Subscribe>
      </div>

      <div className="flex items-start gap-6">
        <form.AppField name="publishedAt">
          {(field) => (
            <Suspense fallback={<div>Loading...</div>}>
              <field.DateField label="Published At" />
            </Suspense>
          )}
        </form.AppField>

        {mode === "update" && (
          <>
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
            <TitleValue title="Author:" value={newsItem.author.name ?? undefined} />
          </>
        )}
      </div>

      <form.AppField
        name="isAlert"
        listeners={{
          onChange: ({ value }) => {
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
                  <field.ContentAreaField
                    label="Content"
                    assetFolder={newsItem.id ? `news/${newsItem.id}` : "news"}
                  />
                </Suspense>
              )}
            </form.AppField>
          </>
        )}
      </form.Subscribe>
    </Card>
  );
}

function TagPicker({
  allTags,
  selectedTagIds,
  onChange,
  onCreateTag,
}: {
  allTags: NewsTag[];
  selectedTagIds: string[];
  onChange: (ids: string[]) => void;
  onCreateTag: (name: string) => Promise<unknown>;
}) {
  const CREATE_SENTINEL = "__create__";
  const [inputValue, setInputValue] = useState("");
  const anchor = useComboboxAnchor();

  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));
  const filteredTags = allTags.filter((t) =>
    t.name.toLowerCase().includes(inputValue.toLowerCase()),
  );
  const hasExactMatch = allTags.some(
    (t) => t.name.toLowerCase() === inputValue.toLowerCase(),
  );
  const showCreate = inputValue.trim().length > 0 && !hasExactMatch;

  function handleValueChange(ids: string[]) {
    console.log("[TagPicker] handleValueChange", ids);
    if (ids.includes(CREATE_SENTINEL)) {
      const name = inputValue.trim();
      console.log("[TagPicker] creating tag", name);
      if (name) {
        setInputValue("");
        void onCreateTag(name);
      }
      onChange(ids.filter((id) => id !== CREATE_SENTINEL));
    } else {
      onChange(ids);
    }
  }

  return (
    <Combobox
      multiple
      value={selectedTagIds}
      onValueChange={handleValueChange}
      onInputValueChange={(val) => setInputValue(val)}
    >
      <ComboboxChips ref={anchor} className="min-w-48 max-w-xs">
        {selectedTags.map((tag) => (
          <ComboboxChip key={tag.id}>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: tag.color ?? "#e5e7eb" }}
            />
            {tag.name}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput placeholder="Add tag…" />
      </ComboboxChips>

      <ComboboxContent anchor={anchor}>
        <ComboboxList>
          {filteredTags.map((tag) => (
            <ComboboxItem key={tag.id} value={tag.id}>
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: tag.color ?? "#e5e7eb" }}
              />
              {tag.name}
            </ComboboxItem>
          ))}
          {showCreate && (
            <ComboboxItem value={CREATE_SENTINEL}>
              Create tag: <span className="font-medium">{inputValue}</span>
            </ComboboxItem>
          )}
          {filteredTags.length === 0 && !showCreate && (
            <ComboboxEmpty>No tags found</ComboboxEmpty>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
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
