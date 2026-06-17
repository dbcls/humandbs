import { useStore, uuid } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import type { Locale } from "use-intl";
import { useTranslations } from "use-intl";

import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { ModifiedTag } from "@/components/form-context/fields/ModifiedTag";
import { TabLabel } from "@/components/form-context/fields/TabLabel";
import { isFieldModified } from "@/components/form-context/fields/useFieldModified";
import { SkeletonLoading } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n } from "@/config/i18n";
import { cn } from "@/lib/utils";
import type { DocumentListItemTranslation } from "@/repositories/document";
import type { NewsItemRecord, NewsTag } from "@/repositories/newsItem";
import type { NewsItemDetailResponse, NewsItemResponse } from "@/serverFunctions/news";
import {
  $createNewsItem,
  $createTag,
  $updateNewsItem,
  getNewsItemQueryOptions,
  getTagsQueryOptions,
} from "@/serverFunctions/news";
import { toDateString } from "@/utils/dates";
import type { SessionUser } from "@/utils/jwt-helpers";

import { DRAFT_NEWS_ID, isDraftNewsItem } from "./draftNewsItem";
import { TitleValue } from "./TitleValue";

interface FormDataType {
  translations: Record<Locale, { title: string; content: string }>;
  locale: Locale;
  publishedAt: Date | null;
  tags: string[];
}

function newsItemRecordToListTranslations(
  translations: NewsItemRecord["translations"],
): DocumentListItemTranslation[] {
  return Object.entries(translations)
    .filter(
      (entry): entry is [string, NonNullable<(typeof translations)[keyof typeof translations]>] =>
        !!entry[1],
    )
    .map(([lang, tr]) => ({
      status: "published" as const,
      lang: lang as Locale,
      title: tr.title,
      hasUnpublishedChanges: false,
    }))
    .sort((a, b) => {
      if (a.lang === i18n.defaultLocale) return -1;
      if (b.lang === i18n.defaultLocale) return 1;
      return a.lang.localeCompare(b.lang);
    });
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
    tags: formValues.tags
      .map((id) => allTags.find((t) => t.id === id))
      .filter((t): t is NewsTag => !!t),
    translations: Object.entries(newsItem?.translations || {}).reduce<
      NewsItemRecord["translations"]
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
    tags: formValues.tags
      .map((id) => allTags.find((t) => t.id === id))
      .filter((t): t is NewsTag => !!t),
  };
}

export function NewsItemContent({
  selectedNewsItemId,
  className,
  onSelectNewsItemId,
}: {
  selectedNewsItemId: string;
  className?: string;
  onSelectNewsItemId: (id: string) => void;
}) {
  const newsItemQO = getNewsItemQueryOptions(selectedNewsItemId);
  const { data: fetchedNewsItem } = useQuery(newsItemQO);

  if (!fetchedNewsItem) {
    return (
      <Card
        caption="Details"
        className={cn("flex h-full flex-1 flex-col", className)}
        containerClassName="flex flex-col flex-1 gap-4"
      >
        <SkeletonLoading />
      </Card>
    );
  }

  return (
    <NewsItemForm
      key={fetchedNewsItem.id}
      newsItem={fetchedNewsItem}
      className={className}
      onSelectNewsItemId={onSelectNewsItemId}
    />
  );
}

