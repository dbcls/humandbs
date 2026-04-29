import { useStore } from "@tanstack/react-form";
import {
  useMutation,
  useMutationState,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Save } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n, type Locale } from "@/config/i18n";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema/documentVersion";
import {
  getDocumentQueryOptions,
  $updateDocumentHideTOC,
} from "@/serverFunctions/document";
import {
  type DocVersionListItemResponse,
  type DocVersionResponse,
  getDocumentVersionListQueryOptions,
  getDocumentVersionQueryOptions,
  $saveDocumentVersionDraft,
  $publishDocumentVersionDraft,
  $unpublishDocumentVersion,
  $resetDocumentVersionDraft,
  $createDocumentVersion,
} from "@/serverFunctions/documentVersion";
import { waitUntilNoMutations } from "@/utils/mutations";

import { StatusTag, Tag } from "@/components/StatusTag";
import { MarkdownFileActions } from "./MarkdownFileActions";
import { UnpublishedDot } from "./UnpublishedDot";

interface FormMeta {
  submitAction: "saveDraft" | "publish" | "publishAll" | "resetDraft" | null;
}

const defaultMeta: FormMeta = {
  submitAction: null,
};

interface FormData {
  lang: Locale;
  translations: DocVersionResponse["translations"];
}

function normalizeDocTextValue(value: string | undefined) {
  return value ?? "";
}

