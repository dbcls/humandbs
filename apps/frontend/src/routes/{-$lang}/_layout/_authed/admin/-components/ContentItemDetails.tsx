import { useStore } from "@tanstack/react-form";
import {
  useMutation,
  useMutationState,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Loader2, Pencil, Save } from "lucide-react";
import { Suspense, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { isFieldModified } from "@/components/form-context/fields/useFieldModified";
import { ModifiedTag } from "@/components/form-context/fields/ModifiedTag";
import { TabLabel } from "@/components/form-context/fields/TabLabel";
import { MarkdownClientPreview } from "@/components/markdown/MarkdownClientPreview";
import { SkeletonLoading } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n, type Locale } from "@/config/i18n";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";
import {
  $publishContentItemDraftTranslation,
  $resetContentItemTranslationDraft,
  $saveContentItemTranslationDraft,
  $unpublishContentItemTranslation,
  $updateContentItemHideTOC,
  getContentQueryOptions,
  getContentsListQueryOptions,
  type ContentItemResponse,
  type UpsertContentItemData,
} from "@/serverFunctions/contentItem";
import { waitUntilNoMutations } from "@/utils/mutations";

import { MarkdownFileActions } from "./MarkdownFileActions";
import { UnpublishedDot } from "./UnpublishedDot";

type ContentItem = NonNullable<ContentItemResponse>;

interface FormMeta {
  submitAction: "saveDraft" | "publish" | "publishAll" | "resetDraft" | null;
}

const defaultMeta: FormMeta = {
  submitAction: null,
};

interface FormData {
  lang: Locale;
  translation: ContentItem["translations"];
}

function normalizeTextValue(value: string | undefined) {
  return value ?? "";
}

function useContentItemDetailsForm({
  initialValues,
  setBaselineTranslation,
  id,
}: {
  initialValues: FormData;
  setBaselineTranslation: React.Dispatch<
    React.SetStateAction<FormData["translation"]>
  >;
  id: string;
}) {
  const { mutate: saveDraft } = useSaveDraft(id);
  const { mutateAsync: publishDraft } = usePublishDraft(id);
  const { mutateAsync: resetDraft } = useResetDraft(id);
  const isIgnoreRef = useRef(false);

  const form = useAppForm({
    defaultValues: initialValues,
    onSubmitMeta: defaultMeta,
    onSubmit: async ({ value, meta, formApi }) => {
      if (isIgnoreRef.current) {
        return;
      }

      const title = value.translation?.[value.lang]?.draft?.title;
      const content = value.translation?.[value.lang]?.draft?.content;

      switch (meta.submitAction) {
        case "saveDraft":
          if (title || content) {
            saveDraft({
              lang: value.lang,
              translationDraft: {
                title: title ?? "",
                content: content ?? "",
              },
            });
          }
          break;

        case "resetDraft":
          isIgnoreRef.current = true;
          try {
            await resetDraft({ lang: value.lang });
            const publishedTitle =
              value.translation?.[value.lang]?.published?.title ?? "";
            const publishedContent =
              value.translation?.[value.lang]?.published?.content ?? "";

            const newTranslation = {
              ...value.translation,
              [value.lang]: {
                ...value.translation[value.lang],
                draft: {
                  title: publishedTitle,
                  content: publishedContent,
                },
              },
            };
            setBaselineTranslation(newTranslation);
            formApi.reset({ ...value, translation: newTranslation });
          } finally {
            isIgnoreRef.current = false;
          }
          break;

        case "publish": {
          isIgnoreRef.current = true;
          if (title || content) {
            saveDraft({
              lang: value.lang,
              translationDraft: {
                title: title ?? "",
                content: content ?? "",
              },
            });
          }

          try {
            await publishDraft({ lang: value.lang });

            const newTranslation = {
              ...value.translation,
              [value.lang]: {
                ...value.translation[value.lang],
                published: {
                  title: title ?? "",
                  content: content ?? "",
                  status: "published" as const,
                  updatedAt: new Date(),
                },
              },
            };
            setBaselineTranslation(newTranslation);
            formApi.reset({ ...value, translation: newTranslation });
          } finally {
            isIgnoreRef.current = false;
          }
          break;
        }

        case "publishAll": {
          isIgnoreRef.current = true;
          const dirtyLocs = i18n.locales.filter((loc) => {
            const draft = value.translation[loc]?.draft;
            const published = value.translation[loc]?.published;
            return (
              normalizeTextValue(draft?.content) !==
                normalizeTextValue(published?.content) ||
              normalizeTextValue(draft?.title) !==
                normalizeTextValue(published?.title)
            );
          });

          Promise.all(
            dirtyLocs.map(async (loc) => {
              const locTitle = value.translation[loc]?.draft?.title ?? "";
              const locContent = value.translation[loc]?.draft?.content ?? "";
              if (locTitle || locContent) {
                saveDraft({
                  lang: loc,
                  translationDraft: { title: locTitle, content: locContent },
                });
              }
              await publishDraft({ lang: loc });
              return { loc, locTitle, locContent };
            }),
          )
            .then((results) => {
              const newTranslation = { ...value.translation };
              for (const { loc, locTitle, locContent } of results) {
                newTranslation[loc] = {
                  ...newTranslation[loc],
                  published: {
                    title: locTitle,
                    content: locContent,
                    status: "published" as const,
                    updatedAt: new Date(),
                  },
                };
              }
              setBaselineTranslation(newTranslation);
              formApi.reset({ ...value, translation: newTranslation });
            })
            .finally(() => {
              isIgnoreRef.current = false;
            })
            .catch(() => {
              formApi.reset();
            });
          break;
        }
      }
    },
  });
  return form;
}

