import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Dot, Loader2, Pencil, Save, Trash2, Undo2 } from "lucide-react";
import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { useAppForm, withForm } from "@/components/form-context/FormContext";
import { Separator } from "@/components/Separator";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n, Locale } from "@/config/i18n-config";
import {
  DOCUMENT_VERSION_STATUS,
  DocumentVersionTranslation,
} from "@/db/schema";
import { cn } from "@/lib/utils";
import {
  $deleteDocumentVersionDraft,
  $publishDocumentVersionDraft,
  $saveDocumentVersion,
  DocumentVersionContentResponse,
  type DocumentVersionListItemResponse,
  getDocumentVersionDraftQueryOptions,
  getDocumentVersionPublishedQueryOptions,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";

import { StatusTag } from "./StatusTag";

interface FormMeta {
  submitAction: "saveDraft" | "publish" | "resetDraft" | null;
}

const defaultMeta: FormMeta = {
  submitAction: null,
};

type Status = "draft" | "published";

interface FormData {
  translations: Record<
    Status,
    Record<Locale, Pick<DocumentVersionTranslation, "title" | "content">>
  >;
  status: Status;
  locale: Locale;
}

export function DocumentVersion({
  className,
  contentId,
}: {
  className?: string;
  contentId: string;
}) {
  const [selectedDocVersion, setSelectedDocVersion] =
    useState<DocumentVersionListItemResponse | null>(null);

  const documentVersionsListQO = getDocumentVersionsListQueryOptions({
    contentId,
  });

  const documentVersionDraftQO = getDocumentVersionDraftQueryOptions({
    contentId,
  });

  const documentVersionPublishedQO =
    getDocumentVersionPublishedQueryOptions(selectedDocVersion);

  const queryClient = useQueryClient();

  const { data: documentVersionDraft } = useQuery(documentVersionDraftQO);
  const { data: documentVersionPublished } = useQuery(
    documentVersionPublishedQO
  );

  const form = useAppForm({
    defaultValues: {
      translations: {
        [DOCUMENT_VERSION_STATUS.DRAFT]: documentVersionDraft?.translations,
        [DOCUMENT_VERSION_STATUS.PUBLISHED]:
          documentVersionPublished?.translations,
      },
      status: selectedDocVersion?.statuses[0],
      locale: i18n.defaultLocale,
    } as FormData,
    onSubmitMeta: defaultMeta,
    onSubmit: ({ value, meta }) => {
      if (!selectedDocVersion) return;
      switch (meta.submitAction) {
        case "publishDraft":
          publishDraft({
            translations: value.translations[DOCUMENT_VERSION_STATUS.DRAFT],
            contentId: selectedDocVersion.contentId,
            versionNumber: selectedDocVersion.versionNumber,
          });
          break;

        case "saveDraft":
          saveVersion({
            translations: value.translations[DOCUMENT_VERSION_STATUS.DRAFT],
            contentId: selectedDocVersion.contentId,
            versionNumber: selectedDocVersion.versionNumber,
            action: meta.submitAction,
          });

          break;
        default:
          saveVersion({
            translations: value.translations[DOCUMENT_VERSION_STATUS.PUBLISHED],
            contentId: selectedDocVersion.contentId,
            versionNumber: selectedDocVersion.versionNumber,
            action: meta.submitAction,
          });

          break;
      }
    },
  });

  return (
    <form.AppForm>
      <Card
        caption={
          <div className="flex items-center gap-5">
            <span>Details</span>

            {/*<form.Subscribe selector={(state) => state.values.status}>
            {(status) => (
              <form.AppField name="status">
                {(field) => (
                  <field.SwitchField
                    options={
                      documentVersionItem?.statuses.map((st) => ({
                        value: st,
                        label: (
                          <StatusTag isActive={st === status} status={st} />
                        ),
                      })) || []
                    }
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>*/}

            <Suspense fallback={<Skeleton />}>
              <DocumentVersionSelector
                contentId={contentId}
                onSelect={setSelectedDocVersion}
              />
            </Suspense>

            <form.AppField name="locale">
              {(field) => <field.LocaleSwitchField />}
            </form.AppField>
          </div>
        }
        className={cn("flex h-full flex-1 flex-col", className)}
        containerClassName="flex flex-col flex-1"
      >
        <DocumentVersionContentForm
          form={form}
          selectedDocVersion={selectedDocVersion}
          deleteDraft={deleteDraft}
          documentVersionDraft={documentVersionDraft}
          documentVersionPublished={documentVersionPublished}
        />
        {/*<form
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
                            onClick={() => deleteDraft(selectedDocVersion)}
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
                                form.handleSubmit({
                                  submitAction: "saveAsDraft",
                                })
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
        </form>*/}
      </Card>
    </form.AppForm>
  );
}

const DocumentVersionContentForm = withForm({
  defaultValues: {} as FormData,
  onSubmitMeta: defaultMeta,
  props: {
    deleteDraft: (
      _value: Pick<
        DocumentVersionListItemResponse,
        "contentId" | "versionNumber"
      >
    ) => {},
    selectedDocVersion: {} as DocumentVersionListItemResponse | null,
    documentVersionDraft: {} as DocumentVersionContentResponse,
    documentVersionPublished: {} as DocumentVersionContentResponse,
  },

  render: function Render({
    form,
    deleteDraft,
    selectedDocVersion,
    documentVersionDraft,
    documentVersionPublished,
  }) {
    return (
      <Tabs className="flex-1" defaultValue={DOCUMENT_VERSION_STATUS.PUBLISHED}>
        <TabsList>
          <TabsTrigger
            className="flex items-center gap-2"
            value={DOCUMENT_VERSION_STATUS.DRAFT}
          >
            <Pencil /> <span>Editor</span>
            {/*{isDraftChanged ? <Dot /> : null}*/}
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
          className="flex flex-1 flex-col gap-2"
          value={DOCUMENT_VERSION_STATUS.DRAFT}
        >
          <>
            <form.Subscribe selector={(state) => state.values.status}>
              {(status) => (
                <>
                  <p>
                    Author:
                    {status === DOCUMENT_VERSION_STATUS.DRAFT
                      ? documentVersionDraft.author.name
                      : documentVersionPublished.author.name}
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
                              onClick={() => deleteDraft(selectedDocVersion)}
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
                                  form.handleSubmit({
                                    submitAction: "saveDraft",
                                  })
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
                                  form.handleSubmit({
                                    submitAction: "saveAsDraft",
                                  })
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
          </>
        </TabsContent>
      </Tabs>
    );
  },
});

function useResetDocumentVerDraft(contentId: string, versionNumber: number) {
  const queryClient = useQueryClient();

  
  return useMutation({
    mutationKey: [
      "document",
      contentId,
      "version",
      versionNumber,
      "draft",
      "reset",
    ],
    mutationFn: ({ lang }: { lang: Locale }) => 
  });
}

function DocumentVersionSelector({
  contentId,
  onSelect,
}: {
  contentId: string;
  onSelect: (version: DocumentVersionListItemResponse) => void;
}) {
  const versionListQO = getDocumentVersionsListQueryOptions({ contentId });

  const { data: versions } = useSuspenseQuery(versionListQO);

  return (
    <Select
      defaultValue={`${versions[0].versionNumber}`}
      onValueChange={(versionNumStr) =>
        onSelect(
          versions.find((v) => v.versionNumber === Number(versionNumStr))!
        )
      }
    >
      <SelectTrigger className="w-fit max-w-48">
        <SelectValue placeholder="Select version" />
      </SelectTrigger>
      <SelectContent className="flex w-fit flex-col gap-2">
        <Button>Add new</Button>
        <Separator className="h-2" />
        <SelectGroup>
          {versions.map((ver) => (
            <SelectItem value={`${ver.versionNumber}`} key={ver.versionNumber}>
              <span className="items-items-center flex gap-1">
                <span>{ver.versionNumber}</span>

                {ver.statuses.map((s) => (
                  <StatusTag status={s} key={s} />
                ))}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
