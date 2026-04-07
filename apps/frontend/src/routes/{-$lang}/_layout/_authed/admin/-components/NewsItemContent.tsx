import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore, uuid } from "@tanstack/react-form";
import { LucideBell } from "lucide-react";
import { Suspense, useState } from "react";
import { type Locale, useLocale } from "use-intl";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { ModifiedTag } from "@/components/form-context/fields/ModifiedTag";
import { TabLabel } from "@/components/form-context/fields/TabLabel";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n } from "@/config/i18n";
import { cn } from "@/lib/utils";
import type { NewsItemRecord, NewsTag } from "@/repositories/newsItem";
import {
  $createNewsItem,
  $createTag,
  $updateNewsItem,
  getNewsItemQueryOptions,
  getNewsItemsQueryOptions,
  getTagsQueryOptions,
  type NewsItemResponse,
} from "@/serverFunctions/news";
import type { DateStringRange } from "@/utils/dates";
import { Label } from "@/components/ui/label";
import { isDraftNewsItem } from "../-draftNewsItem";
import { useRouteContext } from "@tanstack/react-router";
import type { SessionUser } from "@/utils/jwt-helpers";
import { SkeletonLoading } from "@/components/Skeleton";
import { Skeleton } from "@/components/ui/skeleton";

interface FormDataType {
  translations: Record<Locale, { title: string; content: string }>;
  isAlert: boolean;
  alertRange: DateStringRange | null;
  locale: Locale;
  publishedAt: string | null;
  tags: string[];
}

function getOptimisticallyUpdatedNewsValue(
  newsItem: NewsItemRecord,
  formValues: FormDataType,
  allTags: NewsTag[],
): NewsItemRecord {
  return {
    id: newsItem.id,
    createdAt: newsItem.createdAt,
    publishedAt: formValues.publishedAt,
    author: newsItem.author,
    alert: formValues.alertRange
      ? {
          from: formValues.alertRange.from ?? null,
          to: formValues.alertRange.to ?? null,
        }
      : null,
    tags: formValues.tags
      .map((id) => allTags.find((t) => t.id === id))
      .filter((t): t is NewsTag => !!t),
    translations: Object.entries(newsItem?.translations || {}).reduce<
      NewsItemResponse["translations"]
    >((acc, curr) => {
      const [key, value] = curr;
      acc[key as Locale] = {
        ...value,
        ...formValues.translations[key as Locale],
      };
      return acc;
    }, {}),
  };
}

function getOptimisticallyCreatedNewsItem(
  user: SessionUser | null,
  formValues: FormDataType,
  allTags: NewsTag[],
): NewsItemRecord {
  const now = new Date();
  return {
    id: uuid(),
    createdAt: now,
    publishedAt: formValues.publishedAt,
    author: {
      name: user?.name || "You",
      email: user?.email || "",
    },
    translations: Object.fromEntries(
      Object.entries(formValues.translations).map(([key, value]) => [
        key,
        {
          title: value.title,
          content: value.content,
          updatedAt: now,
        },
      ]),
    ),
    alert: formValues.alertRange
      ? {
          from: formValues.alertRange.from ?? null,
          to: formValues.alertRange.to ?? null,
        }
      : null,
    tags: formValues.tags
      .map((id) => allTags.find((t) => t.id === id))
      .filter((t): t is NewsTag => !!t),
  };
}