export const ContentItemDetails = ({ id }: { id: string }) => {
  const contentItemQO = getContentQueryOptions(id);
  const { data } = useSuspenseQuery(contentItemQO);

  const savingStatuses = useMutationState({
    filters: {
      mutationKey: ["content", "draft", id, "save"],
    },
    select: (mutation) => mutation.state.status,
  });

  const { isPending: isPublishPending } = usePublishDraft(id);
  const { mutate: unpublishDraft, isPending: isUnpublishPending } =
    useUnpublishDraft(id);

  const [baselineTranslation, setBaselineTranslation] = useState(
    () => data.translations,
  );

  const form = useContentItemDetailsForm({
    initialValues: {
      lang: i18n.defaultLocale,
      translation: baselineTranslation,
    },
    setBaselineTranslation,
    id,
  });

  const dirtyLocales = useStore(
    form.store,
    (state) =>
      Object.fromEntries(
        i18n.locales.map((loc) => {
          const draft = state.values.translation[loc]?.draft;
          const published = state.values.translation[loc]?.published;
          const changed =
            state.isValid &&
            (normalizeTextValue(draft?.content) !==
              normalizeTextValue(published?.content) ||
              normalizeTextValue(draft?.title) !==
                normalizeTextValue(published?.title));
          return [loc, changed];
        }),
      ) as Record<Locale, boolean>,
  );

  const anyDirty = Object.values(dirtyLocales).some(Boolean);

  return (
    <Card
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-col flex-1"
      captionSize={"sm"}
      caption={
        <span className="flex items-center gap-5">
          <span>Details</span>
          <Suspense>
            <ShowTOCCheckbox id={id} />
          </Suspense>
        </span>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Tabs
          defaultValue={i18n.defaultLocale}
          onValueChange={(val) => form.setFieldValue("lang", val as Locale)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex items-center justify-end gap-2 pb-1">
            <form.Subscribe selector={(state) => state.values.lang}>
              {(lang) => (
                <Button
                  variant="outline"
                  size="lg"
                  disabled={!dirtyLocales[lang]}
                  onClick={() =>
                    form.handleSubmit({ submitAction: "resetDraft" })
                  }
                >
                  Reset
                </Button>
              )}
            </form.Subscribe>

            <Button
              type="submit"
              size="lg"
              variant="accent"
              disabled={!anyDirty || isPublishPending}
              onClick={() => form.handleSubmit({ submitAction: "publishAll" })}
              className="gap-1"
            >
              {isPublishPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-5" />
              )}
              Publish
            </Button>
          </div>

          <TabsList variant="line">
            {i18n.locales.map((loc) => (
              <TabsTrigger key={loc} value={loc} variant="line">
                <TabLabel dirty={dirtyLocales[loc]}>
                  {loc.toUpperCase()}
                </TabLabel>
              </TabsTrigger>
            ))}
          </TabsList>

          {i18n.locales.map((loc) => (
            <TabsContent
              key={loc}
              value={loc}
              className="flex min-h-0 flex-1 flex-col"
            >
              <Tabs
                className="flex min-h-0 flex-1 flex-col"
                defaultValue={DOCUMENT_VERSION_STATUS.PUBLISHED}
              >
                <TabsList variant="line">
                  <TabsTrigger
                    variant="line"
                    className="flex items-center gap-2"
                    value={DOCUMENT_VERSION_STATUS.DRAFT}
                  >
                    <Pencil /> <span>Editor</span>
                    {dirtyLocales[loc] && <UnpublishedDot />}
                    <div className="w-4">
                      {savingStatuses.at(-1) === "pending" && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                    </div>
                  </TabsTrigger>
                  <TabsTrigger
                    variant="line"
                    className="flex items-center gap-2"
                    value={DOCUMENT_VERSION_STATUS.PUBLISHED}
                  >
                    <span>Live</span>
                    <div className="w-4">
                      {(isPublishPending || isUnpublishPending) && (
                        <Loader2 className="size-4 animate-spin" />
                      )}
                    </div>
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  className="flex min-h-0 flex-1 flex-col gap-2"
                  value={DOCUMENT_VERSION_STATUS.DRAFT}
                >
                  <form.Subscribe
                    selector={(state) => ({
                      draftContent:
                        state.values.translation[loc]?.draft?.content ?? "",
                      draftTitle:
                        state.values.translation[loc]?.draft?.title ?? "",
                    })}
                  >
                    {({ draftContent, draftTitle }) => (
                      <MarkdownFileActions
                        filename={`${id}-${loc}`}
                        content={draftContent}
                        title={draftTitle}
                        lang={loc}
                        onUpload={(text, uploadedTitle) => {
                          form.setFieldValue(
                            `translation.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.content`,
                            text,
                          );
                          if (uploadedTitle !== undefined) {
                            form.setFieldValue(
                              `translation.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.title`,
                              uploadedTitle,
                            );
                          }
                          form.handleSubmit({ submitAction: "saveDraft" });
                        }}
                      />
                    )}
                  </form.Subscribe>
                  <form.AppField
                    name={`translation.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.title`}
                    listeners={{
                      onChange: ({ fieldApi }) => {
                        fieldApi.form.handleSubmit({
                          submitAction: "saveDraft",
                        });
                      },
                      onChangeDebounceMs: 800,
                    }}
                  >
                    {(field) => <field.TextField label="Title" />}
                  </form.AppField>
                  <Suspense fallback={<SkeletonLoading />}>
                    <form.AppField
                      name={`translation.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.content`}
                      listeners={{
                        onChange: ({ fieldApi }) => {
                          fieldApi.form.handleSubmit({
                            submitAction: "saveDraft",
                          });
                        },
                        onChangeDebounceMs: 800,
                      }}
                    >
                      {(field) => {
                        const isModified = isFieldModified(field);
                        return (
                          <field.ContentAreaField
                            label={
                              <span className="flex items-center gap-1">
                                Content
                                <ModifiedTag isModified={isModified} />
                              </span>
                            }
                            assetFolder={id}
                          />
                        );
                      }}
                    </form.AppField>
                  </Suspense>
                </TabsContent>

                <TabsContent
                  className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
                  value={DOCUMENT_VERSION_STATUS.PUBLISHED}
                >
                  {!data.translations[loc]?.published?.content ? (
                    <div>No published content</div>
                  ) : (
                    <>
                      <div className="border-foreground-light flex justify-end border-b pb-2">
                        <Button
                          variant={"outline"}
                          size={"lg"}
                          onClick={() => unpublishDraft({ lang: loc })}
                          disabled={isUnpublishPending}
                        >
                          Unpublish
                        </Button>
                      </div>
                      <MarkdownClientPreview
                        source={data.translations[loc]?.published?.content}
                      />
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Card>
  );
};

function ShowTOCCheckbox({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const contentItemQO = getContentQueryOptions(id);
  const { data } = useSuspenseQuery(contentItemQO);

  const { mutate: updateHideTOC, isPending } = useMutation({
    mutationFn: (hideTOC: boolean) =>
      $updateContentItemHideTOC({ data: { id, hideTOC } }),
    onMutate: async (hideTOC) => {
      await queryClient.cancelQueries(contentItemQO);
      const prev = queryClient.getQueryData(contentItemQO.queryKey);
      queryClient.setQueryData(
        contentItemQO.queryKey,
        (old: typeof data | undefined) => (old ? { ...old, hideTOC } : old),
      );
      return { prev };
    },
    onError: (_, __, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(contentItemQO.queryKey, context.prev);
      }
    },
    onSettled: () => queryClient.invalidateQueries(contentItemQO),
  });

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="show-toc-content"
        checked={!(data?.hideTOC ?? true)}
        disabled={isPending}
        onCheckedChange={(checked) => updateHideTOC(!checked)}
      />
      <Label htmlFor="show-toc-content" className="cursor-pointer font-normal">
        Show table of contents
      </Label>
    </div>
  );
}

function usePublishDraft(id: string) {
  const contentItemQO = getContentQueryOptions(id);
  const contentsListQO = getContentsListQueryOptions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["content", "published", id, "publish"],
    mutationFn: async ({ lang }: { lang: Locale }) => {
      await waitUntilNoMutations(queryClient, {
        mutationKey: ["content", "draft", id, "save"],
      });
      return $publishContentItemDraftTranslation({ data: { lang, id } });
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries(contentItemQO);

      const previousContentItem = queryClient.getQueryData(
        contentItemQO.queryKey,
      );

      queryClient.setQueryData(contentItemQO.queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          translations: {
            ...old.translations,
            [data.lang]: {
              ...old.translations[data.lang],
              published: {
                status: "published",
                updatedAt: new Date(),
                title: old.translations[data.lang]?.draft?.title,
                content: old.translations[data.lang]?.draft?.content,
              },
            },
          },
        };
      });

      await queryClient.cancelQueries(contentsListQO);

      const previousContentsList = queryClient.getQueryData(
        contentsListQO.queryKey,
      );

      queryClient.setQueryData(contentsListQO.queryKey, (old) => {
        if (!old) return old;
        return old.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              translations: item.translations.map((tr) => {
                if (tr.lang === data.lang) {
                  return {
                    ...tr,
                    status: DOCUMENT_VERSION_STATUS.PUBLISHED,
                  };
                }
                return tr;
              }),
            };
          }
          return item;
        });
      });

      return { previousContentItem, previousContentsList };
    },
    onError: (_, __, context) => {
      if (context?.previousContentItem) {
        queryClient.setQueryData(
          contentItemQO.queryKey,
          context.previousContentItem,
        );
      }
      if (context?.previousContentsList) {
        queryClient.setQueryData(
          contentsListQO.queryKey,
          context.previousContentsList,
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(contentItemQO);
      await queryClient.invalidateQueries(contentsListQO);
    },
  });
}

