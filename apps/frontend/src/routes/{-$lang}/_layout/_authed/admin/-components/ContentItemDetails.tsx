import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n, Locale } from "@/config/i18n-config";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  type ContentItemResponse,
  $saveContentItemTranslationDraft,
  getContentQueryOptions,
  getContentsListQueryOptions,
  UpsertContentItemData,
} from "@/serverFunctions/contentItem";
import {
  useMutation,
  useMutationState,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Pencil, Save } from "lucide-react";
import { useEffect } from "react";

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

  const savingStatuses = useMutationState({
    filters: {
      mutationKey: ["contentId", "draft", id],
    },
    select: (mutation) => mutation.state.status,
  });

  const form = useAppForm({
    defaultValues: {
      lang: i18n.defaultLocale,
      translation: data?.translations || {},
    } as FormData,
    onSubmitMeta: defaultMeta,
    onSubmit: ({ value, meta }) => {
      switch (meta.submitAction) {
        case "saveDraft":
          // dont save draft if only switched to empty editor
          if (
            !value.translation?.[value.lang]?.draft?.title &&
            !value.translation?.[value.lang]?.draft?.content
          ) {
            return;
          }
          saveDraft({
            lang: value.lang,
            translationDraft: {
              title: value.translation?.[value.lang]?.draft?.title ?? "",
              content: value.translation?.[value.lang]?.draft?.content ?? "",
            },
          });
          break;

        case "publish":
          // TODO
          console.log("publish handling here...");
          (() => {})();
          break;
      }
    },

    listeners: {
      onChangeDebounceMs: 800,
    },
  });

  useEffect(() => {
    form.reset();
  }, [id]);

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
          {/*<form.Subscribe selector={(state) => state.values.locale}>
            {(locale) => (
              <form.AppField name="status">
                {(field) => (
                  <Tabs>
                    <TabsList>
                      {Object.keys(data.translations[locale] || {}).map(
                        (status) => (
                          <TabsTrigger key={status} value={status}>
                            {status}
                          </TabsTrigger>
                        )
                      )}
                    </TabsList>
                  </Tabs>
                )}
              </form.AppField>
            )}
          </form.Subscribe>*/}
        </span>
      }
    >
      <Tabs className="flex-1" defaultValue={DOCUMENT_VERSION_STATUS.PUBLISHED}>
        <TabsList>
          <TabsTrigger value={DOCUMENT_VERSION_STATUS.DRAFT}>
            <Pencil /> Editor
          </TabsTrigger>
          <TabsTrigger value={DOCUMENT_VERSION_STATUS.PUBLISHED}>
            Live
          </TabsTrigger>
        </TabsList>
        <TabsContent
          className="flex h-full flex-col gap-2"
          value={DOCUMENT_VERSION_STATUS.DRAFT}
        >
          <div>{savingStatuses.at(-1)}</div>
          <form.Subscribe selector={(state) => state.values.lang}>
            {(lang) => {
              return (
                <>
                  <form.AppField
                    name={`translation.${lang}.${DOCUMENT_VERSION_STATUS.DRAFT}.title`}
                    listeners={{
                      onChange: ({ fieldApi }) => {
                        console.log("change");
                        fieldApi.form.handleSubmit({
                          submitAction: "saveDraft",
                        });
                      },
                      onChangeDebounceMs: 800,
                    }}
                  >
                    {(field) => <field.TextField label="Title" />}
                  </form.AppField>
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
                </>
              );
            }}
          </form.Subscribe>

          <div className="flex items-center justify-between">
            <Button variant={"outline"}>Reset</Button>
            <div className="flex gap-2">
              <Button
                type="submit"
                onClick={form.handleSubmit}
                className="gap-1 self-end"
                size={"lg"}
                variant={"accent"}
              >
                <Save className="size-5" />
                Publish
              </Button>
              {/*<Button
                type="submit"
                onClick={form.handleSubmit}
                className="gap-1 self-end"
                size={"lg"}
                variant={"action"}
              >
                <Save className="size-5" />
                Save draft
              </Button>*/}
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
              return (
                <RenderMarkdoc
                  className="mx-auto"
                  content={data.translations[lang].published.content}
                />
              );
            }}
          </form.Subscribe>
        </TabsContent>
      </Tabs>
    </Card>
  );
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
          return [
            {
              id: "",
              translations: [{ lang: data.lang, ...data.translationDraft }],
            },
          ];
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
