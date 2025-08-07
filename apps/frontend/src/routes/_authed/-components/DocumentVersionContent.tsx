import { Card } from "@/components/Card";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DocumentVersionStatus } from "@/db/types";
import { i18n, Locale } from "@/lib/i18n-config";
import { cn } from "@/lib/utils";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  $deleteDocumentVersionDraft,
  $publishDocumentVersionDraft,
  $saveDocumentVersion,
  DocumentVersionContentResponse,
  DocumentVersionListItemResponse,
  getDocumentVersionQueryOptions,
  getDocumentVersionsListQueryOptions,
} from "@/serverFunctions/documentVersion";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import MDEditor from "@uiw/react-md-editor";
import { useEffect, useState } from "react";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { StatusTag } from "./StatusTag";
import { Save, Trash2, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";

type FormMeta = {
  submitAction:
    | "saveDraft"
    | "publishDraft"
    | "updatePublished"
    | "saveAsDraft"
    | null;
};

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

  const documentVersionsListQO = getDocumentVersionsListQueryOptions({
    documentId: documentVersionItem.documentId,
  });

  const queryClient = useQueryClient();

  const { data: documentVersion } = useQuery(
    getDocumentVersionQueryOptions({
      documentId: documentVersionItem.documentId,
      versionNumber: documentVersionItem.versionNumber,
    })
  );

  const { mutate: saveVersion } = useMutation({
    mutationFn: (value: DocumentVersionContentResponse) =>
      $saveDocumentVersion({
        data: {
          documentId: documentVersionItem.documentId,
          ...value,
        },
      }),
    onMutate: (values) => {
      //
    },

    onSuccess: () => {
      queryClient.invalidateQueries(documentVersionsListQO);
    },
  });

  const { mutate: publishDraft } = useMutation({
    mutationFn: (value: DocumentVersionContentResponse) =>
      $publishDocumentVersionDraft({
        data: { ...value, documentId: documentVersionItem.documentId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(documentVersionsListQO);
    },
  });

  const { mutate: deleteVersion } = useMutation({
    mutationFn: (
      value: Pick<
        DocumentVersionListItemResponse,
        "documentId" | "versionNumber"
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
    defaultValues: documentVersion,
    onSubmitMeta: defaultMeta,
    onSubmit: ({ value, meta }) => {
      switch (meta.submitAction) {
        case "publishDraft":
          publishDraft(value.draft);
          break;
        case "saveAsDraft":
          saveVersion({ ...value.published, status: "draft" });
          break;
        case "saveDraft":
          saveVersion({ ...value.draft, status: "draft" });
          break;
        case "updatePublished":
          saveVersion({ ...value.published, status: "published" });
          break;
      }
    },
  });

  // reset form if selectes another version
  useEffect(() => {
    form.reset();
  }, [form.reset, documentVersionItem]);

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
            const translator = documentVersion?.[selectedStatus]?.author;

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
            selector={(state) => [state.isDirty, state.values.draft]}
          >
            {([isDirty, draft]) => (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={!isDirty}
                    variant={"outline"}
                    onClick={() => form.reset()}
                  >
                    <Undo2 className="size-5" /> Reset
                  </Button>
                  {selectedStatus === "draft" ? (
                    <Button onClick={() => deleteVersion(documentVersionItem)}>
                      <Trash2 className="size-5" /> Delete draft
                    </Button>
                  ) : null}
                </div>

                <div className="flex gap-2">
                  {selectedStatus === "draft" ? (
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
            )}
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