function useSaveDraft(id: string) {
  const contentItemQO = getContentQueryOptions(id);
  const contentsListQO = getContentsListQueryOptions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["content", "draft", id, "save"],
    mutationFn: ({
      lang,
      translationDraft,
    }: {
      lang: Locale;
      translationDraft: UpsertContentItemData;
    }) =>
      $saveContentItemTranslationDraft({
        data: { id, lang, translation: translationDraft },
      }),

    onMutate: async (data) => {
      await queryClient.cancelQueries(contentItemQO);

      const prevContent = queryClient.getQueryData(contentItemQO.queryKey);
      const prevList = queryClient.getQueryData(contentsListQO.queryKey);

      queryClient.setQueryData(contentItemQO.queryKey, (old) => {
        const newAuthor = { name: "", email: "" };
        if (!old)
          return {
            author: newAuthor,
            hideTOC: true,
            translations: {
              [data.lang]: { draft: data.translationDraft },
            },
          };

        return {
          author: newAuthor,
          hideTOC: old.hideTOC,
          translations: {
            ...old.translations,
            [data.lang]: {
              ...old.translations[data.lang],
              draft: data.translationDraft,
            },
          },
        };
      });

      queryClient.setQueryData(contentsListQO.queryKey, (old) => {
        if (!old) return old;
        return old.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              translations: item.translations.map((tr) => {
                if (tr.lang === data.lang && tr.statuses.draft) {
                  return { ...tr, ...data.translationDraft };
                }
                return tr;
              }),
            };
          }
          return item;
        });
      });

      return { prevContent, prevList };
    },

    onError: (_, __, context) => {
      if (context?.prevContent) {
        queryClient.setQueryData(contentItemQO.queryKey, context.prevContent);
      }
      if (context?.prevList) {
        queryClient.setQueryData(contentsListQO.queryKey, context.prevList);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(contentItemQO);
      await queryClient.invalidateQueries(contentsListQO);
    },
  });
}

