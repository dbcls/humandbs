import { Card } from "@/components/Card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DOCUMENT_VERSION_STATUS,
  DocumentVersionTranslation,
} from "@/db/schema";
import { DocumentVersionStatus } from "@/db/types";
import { i18n, Locale } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  $deleteDocumentVersionDraft,
  $publishDocumentVersionDraft,
  $saveDocumentVersion,
  type DocumentVersionContentResponse,
  type DocumentVersionListItemResponse,
  getDocumentVersionDraftQueryOptions,
  getDocumentVersionPublishedQueryOptions,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import MDEditor from "@uiw/react-md-editor";
import { Save, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { StatusTag } from "./StatusTag";

type FormMeta = {
  submitAction:
    | "saveDraft"
    | "publishDraft"
    | "updatePublished"
    | "saveAsDraft"
    | null;
};

type DraftMeta = {
  submitAction:
    | "saveDraft"
    | "publishDraft"
    | "updatePublished"
    | "saveAsDraft"
    | null;
};

function getFormDataFromApiResponse<T extends DocumentVersionContentResponse>(
  response: T | undefined
): DocumentVersionContentResponse {
  if (!response) {
    return {
      id: "",
      author: {
        name: "",
        email: "",
        id: "",
      },
      translations: i18n.locales.reduce(
        (acc, locale) => {
          acc[locale] = {} as DocumentVersionTranslation;
          return acc;
        },
        {} as Record<Locale, DocumentVersionTranslation>
      ),
      status: DOCUMENT_VERSION_STATUS.DRAFT,
      versionNumber: 0,
    };
  }

  const { author, translations, status, versionNumber, id } = response;
  return {
    id,
    author,
    translations,
    status,
    versionNumber,
  };
}

export function DocumentVersionContent({
  documentVersionItem,
  className,
}: {
  documentVersionItem: DocumentVersionListItemResponse;
  className?: string;
}) {
  const [selectedStatus, setSelectedStatus] = useState<DocumentVersionStatus>(
    documentVersionItem.statuses[0]
  );

  useEffect(() => {
    setSelectedStatus((prev) => {
      if (documentVersionItem.statuses.includes(prev)) {
        return prev;
      }
      return documentVersionItem.statuses[0];
    });
  }, [documentVersionItem]);

  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    i18n.defaultLocale
  );

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
      version,
      action,
    }: {
      version: DocumentVersionContentResponse;
      action: Exclude<FormMeta["submitAction"], "publishDraft">;
    }) => {
      if (!action) throw new Error("Invalid submit action");

      if (action === "updatePublished") {
        return $saveDocumentVersion({
          data: {
            contentId: documentVersionItem.contentId,
            ...version,
            status: DOCUMENT_VERSION_STATUS.PUBLISHED,
          },
        });
      }

      return $saveDocumentVersion({
        data: {
          contentId: documentVersionItem.contentId,
          ...version,
          status: DOCUMENT_VERSION_STATUS.DRAFT,
        },
      });
    },
    onMutate: async ({ version, action }) => {
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
            const updated = {
              ...version,
              status: DOCUMENT_VERSION_STATUS.DRAFT,
            };
            // optimistically set draft as input `version`, reset the `published` back
            queryClient.setQueryData(
              documentVersionDraftQO.queryKey,
              (prev) => {
                if (!prev) return prev;

                return { ...prev, ...updated };
              }
            );

            // add "draft" to statuses
            queryClient.setQueryData(
              documentVersionsListQO.queryKey,
              (prev) => {
                if (!prev) return prev;

                return prev.map((p) =>
                  p.versionNumber === version.versionNumber
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

            form.setFieldValue(DOCUMENT_VERSION_STATUS.DRAFT, updated);
            // form.reset({
            //   [DOCUMENT_VERSION_STATUS.DRAFT]: updated,
            //   [DOCUMENT_VERSION_STATUS.PUBLISHED]: version,
            // }, {keepDefaultValues: true});
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
                  ...version,
                };
              }
            );

            // form.reset();
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
                  ...version,
                };
              }
            );

            // form.reset({
            //   ...form.options.defaultValues,
            //   [DOCUMENT_VERSION_STATUS.PUBLISHED]: version,
            // });
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
          DOCUMENT_VERSION_STATUS.DRAFT,
          context.prevDocumentVersionDraft
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
    mutationFn: (value: DocumentVersionContentResponse) =>
      $publishDocumentVersionDraft({
        data: {
          ...value,
          contentId: documentVersionItem.contentId,
        },
      }),
    onMutate: async (value) => {
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
          p.versionNumber === value.versionNumber
            ? { ...p, statuses: [DOCUMENT_VERSION_STATUS.PUBLISHED] }
            : p
        );
      });

      form.setFieldValue(DOCUMENT_VERSION_STATUS.PUBLISHED, {
        ...value,
        status: DOCUMENT_VERSION_STATUS.PUBLISHED,
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

  const { mutate: deleteVersion } = useMutation({
    mutationFn: (
      value: Pick<
        DocumentVersionListItemResponse,
        "contentId" | "versionNumber"
      >
    ) => $deleteDocumentVersionDraft({ data: value }),
    onSuccess: () => {
      queryClient.invalidateQueries(documentVersionsListQO);
    },
  });

  const defaultMeta: FormMeta = {
    submitAction: null,
  };

  const form = useForm({
    defaultValues: {
      [DOCUMENT_VERSION_STATUS.DRAFT]:
        getFormDataFromApiResponse(documentVersionDraft),
      [DOCUMENT_VERSION_STATUS.PUBLISHED]: getFormDataFromApiResponse(
        documentVersionPublished
      ),
    },
    onSubmitMeta: defaultMeta,
    onSubmit: ({ value, meta, formApi }) => {
      switch (meta.submitAction) {
        case "publishDraft":
          publishDraft(value.draft!);
          break;

        case "saveDraft":
          saveVersion({ version: value.draft!, action: meta.submitAction });

          break;
        default:
          saveVersion({ version: value.published!, action: meta.submitAction });

          break;
      }
    },
  });

  return (
    <Card
      caption={
        <div className="flex items-center gap-5">
          <span>Content</span>
          <DraftPublishedSwitcher
            options={documentVersionItem.statuses}
            value={selectedStatus}
            onValueChange={setSelectedStatus}
          />
          <LocaleSwitcher
            locale={selectedLocale}
            onSwitchLocale={setSelectedLocale}
          />
        </div>
      }
      captionSize={"sm"}
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
        <Tabs
          value={selectedLocale}
          onValueChange={(value) => setSelectedLocale(value as Locale)}
          className="h-full"
        >
          {i18n.locales.map((locale) => {
            const translator = form.state.values[selectedStatus]?.author;

            return (
              <TabsContent
                hidden={selectedLocale !== locale}
                forceMount={true}
                key={locale + selectedStatus}
                value={locale}
                className="flex flex-col gap-3"
              >
                <>
                  <p> Author: {translator?.name} </p>

                  <form.Field
                    key={locale}
                    name={`${selectedStatus}.translations.${locale}.title`}
                  >
                    {(field) => {
                      return (
                        <>
                          <Label className="mb-2">
                            Title
                            <Input
                              value={field.state.value ?? ""}
                              onBlur={field.handleBlur}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                            />
                          </Label>
                        </>
                      );
                    }}
                  </form.Field>
                  <div data-color-mode="light" className="relative flex-1">
                    <form.Field
                      name={`${selectedStatus}.translations.${locale}.content`}
                    >
                      {(field) => {
                        return (
                          <MDEditor
                            id="content"
                            className="md-editor"
                            highlightEnable={true}
                            value={field.state.value ?? ""}
                            onChange={(value) =>
                              field.handleChange(value ?? "")
                            }
                            height={"100%"}
                            components={{
                              preview: (source) => {
                                const { content } = transformMarkdoc({
                                  rawContent: source,
                                });

                                return <RenderMarkdoc content={content} />;
                              },
                            }}
                          />
                        );
                      }}
                    </form.Field>
                  </div>
                </>
              </TabsContent>
            );
          })}
        </Tabs>

        <div className="flex h-fit justify-between gap-5">
          <form.Subscribe
            selector={(state) => [
              state.isDirty,
              state.values.draft,
              state.values.published,
            ]}
          >
            {([isDirty, draft, published]) => {
              return (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={!isDirty}
                      variant={"outline"}
                      onClick={() => form.reset()}
                    >
                      <Undo2 className="size-5" /> Reset
                    </Button>
                    {selectedStatus === DOCUMENT_VERSION_STATUS.DRAFT ? (
                      <Button
                        onClick={() => deleteVersion(documentVersionItem)}
                      >
                        <Trash2 className="size-5" /> Delete draft
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    {selectedStatus === DOCUMENT_VERSION_STATUS.DRAFT ? (
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
                          disabled={!draft}
                          onClick={() =>
                            form.handleSubmit({ submitAction: "publishDraft" })
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
        </div>
      </form>
    </Card>
  );
}

function DraftPublishedSwitcher({
  value,
  options,
  onValueChange,
}: {
  value: DocumentVersionStatus;
  options: DocumentVersionStatus[];
  onValueChange: (value: DocumentVersionStatus) => void;
}) {
  return (
    <ToggleGroup
      variant={"blue"}
      value={value}
      type="single"
      onValueChange={(value) =>
        value && onValueChange(value as DocumentVersionStatus)
      }
    >
      {options.map((option) => (
        <ToggleGroupItem key={option} value={option}>
          <StatusTag status={option} isActive={option === value} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