function NewsItemForm({
  newsItem,
  className,
  onSelectNewsItemId,
}: {
  newsItem: NewsItemDetailResponse;
  className?: string;
  onSelectNewsItemId: (id: string) => void;
}) {
  const t = useTranslations("common");
  const { user } = useRouteContext({ from: "__root__" });
  const mode = isDraftNewsItem(newsItem.id) ? "create" : "update";

  const queryClient = useQueryClient();

  const newsItemQO = getNewsItemQueryOptions(newsItem.id);

  const tagsQO = getTagsQueryOptions();

  const { data: allTags = [] } = useQuery(tagsQO);

  const newsListQueryFilter = { queryKey: ["news", "items"] };

  type NewsListData = { pages: NewsItemResponse[][]; pageParams: number[] };

  const { mutate: updateNewsItem } = useMutation({
    mutationFn: async ({
      values,
    }: {
      values: FormDataType;
      formApi: { reset: (values?: FormDataType) => void };
    }) => {
      console.log("updating news item", values);
      return $updateNewsItem({
        data: {
          id: newsItem.id,
          ...values,
          tags: values.tags,
        },
      });
    },
    onMutate: async ({ values: inputValues }) => {
      if (!newsItem?.id) return;

      await queryClient.cancelQueries(newsItemQO);
      await queryClient.cancelQueries(newsListQueryFilter);

      const prevNewsItem = queryClient.getQueryData(newsItemQO.queryKey);
      const prevNewsListEntries = queryClient.getQueriesData<NewsListData>(newsListQueryFilter);

      const optimisticNewsItem = getOptimisticallyUpdatedNewsValue(newsItem, inputValues, allTags);
      queryClient.setQueryData(newsItemQO.queryKey, optimisticNewsItem);

      const optimisticListItem = {
        ...optimisticNewsItem,
        translations: newsItemRecordToListTranslations(optimisticNewsItem.translations),
      };

      queryClient.setQueriesData<NewsListData>(newsListQueryFilter, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) =>
            page.map((item) => (item.id === newsItem.id ? optimisticListItem : item)),
          ),
        };
      });

      return { prevNewsListEntries, prevNewsItem };
    },
    onSuccess: (_, { values, formApi }) => {
      formApi.reset(values);
    },
    onError: (_, __, context) => {
      if (context?.prevNewsListEntries) {
        for (const [queryKey, data] of context.prevNewsListEntries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.prevNewsItem) {
        queryClient.setQueryData(newsItemQO.queryKey, context.prevNewsItem);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(newsItemQO);
      queryClient.invalidateQueries(newsListQueryFilter);
    },
  });

  const { mutate: createNewsItem } = useMutation({
    mutationFn: async (values: FormDataType) => {
      return $createNewsItem({
        data: {
          publishedAt: values.publishedAt,
          translations: values.translations,
          tags: values.tags,
        },
      });
    },
    onMutate: async (inputValues) => {
      await queryClient.cancelQueries(newsListQueryFilter);

      const prevNewsListEntries = queryClient.getQueriesData<NewsListData>(newsListQueryFilter);

      const optimisticNewsItem = getOptimisticallyCreatedNewsItem(user, inputValues, allTags);

      const optimisticListItem = {
        ...optimisticNewsItem,
        translations: newsItemRecordToListTranslations(optimisticNewsItem.translations),
      };

      queryClient.setQueriesData<NewsListData>(newsListQueryFilter, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) =>
            page.map((item) => (isDraftNewsItem(item.id) ? optimisticListItem : item)),
          ),
        };
      });

      queryClient.setQueryData(
        getNewsItemQueryOptions(optimisticNewsItem.id).queryKey,
        optimisticNewsItem,
      );

      onSelectNewsItemId(optimisticNewsItem.id);

      return { prevNewsListEntries };
    },
    onSuccess: (newItem) => {
      queryClient.setQueryData(getNewsItemQueryOptions(newItem.id).queryKey, newItem);
      onSelectNewsItemId(newItem.id);
    },
    onError: (_, __, context) => {
      if (context?.prevNewsListEntries) {
        for (const [queryKey, data] of context.prevNewsListEntries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      onSelectNewsItemId(DRAFT_NEWS_ID);
    },
    onSettled: () => {
      queryClient.invalidateQueries(newsListQueryFilter);
    },
  });

  const form = useAppForm({
    defaultValues: {
      translations: newsItem.translations,
      locale: i18n.defaultLocale,
      publishedAt: newsItem.publishedAt,
      tags: newsItem.tags?.map((t) => t.id) ?? [],
    } as FormDataType,
    validators: {
      onChange: ({ value }) => {
        const incompleteLocales = i18n.locales.filter((loc) => {
          const tr = value.translations[loc];
          const hasTitle = !!tr?.title?.trim();
          const hasContent = !!tr?.content?.trim();
          return hasTitle !== hasContent;
        });

        if (incompleteLocales.length === 0) return undefined;

        return {
          form: `Both title and content are required for: ${incompleteLocales
            .map((loc) => loc.toUpperCase())
            .join(", ")}`,
          fields: Object.fromEntries(
            incompleteLocales.flatMap((loc) => {
              const tr = value.translations[loc];
              const message = "Title and content must both be filled";
              return [
                !tr?.title?.trim() ? [`translations.${loc}.title`, message] : null,
                !tr?.content?.trim() ? [`translations.${loc}.content`, message] : null,
              ].filter((entry): entry is [string, string] => entry !== null);
            }),
          ),
        };
      },
    },
    onSubmit: ({ value, formApi }) => {
      if (mode === "create") {
        createNewsItem(value);
      } else {
        updateNewsItem({ values: value, formApi });
      }
    },
  });

  const { mutateAsync: createTag } = useMutation({
    mutationFn: (name: string) => $createTag({ data: { name } }),
    onSuccess: (newTag) => {
      queryClient.setQueryData(tagsQO.queryKey, (prev: NewsTag[] = []) => [...prev, newTag]);
      form.setFieldValue("tags", [...form.state.values.tags, newTag.id]);
    },
  });

  const dirtyLocales = useStore(form.store, (state) => {
    return Object.fromEntries(
      i18n.locales.map((loc) => [
        loc,
        state.fieldMeta[`translations.${loc}.title`]?.isDirty ||
          state.fieldMeta[`translations.${loc}.content`]?.isDirty,
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
          selector={(state) => ({
            isSubmitting: state.isSubmitting,
            isTouched: state.isTouched,
            isValid: state.isValid,
            formError: state.errorMap.onChange as string | undefined,
          })}
        >
          {({ isSubmitting, isTouched, isValid, formError }) => (
            <>
              {isTouched && formError && (
                <em role="alert" className="text-danger text-xs not-italic">
                  {formError}
                </em>
              )}
              <Button
                disabled={isSubmitting || !isTouched || !isValid}
                size="lg"
                onClick={() => form.handleSubmit()}
              >
                {mode === "create" ? "Create" : "Update"}
              </Button>
            </>
          )}
        </form.Subscribe>
      </div>

      <form.AppField name="tags">
        {(field) => {
          const isModified = isFieldModified(field);
          return (
            <div className="flex items-center gap-2">
              <Label className="flex flex-col items-stretch gap-2">
                <span>Tags</span>
                <TagPicker
                  allTags={allTags}
                  selectedTagIds={field.state.value}
                  onChange={field.handleChange}
                  onCreateTag={createTag}
                />
              </Label>
              <ModifiedTag isModified={isModified} />
            </div>
          );
        }}
      </form.AppField>

      {/* Item-level fields */}
      <div className="flex items-start gap-6">
        <form.AppField name="publishedAt">
          {(field) => (
            <Suspense fallback={<div>Loading...</div>}>
              <field.DateTimeField label={t("published-at")} />
            </Suspense>
          )}
        </form.AppField>

        {mode === "update" && (
          <>
            <TitleValue title={t("created-at")} value={toDateString(newsItem.createdAt)} />
            <TitleValue
              title={t("updated-at")}
              value={toDateString(
                newsItem.translations[form.state.values.locale]?.updatedAt ?? undefined,
              )}
            />
            <TitleValue title={t("author")} value={newsItem.author.name ?? undefined} />
          </>
        )}
      </div>

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
                const isDirty = isFieldModified(field);
                return (
                  <Suspense fallback={<div>Loading...</div>}>
                    <field.ContentAreaField
                      label={
                        <span className="flex items-center gap-1">
                          Content
                          <ModifiedTag isModified={isDirty} />
                        </span>
                      }
                      assetFolder={newsItem.id ? `news/${newsItem.id}` : "news"}
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
  const hasExactMatch = allTags.some((t) => t.name.toLowerCase() === inputValue.toLowerCase());
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
          {filteredTags.length === 0 && !showCreate && <ComboboxEmpty>No tags found</ComboboxEmpty>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
