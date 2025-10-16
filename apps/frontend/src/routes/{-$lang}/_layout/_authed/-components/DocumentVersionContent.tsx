import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { Button } from "@/components/ui/button";
import {
  DOCUMENT_VERSION_STATUS,
  DocumentVersionTranslation,
} from "@/db/schema";
import { i18n, Locale } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";
import {
  $deleteDocumentVersionDraft,
  $publishDocumentVersionDraft,
  $saveDocumentVersion,
  type DocumentVersionListItemResponse,
  getDocumentVersionDraftQueryOptions,
  getDocumentVersionPublishedQueryOptions,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Trash2, Undo2 } from "lucide-react";
import { Suspense, useEffect } from "react";
import { StatusTag } from "./StatusTag";

type FormMeta = {
  submitAction:
    | "saveDraft"
    | "publishDraft"
    | "updatePublished"
    | "saveAsDraft"
    | null;
};

const defaultMeta: FormMeta = {
  submitAction: null,
};

type Status = "draft" | "published";

type FormData = {
  translations: {
    [status in Status]: Record<
      Locale,
      Pick<DocumentVersionTranslation, "title" | "content">
    >;
  };
  status: Status;
  locale: Locale;
};

export function DocumentVersionContent({
  documentVersionItem,
  className,
}: {
  documentVersionItem: DocumentVersionListItemResponse;
  className?: string;
}) {
  const documentVersionsListQO =
    getDocumentVersionsListQueryOptions(documentVersionItem);

  const documentVersionDraftQO =
    getDocumentVersionDraftQueryOptions(documentVersionItem);

  const documentVersionPublishedQO =
    getDocumentVersionPublishedQueryOptions(documentVersionItem);

  const queryClient = useQueryClient();

  const { data: documentVersionDraft } = useQuery(documentVersionDraftQO);
  const { data: documentVersionPublished } = useQuery(
    documentVersionPublishedQO
  );

  const { mutate: saveVersion } = useMutation({
    mutationFn: ({
      translations,
      action,
    }: {
      translations: FormData["translations"][keyof FormData["translations"]];
      action: Exclude<FormMeta["submitAction"], "publishDraft">;
    }) => {
      if (!action) throw new Error("Invalid submit action");

      if (action === "updatePublished") {
        return $saveDocumentVersion({
          data: {
            translations,
            versionNumber: documentVersionItem.versionNumber,
            contentId: documentVersionItem.contentId,
            status: DOCUMENT_VERSION_STATUS.PUBLISHED,
          },
        });
      }

      return $saveDocumentVersion({
        data: {
          translations,
          contentId: documentVersionItem.contentId,
          versionNumber: documentVersionItem.versionNumber,
          status: DOCUMENT_VERSION_STATUS.DRAFT,
        },
      });
    },
    onMutate: async ({ translations, action }) => {
      await queryClient.cancelQueries(documentVersionDraftQO);
      await queryClient.cancelQueries(documentVersionPublishedQO);
      await queryClient.cancelQueries(documentVersionsListQO);

      const prevDocumentVersionsList = queryClient.getQueryData(
        documentVersionsListQO.queryKey
      );

      const prevDocumentVersionDraft = queryClient.getQueryData(
        documentVersionDraftQO.queryKey
      );
      const prevDocumentVersionPublished = queryClient.getQueryData(
        documentVersionPublishedQO.queryKey
      );

      switch (action) {
        case "saveAsDraft":
          {
            // optimistically set draft as input `version`, reset the `published` back
            queryClient.setQueryData(
              documentVersionDraftQO.queryKey,
              (prev) => {
                if (!prev) return prev;

                return {
                  ...prev,
                  translations: Object.assign(prev.translations, translations),
                };
              }
            );

            // add "draft" to statuses
            queryClient.setQueryData(
              documentVersionsListQO.queryKey,
              (prev) => {
                if (!prev) return prev;

                return prev.map((p) =>
                  p.versionNumber === documentVersionItem.versionNumber
                    ? {
                        ...p,
                        statuses: [
                          DOCUMENT_VERSION_STATUS.DRAFT,
                          DOCUMENT_VERSION_STATUS.PUBLISHED,
                        ].sort(),
                      }
                    : p
                );
              }
            );

            form.setFieldValue(
              `translations.${DOCUMENT_VERSION_STATUS.DRAFT}`,
              translations
            );
          }

          break;
        case "saveDraft":
          {
            // optimistically set the draft
            queryClient.setQueryData(
              documentVersionDraftQO.queryKey,
              (prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  translations: Object.assign(prev.translations, translations),
                };
              }
            );
          }

          break;

        case "updatePublished":
          {
            // optimistically update published
            queryClient.setQueryData(
              documentVersionPublishedQO.queryKey,
              (prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  ...translations,
                };
              }
            );
          }
          break;
      }

      return {
        prevDocumentVersionDraft,
        prevDocumentVersionPublished,
        prevDocumentVersionsList,
      };
    },

    onError: (_, __, context) => {
      if (context?.prevDocumentVersionDraft) {
        queryClient.setQueryData(
          documentVersionDraftQO.queryKey,
          context.prevDocumentVersionDraft
        );

        form.setFieldValue(
          `translations.${DOCUMENT_VERSION_STATUS.DRAFT}`,
          context.prevDocumentVersionDraft.translations
        );
      }

      if (context?.prevDocumentVersionPublished) {
        queryClient.setQueryData(
          documentVersionPublishedQO.queryKey,
          context.prevDocumentVersionPublished
        );
      }

      if (context?.prevDocumentVersionsList) {
        queryClient.setQueryData(
          documentVersionsListQO.queryKey,
          context.prevDocumentVersionsList
        );
      }
    },

    onSettled: (_, __, { action }) => {
      if (action === "saveDraft" || action === "saveAsDraft") {
        queryClient.invalidateQueries(documentVersionDraftQO);

        if (action === "saveAsDraft") {
          queryClient.invalidateQueries(documentVersionsListQO);
        }
      }

      if (action === "updatePublished") {
        queryClient.invalidateQueries(documentVersionPublishedQO);
      }
    },
  });

  const { mutate: publishDraft } = useMutation({
    mutationFn: (
      value: FormData["translations"][typeof DOCUMENT_VERSION_STATUS.DRAFT]
    ) =>
      $publishDocumentVersionDraft({
        data: {
          translations: value,
          contentId: documentVersionItem.contentId,
          versionNumber: documentVersionItem.versionNumber,
        },
      }),
    onMutate: async (translations) => {
      await queryClient.cancelQueries(documentVersionPublishedQO);
      await queryClient.cancelQueries(documentVersionsListQO);

      const prevDocumentPublishedVersion = queryClient.getQueryData(
        documentVersionPublishedQO.queryKey
      );

      const prevDocumentVersionsList = queryClient.getQueryData(
        documentVersionsListQO.queryKey
      );

      queryClient.setQueryData(documentVersionPublishedQO.queryKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: DOCUMENT_VERSION_STATUS.PUBLISHED,
        };
      });

      queryClient.setQueryData(documentVersionsListQO.queryKey, (prev) => {
        if (!prev) return prev;
        return prev.map((p) =>
          p.versionNumber === documentVersionItem.versionNumber
            ? { ...p, statuses: [DOCUMENT_VERSION_STATUS.PUBLISHED] }
            : p
        );
      });

      form.setFieldValue(`translations.${DOCUMENT_VERSION_STATUS.PUBLISHED}`, {
        ...translations,
      });

      return { prevDocumentPublishedVersion, prevDocumentVersionsList };
    },
    onError: (_, __, context) => {
      if (context?.prevDocumentPublishedVersion) {
        queryClient.setQueryData(
          documentVersionPublishedQO.queryKey,
          context.prevDocumentPublishedVersion
        );
      }
      if (context?.prevDocumentVersionsList) {
        queryClient.setQueryData(
          documentVersionsListQO.queryKey,
          context.prevDocumentVersionsList
        );
      }
      form.reset();
    },
    onSettled: () => {
      queryClient.invalidateQueries(documentVersionsListQO);
      queryClient.invalidateQueries(documentVersionPublishedQO);
    },
  });

  const { mutate: deleteDraft } = useMutation({
    mutationFn: (
      value: Pick<
        DocumentVersionListItemResponse,
        "contentId" | "versionNumber"
      >
    ) => $deleteDocumentVersionDraft({ data: value }),

    onSuccess: async () => {
      await queryClient.invalidateQueries(documentVersionsListQO);

      form.resetField(`translations.${DOCUMENT_VERSION_STATUS.DRAFT}`);
      form.resetField("status");
    },
  });

  const form = useAppForm({
    defaultValues: {
      translations: {
        [DOCUMENT_VERSION_STATUS.DRAFT]: documentVersionDraft?.translations,
        [DOCUMENT_VERSION_STATUS.PUBLISHED]:
          documentVersionPublished?.translations,
      },
      status: documentVersionItem.statuses[0],
      locale: i18n.defaultLocale,
    } as FormData,
    onSubmitMeta: defaultMeta,
    onSubmit: ({ value, meta }) => {
      switch (meta.submitAction) {
        case "publishDraft":
          publishDraft(value.translations[DOCUMENT_VERSION_STATUS.DRAFT]);
          break;

        case "saveDraft":
          saveVersion({
            translations: value.translations[DOCUMENT_VERSION_STATUS.DRAFT],
            action: meta.submitAction,
          });

          break;
        default:
          saveVersion({
            translations: value.translations[DOCUMENT_VERSION_STATUS.PUBLISHED],
            action: meta.submitAction,
          });

          break;
      }
    },
  });

  return (
    <Card
      caption={
        <div className="flex items-center gap-5">
          <span>Details</span>
          <form.Subscribe selector={(state) => state.values.status}>
            {(status) => (
              <form.AppField name="status">
                {(field) => (
                  <field.SwitchField
                    options={documentVersionItem.statuses.map((st) => ({
                      value: st,
                      label: <StatusTag isActive={st === status} status={st} />,
                    }))}
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>

          <form.AppField name="locale">
            {(field) => <field.LocaleSwitchField />}
          </form.AppField>
        </div>
      }
      className={cn("flex h-full flex-1 flex-col", className)}
      containerClassName="flex flex-col flex-1"
    >
      <form
        className="flex h-full flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Subscribe selector={(state) => state.values.status}>
          {(status) => (
            <>
              <p>
                Author:
                {status === DOCUMENT_VERSION_STATUS.DRAFT
                  ? documentVersionDraft?.author.name
                  : documentVersionPublished?.author.name}
              </p>
              <form.Subscribe selector={(state) => state.values.locale}>
                {(locale) => (
                  <>
                    <form.AppField
                      name={`translations.${status}.${locale}.title`}
                    >
                      {(field) => {
                        return <field.TextField label="Title" />;
                      }}
                    </form.AppField>
                    <form.AppField
                      name={`translations.${status}.${locale}.content`}
                    >
                      {(field) => (
                        <Suspense fallback={<div>Loading...</div>}>
                          <field.ContentAreaField label="Content" />
                        </Suspense>
                      )}
                    </form.AppField>
                  </>
                )}
              </form.Subscribe>
            </>
          )}
        </form.Subscribe>

        <div className="flex h-fit justify-between gap-5">
          <form.AppForm>
            <form.Subscribe
              selector={(state) => ({
                isDirty: state.isDirty,
                status: state.values.status,
              })}
            >
              {({ isDirty, status }) => {
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={!isDirty}
                        variant={"outline"}
                        onClick={() =>
                          form.resetField(`translations.${status}`)
                        }
                      >
                        <Undo2 className="size-5" /> Reset
                      </Button>
                      {status === DOCUMENT_VERSION_STATUS.DRAFT ? (
                        <Button
                          onClick={() => deleteDraft(documentVersionItem)}
                        >
                          <Trash2 className="size-5" /> Delete draft
                        </Button>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      {status === DOCUMENT_VERSION_STATUS.DRAFT ? (
                        <>
                          <Button
                            disabled={!isDirty}
                            onClick={() =>
                              form.handleSubmit({ submitAction: "saveDraft" })
                            }
                            size={"lg"}
                            variant={"action"}
                          >
                            <Save className="size-5" />
                            Save draft
                          </Button>
                          <Button
                            disabled={!isDirty}
                            onClick={() =>
                              form.handleSubmit({
                                submitAction: "publishDraft",
                              })
                            }
                            size={"lg"}
                            variant={"accent"}
                          >
                            Publish draft
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            disabled={!isDirty}
                            onClick={() =>
                              form.handleSubmit({ submitAction: "saveAsDraft" })
                            }
                            size={"lg"}
                            variant={"action"}
                          >
                            <Save className="size-8 [&_path]:stroke-[1.5px]" />
                            Save as draft
                          </Button>
                          <Button
                            disabled={!isDirty}
                            onClick={() =>
                              form.handleSubmit({
                                submitAction: "updatePublished",
                              })
                            }
                            size={"lg"}
                            variant={"accent"}
                          >
                            Update published
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                );
              }}
            </form.Subscribe>
          </form.AppForm>
        </div>
      </form>
    </Card>
  );
}