function useUnpublishDraft(id: string) {
  const contentItemQO = getContentQueryOptions(id);
  const contentsListQO = getContentsListQueryOptions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["content", "published", id, "unpublish"],
    mutationFn: ({ lang }: { lang: Locale }) =>
      $unpublishContentItemTranslation({ data: { id, lang } }),
    onMutate: async (data) => {
      await queryClient.cancelQueries(contentItemQO);
      await queryClient.cancelQueries(contentsListQO);

      const previousContentItem = queryClient.getQueryData(
        contentItemQO.queryKey,
      );
      const previousContentsList = queryClient.getQueryData(
        contentsListQO.queryKey,
      );

      queryClient.setQueryData(contentItemQO.queryKey, (old) => {
        if (!old) return old;
        const localeData = old.translations[data.lang];
        return {
          ...old,
          translations: {
            ...old.translations,
            [data.lang]: {
              ...localeData,
              draft: localeData?.draft ?? localeData?.published,
              published: undefined,
            },
          },
        };
      });

      queryClient.setQueryData(contentsListQO.queryKey, (old) => {
        if (!old) return old;
        return old.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            translations: item.translations.map((tr) => {
              if (tr.lang !== data.lang) return tr;
              const { published, ...withoutPublished } = tr.statuses;
              return {
                ...tr,
                statuses: {
                  ...("draft" in tr.statuses ? {} : { draft: published }),
                  ...withoutPublished,
                },
              };
            }),
          };
        });
      });

      return { previousContentItem, previousContentsList };
    },
    onError: (_, __, context) => {
      if (context?.previousContentItem) {
        queryClient.setQueryData(
          contentItemQO.queryKey,
          context.previousContentItem,
        );
      }
      if (context?.previousContentsList) {
        queryClient.setQueryData(
          contentsListQO.queryKey,
          context.previousContentsList,
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(contentItemQO);
      await queryClient.invalidateQueries(contentsListQO);
    },
  });
}