export function DocumentVersion({ contentId }: { contentId: string }) {
  const { selectedVersionNumber, setSelectedVersionNumber, versions } =
    useDocVersionsList(contentId);

  const { mutate: createVersion, isPending: isCreatingVersion } =
    useCreateVersion(contentId);

  if (versions.length === 0) {
    return (
      <Card
        className="flex h-full flex-1 flex-col"
        containerClassName="flex flex-1 flex-col"
        captionSize={"sm"}
        caption="Document"
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm">
          <p>No versions available for this document.</p>
          <Button
            variant="accent"
            onClick={() => {
              createVersion();
            }}
            disabled={isCreatingVersion}
          >
            {isCreatingVersion ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create First Version
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-col flex-1 px-8"
      captionSize={"sm"}
      caption={
        <span className="flex items-center gap-5">
          <DocumentVersionSelector
            items={versions}
            versionNumber={selectedVersionNumber}
            onSelect={setSelectedVersionNumber}
            contentId={contentId}
          />
          <Suspense>
            <ShowTOCCheckbox contentId={contentId} />
          </Suspense>
        </span>
      }
    >
      <Suspense fallback={<SkeletonLoading />}>
        <DocumentVersionContent
          key={selectedVersionNumber}
          contentId={contentId}
          versionNumber={selectedVersionNumber!}
        />
      </Suspense>
    </Card>
  );
}

function DocumentVersionContent({
  contentId,
  versionNumber,
}: {
  contentId: string;
  versionNumber: number;
}) {
  const docVersionQO = getDocumentVersionQueryOptions({
    contentId,
    versionNumber,
  });
  const { data: selectedVersionContent } = useSuspenseQuery(docVersionQO);

  const savingStatuses = useMutationState({
    filters: {
      mutationKey: [
        "documentVersion",
        contentId,
        versionNumber,
        "draft",
        "save",
      ],
    },
    select: (mutation) => mutation.state.status,
  });

  const { isPending: isPublishPending } = usePublishDraft(
    contentId,
    versionNumber,
  );

  const { mutate: unpublishVersion, isPending: isUnpublishPending } =
    useUnpublishVersion(contentId, versionNumber);

  const [baselineTranslations, setBaselineTranslations] = useState(
    () => selectedVersionContent?.translations ?? {},
  );

  const form = useDocumentVersionForm({
    initialValues: {
      lang: i18n.defaultLocale,
      translations: baselineTranslations,
    },
    setBaselineTranslations,
    contentId,
    versionNumber,
  });

  const dirtyLocales = useStore(
    form.store,
    (state) =>
      Object.fromEntries(
        i18n.locales.map((loc) => {
          const draft = state.values.translations[loc]?.draft;
          const published = state.values.translations[loc]?.published;
          const changed =
            state.isValid &&
            (normalizeDocTextValue(draft?.content) !==
              normalizeDocTextValue(published?.content) ||
              normalizeDocTextValue(draft?.title) !==
                normalizeDocTextValue(published?.title));
          return [loc, changed];
        }),
      ) as Record<Locale, boolean>,
  );

  const anyDirty = Object.values(dirtyLocales).some(Boolean);

  return (
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
        {/*<div className="flex items-end justify-between gap-4">*/}
        <TabsList variant="line">
          {i18n.locales.map((loc) => (
            <TabsTrigger key={loc} value={loc} variant="line">
              <TabLabel dirty={dirtyLocales[loc]}>{loc.toUpperCase()}</TabLabel>
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
                  <Pencil /> <span>Draft</span>
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
                  <span>Published</span>
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
                      state.values.translations[loc]?.draft?.content ?? "",
                    draftTitle:
                      state.values.translations[loc]?.draft?.title ?? "",
                  })}
                >
                  {({ draftContent, draftTitle }) => (
                    <MarkdownFileActions
                      filename={`${contentId}-${loc}-v${versionNumber}`}
                      content={draftContent}
                      title={draftTitle}
                      lang={loc}
                      onUpload={(text, uploadedTitle) => {
                        form.setFieldValue(
                          `translations.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.content`,
                          text,
                        );
                        if (uploadedTitle !== undefined) {
                          form.setFieldValue(
                            `translations.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.title`,
                            uploadedTitle,
                          );
                        }
                        form.handleSubmit({ submitAction: "saveDraft" });
                      }}
                    />
                  )}
                </form.Subscribe>
                <form.AppField
                  name={`translations.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.title`}
                  listeners={{
                    onChange: ({ fieldApi }) => {
                      fieldApi.form.handleSubmit({ submitAction: "saveDraft" });
                    },
                    onChangeDebounceMs: 800,
                  }}
                >
                  {(field) => <field.TextField label="Title" />}
                </form.AppField>
                <Suspense fallback={<SkeletonLoading />}>
                  <form.AppField
                    name={`translations.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.content`}
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
                          assetFolder={contentId}
                        />
                      );
                    }}
                  </form.AppField>
                </Suspense>
              </TabsContent>
              <TabsContent
                className="flex min-h-0 flex-1 flex-col gap-2"
                value={DOCUMENT_VERSION_STATUS.PUBLISHED}
              >
                {!selectedVersionContent.translations[loc]?.published
                  ?.content ? (
                  <div>No published content</div>
                ) : (
                  <>
                    <div className="border-foreground-light flex justify-end border-b pb-2">
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => unpublishVersion({ locale: loc })}
                        disabled={isUnpublishPending}
                      >
                        Unpublish
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <MarkdownClientPreview
                        source={
                          selectedVersionContent.translations[loc]?.published
                            ?.content ?? ""
                        }
                      />
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ShowTOCCheckbox({ contentId }: { contentId: string }) {
  const queryClient = useQueryClient();
  const docQO = getDocumentQueryOptions(contentId);
  const { data: doc } = useSuspenseQuery(docQO);

  const { mutate: updateHideTOC, isPending } = useMutation({
    mutationFn: (hideTOC: boolean) =>
      $updateDocumentHideTOC({ data: { contentId, hideTOC } }),
    onMutate: async (hideTOC) => {
      await queryClient.cancelQueries(docQO);
      const prev = queryClient.getQueryData(docQO.queryKey);
      queryClient.setQueryData(docQO.queryKey, (old: typeof doc | undefined) =>
        old ? { ...old, hideTOC } : old,
      );
      return { prev };
    },
    onError: (_, __, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(docQO.queryKey, context.prev);
      }
    },
    onSettled: () => queryClient.invalidateQueries(docQO),
  });

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="show-toc"
        checked={!(doc?.hideTOC ?? true)}
        disabled={isPending}
        onCheckedChange={(checked) => updateHideTOC(!checked)}
      />
      <Label htmlFor="show-toc" className="cursor-pointer font-normal">
        Show table of contents
      </Label>
    </div>
  );
}

