import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { SkeletonLoading } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n, Locale } from "@/config/i18n-config";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  type ContentItemResponse,
  $publishContentItemDraftTranslation,
  $saveContentItemTranslationDraft,
  getContentQueryOptions,
  getContentsListQueryOptions,
  UpsertContentItemData,
} from "@/serverFunctions/contentItem";
import { waitUntilNoMutations } from "@/utils/mutations";
import {
  useMutation,
  useMutationState,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Loader2, Pencil, Save } from "lucide-react";
import { Suspense, useEffect, useRef } from "react";

type ContentItem = NonNullable<ContentItemResponse>;

type FormMeta = {
  submitAction: "saveDraft" | "publish" | null;
};

const defaultMeta: FormMeta = {
  submitAction: null,
};

type FormData = {
  lang: Locale;
  translation: ContentItem["translations"];
};

export function ContentItemDetails({ id }: { id: string }) {
  const contentItemQO = getContentQueryOptions(id);
  const { data } = useSuspenseQuery(contentItemQO);

  const { mutate: saveDraft } = useSaveDraft(id);

  const { mutateAsync: publishDraft, isPending: isPublishPending } =
    usePublishDraft(id);

  const savingStatuses = useMutationState({
    filters: {
      mutationKey: ["contentId", "draft", id],
    },
    select: (mutation) => mutation.state.status,
  });

  const isPublishing = useRef(false);

  const form = useAppForm({
    defaultValues: {
      lang: i18n.defaultLocale,
      translation: data?.translations || {},
    } as FormData,
    onSubmitMeta: defaultMeta,
    onSubmit: ({ value, meta, formApi }) => {
      if (isPublishing.current) {
        console.log("skipping save");
        return;
      }

      const title = value.translation?.[value.lang]?.draft?.title;
      const content = value.translation?.[value.lang]?.draft?.content;

      switch (meta.submitAction) {
        case "saveDraft":
          // dont save draft if only switched to empty editor
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

        case "publish":
          isPublishing.current = true;
          if (title || content) {
            saveDraft({
              lang: value.lang,
              translationDraft: {
                title: title ?? "",
                content: content ?? "",
              },
            });
          }

          publishDraft({ lang: value.lang })
            .then(() => formApi.reset(value))
            .finally(() => {
              isPublishing.current = false;
            });

          break;
      }
    },
  });

  return (
    <Card
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-col flex-1"
      captionSize={"sm"}
      caption={
        <span className="flex items-center gap-5">
          <span>Details</span>

          <form.AppField name="lang">
            {(field) => <field.LocaleSwitchField />}
          </form.AppField>
        </span>
      }
    >
      <Tabs className="flex-1" defaultValue={DOCUMENT_VERSION_STATUS.PUBLISHED}>
        <TabsList>
          <TabsTrigger
            className="flex items-center gap-2"
            value={DOCUMENT_VERSION_STATUS.DRAFT}
          >
            <Pencil /> <span>Editor</span>
            <div className="w-4">
              {savingStatuses.at(-1) === "pending" && (
                <Loader2 className="size-4 animate-spin" />
              )}
            </div>
          </TabsTrigger>
          <TabsTrigger
            className="flex items-center gap-2"
            value={DOCUMENT_VERSION_STATUS.PUBLISHED}
          >
            <span>Live</span>
            <div className="w-4">
              {isPublishPending && <Loader2 className="size-4 animate-spin" />}
            </div>
          </TabsTrigger>
        </TabsList>
        <TabsContent
          className="flex h-full flex-col gap-2"
          value={DOCUMENT_VERSION_STATUS.DRAFT}
        >
          <form.Subscribe selector={(state) => state.values.lang}>
            {(lang) => {
              return (
                <>
                  <form.AppField
                    name={`translation.${lang}.${DOCUMENT_VERSION_STATUS.DRAFT}.title`}
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
                      name={`translation.${lang}.${DOCUMENT_VERSION_STATUS.DRAFT}.content`}
                      listeners={{
                        onChange: ({ fieldApi }) => {
                          fieldApi.form.handleSubmit({
                            submitAction: "saveDraft",
                          });
                        },
                        onChangeDebounceMs: 800,
                      }}
                    >
                      {(field) => <field.ContentAreaField label="Content" />}
                    </form.AppField>
                  </Suspense>
                </>
              );
            }}
          </form.Subscribe>

          <div className="flex items-center justify-between">
            <Button variant={"outline"}>Reset</Button>
            <div className="flex gap-2">
              <form.Subscribe
                selector={(state) => state.isDirty && state.isValid}
              >
                {(canPublish) => (
                  <Button
                    type="submit"
                    onClick={() =>
                      form.handleSubmit({ submitAction: "publish" })
                    }
                    className="gap-1 self-end"
                    size={"lg"}
                    variant={"accent"}
                    disabled={!canPublish}
                  >
                    <Save className="size-5" />
                    Publish
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </div>
        </TabsContent>
        <TabsContent
          className="flex h-full flex-col gap-2"
          value={DOCUMENT_VERSION_STATUS.PUBLISHED}
        >
          <form.Subscribe selector={(state) => state.values.lang}>
            {(lang) => {
              if (!data.translations[lang]?.published?.content) {
                return <div> No published content</div>;
              }
              const { content } = transformMarkdoc({
                rawContent: data.translations[lang]?.published?.content,
              });

              return <RenderMarkdoc className="mx-auto" content={content} />;
            }}
          </form.Subscribe>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function usePublishDraft(id: string) {
  const contentItemQO = getContentQueryOptions(id);
  const contentsListQO = getContentsListQueryOptions();

  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["contentId", "published", id],
    mutationFn: async ({ lang }: { lang: Locale }) => {
      await waitUntilNoMutations(queryClient, {
        mutationKey: ["contentId", "draft", id],
      });
      return $publishContentItemDraftTranslation({ data: { lang, id } });
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries(contentItemQO);

      const previousContentItem = queryClient.getQueryData(
        contentItemQO.queryKey
      );

      queryClient.setQueryData(contentItemQO.queryKey, (old) => {
        if (!old) {
          return old;
        }

        return {
          ...old,
          translations: {
            ...old.translations,
            [data.lang]: {
              ...old.translations[data.lang],
              published: {
                ...old.translations[data.lang]?.published,
                content: old.translations[data.lang]?.draft?.content,
              },
            },
          },
        };
      });

      await queryClient.cancelQueries(contentsListQO);

      const previousContentsList = queryClient.getQueryData(
        contentsListQO.queryKey
      );

      queryClient.setQueryData(contentsListQO.queryKey, (old) => {
        if (!old) {
          return old;
        }

        return old.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              translations: item.translations.map((tr) => {
                if (tr.lang === data.lang) {
                  // Mark this translation as published
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
  });
}

function useSaveDraft(id: string) {
  const contentItemQO = getContentQueryOptions(id);
  const contentsListQO = getContentsListQueryOptions();

  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["contentId", "draft", id],
    mutationFn: ({
      lang,
      translationDraft,
    }: {
      lang: Locale;
      translationDraft: UpsertContentItemData;
    }) =>
      $saveContentItemTranslationDraft({
        data: {
          id,
          lang,
          translation: translationDraft,
        },
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
            translations: {
              [data.lang]: { draft: data.translationDraft },
            },
          };

        return {
          author: newAuthor,
          translations: {
            ...old.translations,
            [data.lang]: {
              ...old.translations[data.lang],
              draft: data.translationDraft,
            },
          },
        };
      });

      // update list content items query data
      queryClient.setQueryData(contentsListQO.queryKey, (old) => {
        if (!old) {
          return old;
        }

        return old.map((item) => {
          if (item.id === id) {
            return {
              ...item,
              translations: item.translations.map((tr) => {
                if (tr.lang === data.lang) {
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
    onSettled: () => {
      queryClient.invalidateQueries(contentItemQO);
      queryClient.invalidateQueries(contentsListQO);
    },
  });
}