function useResetDraft(id: string) {
  const contentItemQO = getContentQueryOptions(id);
  const contentsListQO = getContentsListQueryOptions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["content", "draft", id, "reset"],
    mutationFn: ({ lang }: { lang: Locale }) =>
      $resetContentItemTranslationDraft({ data: { id, lang } }),
    onMutate: async ({ lang }) => {
      await queryClient.cancelQueries(contentItemQO);
      await queryClient.cancelQueries(contentsListQO);

      const prevContent = queryClient.getQueryData(contentItemQO.queryKey);
      const prevList = queryClient.getQueryData(contentsListQO.queryKey);

      queryClient.setQueryData(contentItemQO.queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          translations: {
            ...old.translations,
            [lang]: {
              ...old.translations[lang],
              draft: {
                title: old.translations[lang]?.published?.title ?? "",
                content: old.translations[lang]?.published?.content ?? "",
              },
            },
          },
        };
      });

      queryClient.setQueryData(contentsListQO.queryKey, (old) => {
        if (!old) return old;
        return old.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              translations: item.translations.map((tr) => {
                if (tr.lang === lang && tr.statuses.draft) {
                  return { ...tr, status: DOCUMENT_VERSION_STATUS.PUBLISHED };
                }
                return tr;
              }),
            };
          }
          return item;
        });
      });

      return { prevContent, prevList };
    },

    onError: (_, __, context) => {
      if (context?.prevContent) {
        queryClient.setQueryData(contentItemQO.queryKey, context.prevContent);
      }
      if (context?.prevList) {
        queryClient.setQueryData(contentsListQO.queryKey, context.prevList);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(contentItemQO);
      await queryClient.invalidateQueries(contentsListQO);
    },
  });
}