function useDocumentVersionForm({
  initialValues,
  setBaselineTranslations,
  contentId,
  versionNumber,
}: {
  initialValues: FormData;
  setBaselineTranslations: React.Dispatch<
    React.SetStateAction<FormData["translations"]>
  >;
  contentId: string;
  versionNumber: number;
}) {
  const { mutate: saveDraft } = useSaveDraft(contentId, versionNumber);
  const { mutateAsync: publishDraft } = usePublishDraft(
    contentId,
    versionNumber,
  );
  const { mutateAsync: resetDraft } = useResetDraft(contentId, versionNumber);

  const isIgnoreRef = useRef(false);

  const form = useAppForm({
    defaultValues: initialValues,
    onSubmitMeta: defaultMeta,
    onSubmit: ({ value, meta, formApi }) => {
      if (isIgnoreRef.current) {
        return;
      }

      const title = value.translations?.[value.lang]?.draft?.title;
      const content = value.translations?.[value.lang]?.draft?.content;

      switch (meta.submitAction) {
        case "saveDraft":
          if (title || content) {
            saveDraft({
              locale: value.lang,
              title: title ?? "",
              content: content ?? "",
            });
          }
          break;
        case "resetDraft":
          isIgnoreRef.current = true;
          resetDraft({ locale: value.lang })
            .then(() => {
              const publishedTitle =
                value.translations?.[value.lang]?.published?.title ?? "";
              const publishedContent =
                value.translations?.[value.lang]?.published?.content ?? "";

              const newTranslations = {
                ...value.translations,
                [value.lang]: {
                  ...value.translations[value.lang],
                  draft: {
                    title: publishedTitle,
                    content: publishedContent,
                  },
                },
              };
              setBaselineTranslations(newTranslations);
              formApi.reset({ ...value, translations: newTranslations });
            })
            .finally(() => {
              isIgnoreRef.current = false;
            })
            .catch(() => {
              formApi.reset();
            });
          break;

        case "publish":
          isIgnoreRef.current = true;
          if (title || content) {
            saveDraft({
              locale: value.lang,
              title: title ?? "",
              content: content ?? "",
            });
          }

          publishDraft({ locale: value.lang })
            .then(() => {
              const newTranslations = {
                ...value.translations,
                [value.lang]: {
                  ...value.translations[value.lang],
                  published: {
                    title: title ?? "",
                    content: content ?? "",
                  },
                },
              };
              setBaselineTranslations(newTranslations);
              formApi.reset({ ...value, translations: newTranslations });
            })
            .finally(() => {
              isIgnoreRef.current = false;
            })
            .catch(() => {
              formApi.reset();
            });
          break;

        case "publishAll": {
          isIgnoreRef.current = true;
          const dirtyLocs = i18n.locales.filter((loc) => {
            const draft = value.translations[loc]?.draft;
            const published = value.translations[loc]?.published;
            return (
              normalizeDocTextValue(draft?.content) !==
                normalizeDocTextValue(published?.content) ||
              normalizeDocTextValue(draft?.title) !==
                normalizeDocTextValue(published?.title)
            );
          });

          Promise.all(
            dirtyLocs.map(async (loc) => {
              const locTitle = value.translations[loc]?.draft?.title ?? "";
              const locContent = value.translations[loc]?.draft?.content ?? "";
              if (locTitle || locContent) {
                saveDraft({
                  locale: loc,
                  title: locTitle,
                  content: locContent,
                });
              }
              await publishDraft({ locale: loc });
              return { loc, locTitle, locContent };
            }),
          )
            .then((results) => {
              const newTranslations = { ...value.translations };
              for (const { loc, locTitle, locContent } of results) {
                newTranslations[loc] = {
                  ...newTranslations[loc],
                  published: { title: locTitle, content: locContent },
                };
              }
              setBaselineTranslations(newTranslations);
              formApi.reset({ ...value, translations: newTranslations });
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

function useDocVersionsList(contentId: string) {
  const docVersionsListQO = getDocumentVersionListQueryOptions({ contentId });
  const { data: versions } = useSuspenseQuery(docVersionsListQO);

  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | undefined
  >(versions.at(-1)?.versionNumber);

  useEffect(() => {
    if (versions.length === 0) {
      if (selectedVersionNumber !== undefined) {
        setSelectedVersionNumber(undefined);
      }
      return;
    }

    const hasSelectedVersion = versions.some(
      (version) => version.versionNumber === selectedVersionNumber,
    );

    if (!hasSelectedVersion) {
      setSelectedVersionNumber(versions.at(-1)?.versionNumber);
    }
  }, [selectedVersionNumber, versions]);

  return useMemo(
    () => ({
      selectedVersionNumber,
      setSelectedVersionNumber,
      versions,
    }),
    [selectedVersionNumber, versions],
  );
}

interface DocumentVersionSelectorProps {
  items: DocVersionListItemResponse[];
  onSelect: (versionNumber: number) => void;
  versionNumber: number | undefined;
  contentId: string;
}

function DocumentVersionSelector({
  items,
  onSelect,
  versionNumber,
  contentId,
}: DocumentVersionSelectorProps) {
  const { mutate: createVersion, isPending: isCreating } =
    useCreateVersion(contentId);

  if (typeof versionNumber !== "number") return null;

  const selectedItem = items.find(
    (item) => item.versionNumber === versionNumber,
  );

  const handleCreateVersion = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    createVersion(undefined, {
      onSuccess: (data) => {
        onSelect(data.versionNumber);
      },
      onError: (error) => {
        console.error("Failed to create version:", error);
      },
    });
  };

  return (
    <Select
      value={`${versionNumber}`}
      onValueChange={(versionNumberStr) => {
        onSelect(Number(versionNumberStr));
      }}
    >
      <SelectTrigger className="h-auto w-auto min-w-48 py-1">
        <SelectValue>
          {selectedItem && (
            <DocumentVersionSelectorItem item={selectedItem} compact />
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup className="flex flex-col gap-1">
          {items.map((item) => (
            <SelectItem
              key={item.versionNumber}
              value={`${item.versionNumber}`}
              className="group focus:bg-secondary-light py-2"
            >
              <DocumentVersionSelectorItem item={item} />
            </SelectItem>
          ))}
          <Button
            variant="accent"
            onClick={handleCreateVersion}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            New Version
          </Button>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function DocumentVersionSelectorItem({
  item,
  compact,
}: {
  item: DocVersionListItemResponse;
  compact?: boolean;
}) {
  return (
    <div className="text-left text-xs group-focus:text-white">
      <div className="mb-1 font-medium">Version {item.versionNumber}</div>
      {!compact && (
        <ul className="space-y-2">
          {item.translations.map((tr) => (
            <li key={tr.locale} className="flex items-start gap-1">
              <Tag
                tag={tr.locale}
                className="group-focus:border-white group-focus:text-white"
              />
              <ul className="flex flex-col items-start gap-0.5">
                {tr.statuses.map((st) => (
                  <li key={st.status} className="flex items-start gap-2">
                    <StatusTag
                      status={st.status}
                      className="group-focus:border-white group-focus:text-white"
                    />
                    <span className="max-w-48 truncate">
                      {st.title || "(no title)"}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useDocVersionQueryOptions(contentId: string, versionNumber: number) {
  return useMemo(
    () => ({
      version: getDocumentVersionQueryOptions({ contentId, versionNumber }),
      list: getDocumentVersionListQueryOptions({ contentId }),
    }),
    [contentId, versionNumber],
  );
}

function useSaveDraft(contentId: string, versionNumber: number) {
  const { version: docVersionQO, list: docVersionsListQO } =
    useDocVersionQueryOptions(contentId, versionNumber);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["documentVersion", contentId, versionNumber, "draft", "save"],
    mutationFn: ({
      locale,
      title,
      content,
    }: {
      locale: Locale;
      title?: string;
      content?: string;
    }) =>
      $saveDocumentVersionDraft({
        data: {
          contentId,
          versionNumber,
          locale,
          title,
          content,
        },
      }),

    onMutate: async (data) => {
      await queryClient.cancelQueries(docVersionQO);

      const prevVersion = queryClient.getQueryData(docVersionQO.queryKey);

      queryClient.setQueryData(docVersionQO.queryKey, (old) => {
        if (!old) {
          return {
            contentId,
            versionNumber,
            translations: {
              [data.locale]: {
                draft: { title: data.title ?? "", content: data.content ?? "" },
              },
            },
          };
        }

        return {
          ...old,
          translations: {
            ...old.translations,
            [data.locale]: {
              ...old.translations[data.locale],
              draft: {
                title: data.title ?? "",
                content: data.content ?? "",
              },
            },
          },
        };
      });

      return { prevVersion };
    },

    onError: (_, __, context) => {
      if (context?.prevVersion) {
        queryClient.setQueryData(docVersionQO.queryKey, context.prevVersion);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(docVersionQO);
      await queryClient.invalidateQueries(docVersionsListQO);
    },
  });
}

function usePublishDraft(contentId: string, versionNumber: number) {
  const { version: docVersionQO, list: docVersionsListQO } =
    useDocVersionQueryOptions(contentId, versionNumber);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [
      "documentVersion",
      contentId,
      versionNumber,
      "published",
      "publish",
    ],
    mutationFn: async ({ locale }: { locale: Locale }) => {
      await waitUntilNoMutations(queryClient, {
        mutationKey: [
          "documentVersion",
          contentId,
          versionNumber,
          "draft",
          "save",
        ],
      });
      return $publishDocumentVersionDraft({
        data: { contentId, versionNumber, locale },
      });
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries(docVersionQO);

      const previousVersion = queryClient.getQueryData(docVersionQO.queryKey);

      queryClient.setQueryData(docVersionQO.queryKey, (old) => {
        if (!old) {
          return old;
        }

        return {
          ...old,
          translations: {
            ...old.translations,
            [data.locale]: {
              ...old.translations[data.locale],
              published: {
                title: old.translations[data.locale]?.draft?.title ?? "",
                content: old.translations[data.locale]?.draft?.content ?? "",
              },
            },
          },
        };
      });

      await queryClient.cancelQueries(docVersionsListQO);

      const previousList = queryClient.getQueryData(docVersionsListQO.queryKey);

      return { previousVersion, previousList };
    },
    onError: (_, __, context) => {
      if (context?.previousVersion) {
        queryClient.setQueryData(
          docVersionQO.queryKey,
          context.previousVersion,
        );
      }
      if (context?.previousList) {
        queryClient.setQueryData(
          docVersionsListQO.queryKey,
          context.previousList,
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(docVersionQO);
      await queryClient.invalidateQueries(docVersionsListQO);
    },
  });
}

function useResetDraft(contentId: string, versionNumber: number) {
  const { version: docVersionQO, list: docVersionsListQO } =
    useDocVersionQueryOptions(contentId, versionNumber);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [
      "documentVersion",
      contentId,
      versionNumber,
      "draft",
      "reset",
    ],
    mutationFn: ({ locale }: { locale: Locale }) =>
      $resetDocumentVersionDraft({
        data: { contentId, versionNumber, locale },
      }),
    onMutate: async ({ locale }) => {
      await queryClient.cancelQueries(docVersionQO);

      const prevVersion = queryClient.getQueryData(docVersionQO.queryKey);

      queryClient.setQueryData(docVersionQO.queryKey, (old) => {
        if (!old) {
          return old;
        }

        return {
          ...old,
          translations: {
            ...old.translations,
            [locale]: {
              ...old.translations[locale],
              draft: {
                title: old.translations[locale]?.published?.title ?? "",
                content: old.translations[locale]?.published?.content ?? "",
              },
            },
          },
        };
      });

      return { prevVersion };
    },

    onError: (_, __, context) => {
      if (context?.prevVersion) {
        queryClient.setQueryData(docVersionQO.queryKey, context.prevVersion);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(docVersionQO);
      await queryClient.invalidateQueries(docVersionsListQO);
    },
  });
}

function useUnpublishVersion(contentId: string, versionNumber: number) {
  const { version: docVersionQO, list: docVersionsListQO } =
    useDocVersionQueryOptions(contentId, versionNumber);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [
      "documentVersion",
      contentId,
      versionNumber,
      "published",
      "unpublish",
    ],
    mutationFn: ({ locale }: { locale: Locale }) =>
      $unpublishDocumentVersion({
        data: { contentId, versionNumber, locale },
      }),
    onMutate: async (data) => {
      await queryClient.cancelQueries(docVersionQO);

      const previousVersion = queryClient.getQueryData(docVersionQO.queryKey);

      queryClient.setQueryData(docVersionQO.queryKey, (old) => {
        if (!old) return old;
        const localeData = old.translations[data.locale];
        return {
          ...old,
          translations: {
            ...old.translations,
            [data.locale]: {
              ...localeData,
              // If no draft exists, copy published content into draft
              draft: localeData?.draft ?? localeData?.published,
              published: undefined,
            },
          },
        };
      });

      await queryClient.cancelQueries(docVersionsListQO);
      const previousList = queryClient.getQueryData(docVersionsListQO.queryKey);

      queryClient.setQueryData(
        docVersionsListQO.queryKey,
        (old: DocVersionListItemResponse[] | undefined) => {
          if (!old) return old;
          return old.map((item) => {
            if (item.versionNumber !== versionNumber) return item;
            return {
              ...item,
              translations: item.translations.map((t) => {
                if (t.locale !== data.locale) return t;
                const withoutPublished = t.statuses.filter(
                  (s) => s.status !== "published",
                );
                const hasDraft = withoutPublished.some(
                  (s) => s.status === "draft",
                );
                const publishedEntry = t.statuses.find(
                  (s) => s.status === "published",
                );
                return {
                  ...t,
                  statuses:
                    hasDraft || !publishedEntry
                      ? withoutPublished
                      : [
                          ...withoutPublished,
                          {
                            status: "draft" as const,
                            title: publishedEntry.title,
                          },
                        ],
                };
              }),
            };
          });
        },
      );

      return { previousVersion, previousList };
    },
    onError: (_, __, context) => {
      if (context?.previousVersion) {
        queryClient.setQueryData(
          docVersionQO.queryKey,
          context.previousVersion,
        );
      }
      if (context?.previousList) {
        queryClient.setQueryData(
          docVersionsListQO.queryKey,
          context.previousList,
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(docVersionQO);
      await queryClient.invalidateQueries(docVersionsListQO);
    },
  });
}

function useCreateVersion(contentId: string) {
  const docVersionsListQO = getDocumentVersionListQueryOptions({ contentId });
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["documentVersion", contentId, "create"],
    mutationFn: () => $createDocumentVersion({ data: { contentId } }),
    onSuccess: async () => {
      // Await the invalidation so the list is refetched before onSuccess callbacks run
      await queryClient.invalidateQueries(docVersionsListQO);
    },
  });
}