export function NewsItemContent({
  selectedNewsItemId,
  className,
  mode = "update",
}: {
  selectedNewsItemId: string;
  className?: string;
  mode?: "create" | "update";
}) {
  const { user } = useRouteContext({ from: "__root__" });
  const locale = useLocale();

  const queryClient = useQueryClient();

  const isDraft = isDraftNewsItem(selectedNewsItemId);

  const newsItemsListQO = getNewsItemsQueryOptions();

  const newsItemQO = getNewsItemQueryOptions(selectedNewsItemId);

  console.log("selectedNewsItemId", selectedNewsItemId);
  const { data: newsItem } = useQuery(newsItemQO);

  const tagsQO = getTagsQueryOptions();

  const { data: allTags = [] } = useQuery(tagsQO);

  const { mutate: updateNewsItem } = useMutation({
    mutationFn: async (values: FormDataType) => {
      if (!newsItem?.id) return;
      return $updateNewsItem({
        data: {
          id: selectedNewsItemId,
          ...values,
          alert: values.alertRange,
          tags: values.tags,
        },
      });
    },
    onMutate: async (inputValues) => {
      if (!newsItem?.id) return;

      await queryClient.cancelQueries(newsItemQO);
      await queryClient.cancelQueries(newsItemsListQO);

      const prevNewsItem = queryClient.getQueryData(newsItemQO.queryKey);
      const prevNewsListItems = queryClient.getQueryData(
        newsItemsListQO.queryKey,
      );

      const optimisticNewsItem = getOptimisticallyUpdatedNewsValue(
        newsItem,
        inputValues,
        allTags,
      );
      queryClient.setQueryData(newsItemQO.queryKey, optimisticNewsItem);

      queryClient.setQueryData(newsItemsListQO.queryKey, (prev) => {
        if (!prev) return prev;

        return prev.map((item) => {
          if (item.id === newsItem?.id) {
            return optimisticNewsItem;
          }
          return item;
        });
      });

      return { prevNewsListItems, prevNewsItem };
    },
    onError: (_, __, context) => {
      if (context?.prevNewsListItems) {
        queryClient.setQueryData(
          newsItemsListQO.queryKey,
          context.prevNewsListItems,
        );
      }
      if (context?.prevNewsItem) {
        queryClient.setQueryData(newsItemQO.queryKey, context.prevNewsItem);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(newsItemQO);
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
    onMutate: async (inputValues) => {
      await queryClient.cancelQueries(newsItemsListQO);

      const optimisticNewsItem = getOptimisticallyCreatedNewsItem(
        user,
        inputValues,
        allTags,
      );

      queryClient.setQueryData(newsItemsListQO.queryKey, (prev) => {
        if (!prev) return [optimisticNewsItem];
        const newItems = prev.filter(
          (prevItem) => !isDraftNewsItem(prevItem.id),
        );
        return [optimisticNewsItem, ...newItems];
      });
    },
    onSuccess: (newItem) => {
      queryClient.setQueryData(
        getNewsItemQueryOptions(newItem.id).queryKey,
        newItem,
      );
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
      tags: newsItem?.tags.map((t) => t.id) ?? [],
    } as FormDataType,
    onSubmit: ({ value, formApi }) => {
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
    },
  });

  const dirtyLocales = useStore(form.store, (state) => {
    const defaults = form.options.defaultValues as FormDataType;
    return Object.fromEntries(
      i18n.locales.map((loc) => [
        loc,
        state.values.translations[loc]?.title !==
          defaults.translations?.[loc]?.title ||
          state.values.translations[loc]?.content !==
            defaults.translations?.[loc]?.content,
      ]),
    ) as Record<Locale, boolean>;
  });

  return (
    <Card
      caption="Details"
      className={cn("flex h-full flex-1 flex-col", className)}
      containerClassName="flex flex-col flex-1 gap-4"
    >
      {/* Top bar: tags + submit button */}
      <div className="flex items-center justify-end gap-4">
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
              {mode === "create" ? "Create" : "Update"}
            </Button>
          )}
        </form.Subscribe>
      </div>

      <form.AppField name="tags">
        {(field) => (
          <div className="flex items-center gap-2">
            <Label className="flex flex-col gap-2 items-stretch">
              <span>Tags</span>
              <TagPicker
                allTags={allTags}
                selectedTagIds={field.state.value}
                onChange={field.handleChange}
                onCreateTag={createTag}
              />
            </Label>
            <ModifiedTag isModified={field.state.meta.isDirty} />
          </div>
        )}
      </form.AppField>

      {/* Item-level fields */}
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
              isLoading={!newsItem}
              title="Created at:"
              value={newsItem?.createdAt.toLocaleDateString(locale)}
            />
            <TitleValue
              isLoading={!newsItem}
              title="Updated at:"
              value={newsItem?.translations[
                form.state.values.locale
              ]?.updatedAt?.toLocaleDateString()}
            />
            <TitleValue
              isLoading={!newsItem}
              title="Author:"
              value={newsItem?.author.name ?? undefined}
            />
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
              <form.AppField name="alertRange">
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

      {/* Locale tabs */}
      <Tabs
        defaultValue={i18n.defaultLocale}
        onValueChange={(val) => form.setFieldValue("locale", val as Locale)}
        className="flex flex-1 flex-col"
      >
        <TabsList variant="line">
          {i18n.locales.map((loc) => (
            <TabsTrigger key={loc} value={loc} variant="line">
              <TabLabel dirty={dirtyLocales[loc]}>{loc.toUpperCase()}</TabLabel>
            </TabsTrigger>
          ))}
        </TabsList>

        {i18n.locales.map((loc) => (
          <TabsContent key={loc} value={loc} className="flex flex-col gap-4">
            <form.AppField name={`translations.${loc}.title`}>
              {(field) => <field.TextField label="Title" />}
            </form.AppField>
            <form.AppField name={`translations.${loc}.content`}>
              {(field) => {
                const isDirty =
                  field.state.value !==
                  (form.options.defaultValues as FormDataType)?.translations?.[
                    loc
                  ]?.content;
                return (
                  <Suspense fallback={<div>Loading...</div>}>
                    <field.ContentAreaField
                      label={
                        <span className="flex items-center gap-1">
                          Content
                          <ModifiedTag isModified={isDirty} />
                        </span>
                      }
                      assetFolder={
                        newsItem?.id ? `news/${newsItem.id}` : "news"
                      }
                    />
                  </Suspense>
                );
              }}
            </form.AppField>
          </TabsContent>
        ))}
      </Tabs>
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
    if (ids.includes(CREATE_SENTINEL)) {
      const name = inputValue.trim();
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
      <ComboboxChips ref={anchor} className="min-w-48 flex-1">
        {selectedTags.map((tag) => (
          <ComboboxChip key={tag.id}>{tag.name}</ComboboxChip>
        ))}
        <ComboboxChipsInput placeholder="Add tag…" />
      </ComboboxChips>

      <ComboboxContent anchor={anchor} className={"max-w-96"}>
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
  isLoading = false,
}: {
  title: string;
  value: string | undefined;
  isLoading?: boolean;
}) {
  return (
    <p className="flex flex-col items-start gap-2">
      <span className="text-sm leading-none font-medium">{title}</span>
      <span className="text-xs">{isLoading ? <Skeleton /> : value}</span>
    </p>
  );
}
