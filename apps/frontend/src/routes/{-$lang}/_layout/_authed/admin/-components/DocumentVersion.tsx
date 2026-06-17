import { useStore } from "@tanstack/react-form";
import {
  useMutation,
  useMutationState,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, Save } from "lucide-react";
import { useTranslations } from "use-intl";

import { lazy, Suspense, useMemo, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { ModifiedTag } from "@/components/form-context/fields/ModifiedTag";
import { TabLabel } from "@/components/form-context/fields/TabLabel";
import { isFieldModified } from "@/components/form-context/fields/useFieldModified";
import { SkeletonLoading } from "@/components/Skeleton";
import { StatusTag } from "@/components/StatusTag";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import type { DocVersionStatus } from "@/db/schema/documentVersion";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema/documentVersion";
import type { DocumentVersionsResponse } from "@/repositories/documentVersion";
import {
  $updateDocumentHideFromNav,
  $updateDocumentHideRevisions,
  $updateDocumentHideTOC,
  getDocumentQueryOptions,
  getDocumentsQueryOptions,
} from "@/serverFunctions/document";
import type { DocVersionResponse } from "@/serverFunctions/documentVersion";
import {
  $createDocumentVersion,
  $publishDocumentVersionDraft,
  $resetDocumentVersionDraft,
  $saveDocumentVersionDraft,
  $unpublishDocumentVersion,
  getDocumentVersionListQueryOptions,
  getDocumentVersionQueryOptions,
} from "@/serverFunctions/documentVersion";
import { waitUntilNoMutations } from "@/utils/mutations";

import { MarkdownFileActions } from "./MarkdownFileActions";
import { TitleValue } from "./TitleValue";
import { UnpublishedDot } from "./UnpublishedDot";

const MarkdownClientPreview = lazy(() => import("@/components/markdown/MarkdownClientPreview"));

type FormMeta =
  | {
      submitAction: "publishAll" | null;
    }
  | {
      submitAction: "saveDraft" | "resetDraft";
      lang: Locale;
    };

const defaultMeta: FormMeta = {
  submitAction: null,
};

interface FormData {
  translations: DocVersionResponse["translations"];
}

function normalizeDocTextValue(value: string | undefined) {
  return value ?? "";
}

export function DocumentVersion({
  contentId,
  version,
  onSelectVersion,
}: {
  contentId: string;
  version?: number;
  onSelectVersion: (versionNumber: number) => void;
}) {
  const { selectedVersionNumber, versions } = useDocVersionsList(contentId, version);

  const { mutate: createVersion, isPending: isCreatingVersion } = useCreateVersion(contentId);

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
            onSelect={onSelectVersion}
            contentId={contentId}
          />
          <Suspense>
            <ShowTOCCheckbox contentId={contentId} />
          </Suspense>
          <Suspense>
            <ShowRevisionsCheckbox contentId={contentId} />
          </Suspense>
          <Suspense>
            <ShowInNavCheckbox contentId={contentId} />
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
  const [activeLocaleTab, setActiveLocaleTab] = useState<Locale>(i18n.defaultLocale);

  const [activeModeTab, setActiveModeTab] = useState<DocVersionStatus>(
    DOCUMENT_VERSION_STATUS.DRAFT,
  );

  const t = useTranslations("common");
  const docVersionQO = getDocumentVersionQueryOptions({
    contentId,
    versionNumber,
  });
  const { data: selectedVersionContent } = useSuspenseQuery(docVersionQO);

  const savingStatuses = useMutationState({
    filters: {
      mutationKey: ["documentVersion", contentId, versionNumber, "draft", "save"],
    },
    select: (mutation) => mutation.state.status,
  });

  const { isPending: isPublishPending } = usePublishDraft(contentId, versionNumber);

  const { mutate: unpublishVersion, isPending: isUnpublishPending } = useUnpublishVersion(
    contentId,
    versionNumber,
  );

  const form = useDocumentVersionForm({
    initialValues: {
      translations: selectedVersionContent.translations,
    },
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
            (normalizeDocTextValue(draft?.content) !== normalizeDocTextValue(published?.content) ||
              normalizeDocTextValue(draft?.title) !== normalizeDocTextValue(published?.title));
          return [loc, changed];
        }),
      ) as Record<Locale, boolean>,
  );

  const anyDirty = Object.values(dirtyLocales).some(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Tabs
        onValueChange={(loc) => setActiveLocaleTab(loc as Locale)}
        className="flex min-h-0 flex-1 flex-col"
        value={activeLocaleTab}
      >
        <div className="flex items-center justify-end gap-2 pb-1">
          <Button
            variant="outline"
            size="lg"
            // TODO !dirtyLocales[locale] ?
            disabled={!dirtyLocales[activeLocaleTab]}
            onClick={() => form.handleSubmit({ submitAction: "resetDraft", lang: activeLocaleTab })}
          >
            Reset
          </Button>

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
          <TabsContent key={loc} value={loc} className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
            <div className="flex gap-6">
              <TitleValue
                title={t("created-at")}
                value={
                  selectedVersionContent.translations[loc]?.createdAt?.toLocaleDateString() ?? "N/A"
                }
              />
              <TitleValue
                title={t("updated-at")}
                value={
                  selectedVersionContent.translations[loc]?.updatedAt?.toLocaleDateString() ?? "N/A"
                }
              />
              <TitleValue
                title={t("author")}
                value={
                  selectedVersionContent.translations[loc]?.author?.name ??
                  selectedVersionContent.translations[loc]?.author?.email ??
                  "N/A"
                }
              />
            </div>
            <Tabs
              className="flex min-h-0 flex-1 flex-col"
              defaultValue={DOCUMENT_VERSION_STATUS.PUBLISHED}
              value={activeModeTab}
              onValueChange={(tab) => {
                setActiveModeTab(tab as DocVersionStatus);
              }}
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
                    draftContent: state.values.translations[loc]?.draft?.content ?? "",
                    draftTitle: state.values.translations[loc]?.draft?.title ?? "",
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
                        form.handleSubmit({ submitAction: "saveDraft", lang: loc });
                      }}
                    />
                  )}
                </form.Subscribe>
                <form.AppField
                  name={`translations.${loc}.${DOCUMENT_VERSION_STATUS.DRAFT}.title`}
                  listeners={{
                    onChange: ({ fieldApi }) => {
                      fieldApi.form.handleSubmit({ submitAction: "saveDraft", lang: loc });
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
                          lang: loc,
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
                {!selectedVersionContent.translations[loc]?.published?.content ? (
                  <div>No published content</div>
                ) : (
                  <>
                    <div className="flex justify-end border-foreground-light border-b pb-2">
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
                        source={selectedVersionContent.translations[loc]?.published?.content ?? ""}
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
    mutationFn: (hideTOC: boolean) => $updateDocumentHideTOC({ data: { contentId, hideTOC } }),
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

function ShowRevisionsCheckbox({ contentId }: { contentId: string }) {
  const queryClient = useQueryClient();
  const docQO = getDocumentQueryOptions(contentId);
  const { data: doc } = useSuspenseQuery(docQO);

  const { mutate: updateHideRevisions, isPending } = useMutation({
    mutationFn: (hideRevisions: boolean) =>
      $updateDocumentHideRevisions({ data: { contentId, hideRevisions } }),
    onMutate: async (hideRevisions) => {
      await queryClient.cancelQueries(docQO);
      const prev = queryClient.getQueryData(docQO.queryKey);
      queryClient.setQueryData(docQO.queryKey, (old: typeof doc | undefined) =>
        old ? { ...old, hideRevisions } : old,
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
        id="show-revisions"
        checked={!(doc?.hideRevisions ?? true)}
        disabled={isPending}
        onCheckedChange={(checked) => updateHideRevisions(!checked)}
      />
      <Label htmlFor="show-revisions" className="cursor-pointer font-normal">
        Show previous versions
      </Label>
    </div>
  );
}

function ShowInNavCheckbox({ contentId }: { contentId: string }) {
  const queryClient = useQueryClient();
  const docQO = getDocumentQueryOptions(contentId);
  const { data: doc } = useSuspenseQuery(docQO);

  const { mutate: updateHideFromNav, isPending } = useMutation({
    mutationFn: (hideFromNav: boolean) =>
      $updateDocumentHideFromNav({ data: { contentId, hideFromNav } }),
    onMutate: async (hideFromNav) => {
      await queryClient.cancelQueries(docQO);
      const prev = queryClient.getQueryData(docQO.queryKey);
      queryClient.setQueryData(docQO.queryKey, (old: typeof doc | undefined) =>
        old ? { ...old, hideFromNav } : old,
      );
      return { prev };
    },
    onError: (_, __, context) => {
      if (context?.prev !== undefined) {
        queryClient.setQueryData(docQO.queryKey, context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(docQO);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="show-in-nav"
        checked={!(doc?.hideFromNav ?? true)}
        disabled={isPending}
        onCheckedChange={(checked) => updateHideFromNav(!checked)}
      />
      <Label htmlFor="show-in-nav" className="cursor-pointer font-normal">
        Show in nav config
      </Label>
    </div>
  );
}

function useDocumentVersionForm({
  initialValues,
  contentId,
  versionNumber,
}: {
  initialValues: FormData;
  contentId: string;
  versionNumber: number;
}) {
  const { mutate: saveDraft, mutateAsync: saveDraftAsync } = useSaveDraft(contentId, versionNumber);
  const { mutateAsync: publishDraft } = usePublishDraft(contentId, versionNumber);
  const { mutateAsync: resetDraft } = useResetDraft(contentId, versionNumber);

  const isIgnoreRef = useRef(false);

  const form = useAppForm({
    defaultValues: initialValues,
    onSubmitMeta: defaultMeta,
    onSubmit: async ({ value, meta, formApi }) => {
      if (isIgnoreRef.current) {
        return;
      }

      // const title = value.translations?.[value.lang]?.draft?.title;
      // const content = value.translations?.[value.lang]?.draft?.content;

      switch (meta.submitAction) {
        // SaveDraft is always per-locale, so we need to know which locale has updated
        case "saveDraft": {
          const title = value.translations?.[meta.lang]?.draft?.title;
          const content = value.translations?.[meta.lang]?.draft?.content;

          if (title || content) {
            saveDraft({
              locale: meta.lang,
              title: title ?? "",
              content: content ?? "",
            });
          }
          break;
        }
        case "resetDraft":
          isIgnoreRef.current = true;
          resetDraft({ locale: meta.lang })
            .then(() => {
              const publishedTitle = value.translations?.[meta.lang]?.published?.title ?? "";
              const publishedContent = value.translations?.[meta.lang]?.published?.content ?? "";

              const existingLang = value.translations[meta.lang];
              const newTranslations = existingLang
                ? {
                    ...value.translations,
                    [meta.lang]: {
                      ...existingLang,
                      draft: { title: publishedTitle, content: publishedContent },
                    },
                  }
                : value.translations;
              // setBaselineTranslations(newTranslations);
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

          Promise.all(
            (Object.keys(value.translations) as Locale[]).map(async (loc) => {
              const locTitle = value.translations[loc]?.draft?.title ?? "";
              const locContent = value.translations[loc]?.draft?.content ?? "";
              if (locTitle || locContent) {
                await saveDraftAsync({
                  locale: loc,
                  title: locTitle,
                  content: locContent,
                });
              }
              console.log("calling publishDraft with loc", loc);
              await publishDraft({ locale: loc });
              return { loc, locTitle, locContent };
            }),
          )
            .then((results) => {
              const newTranslations = { ...value.translations };
              for (const { loc, locTitle, locContent } of results) {
                const existing = newTranslations[loc];
                if (existing) {
                  newTranslations[loc] = {
                    ...existing,
                    published: { title: locTitle, content: locContent },
                  };
                }
              }
              //setBaselineTranslations(newTranslations);
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

function useDocVersionsList(contentId: string, version?: number) {
  const docVersionsListQO = getDocumentVersionListQueryOptions({ contentId });
  const { data: versions } = useSuspenseQuery(docVersionsListQO);

  const selectedVersionNumber = version ?? versions.at(0)?.versionNumber;

  return {
    versions,
    selectedVersionNumber,
  };
}

interface DocumentVersionSelectorProps {
  items: DocumentVersionsResponse[];
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
  const { mutate: createVersion, isPending: isCreating } = useCreateVersion(contentId);

  if (typeof versionNumber !== "number") return null;

  const selectedItem = items.find((item) => item.versionNumber === versionNumber);

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
          {selectedItem && <DocumentVersionSelectorItem item={selectedItem} compact />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup className="flex flex-col gap-1">
          {items.map((item) => (
            <SelectItem
              key={item.versionNumber}
              value={`${item.versionNumber}`}
              className="group py-2 focus:bg-secondary-light"
            >
              <DocumentVersionSelectorItem item={item} />
            </SelectItem>
          ))}
          <Button variant="accent" onClick={handleCreateVersion} disabled={isCreating}>
            {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
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
  item: DocumentVersionsResponse;
  compact?: boolean;
}) {
  return (
    <div className="text-left text-xs group-focus:text-white">
      <div className="mb-1 font-medium">Version {item.versionNumber}</div>
      {!compact && (
        <ul className="space-y-2">
          {item.translations.map((tr) => (
            <li key={tr.lang} className="flex items-start gap-2">
              <StatusTag
                status={tr.status}
                className="group-focus:border-white group-focus:text-white"
              />
              <span className="max-w-48 truncate">{tr.title || "(no title)"}</span>
              {tr.status === "published" && tr.hasUnpublishedChanges ? <UnpublishedDot /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useDocVersionQueryOptions(contentId: string, versionNumber: number) {
  const { q } = useSearch({ from: "/{-$lang}/_layout/_authed/admin/documents" });

  return useMemo(
    () => ({
      version: getDocumentVersionQueryOptions({ contentId, versionNumber }),
      list: getDocumentVersionListQueryOptions({ contentId }),
      docsList: getDocumentsQueryOptions({ q }),
    }),
    [contentId, versionNumber, q],
  );
}

function useSaveDraft(contentId: string, versionNumber: number) {
  const {
    version: docVersionQO,
    list: docVersionsListQO,
    docsList: docListQO,
  } = useDocVersionQueryOptions(contentId, versionNumber);

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
      console.log("useSaveDraft onMutate data", data);

      await queryClient.cancelQueries(docListQO);
      await queryClient.cancelQueries(docVersionQO);
      await queryClient.cancelQueries(docVersionsListQO);

      const prevVersion = queryClient.getQueryData(docVersionQO.queryKey);
      const prevList = queryClient.getQueryData(docVersionsListQO.queryKey);
      const prevDocList = queryClient.getQueryData(docListQO.queryKey);

      const isLatestVersion = prevList?.at(0)?.versionNumber === versionNumber;

      // Optimistically update document version
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

      // Read from the already-updated docVersionQO (may have been patched by publish's onMutate)

      const hasUnpublishedChanges =
        prevVersion !== undefined &&
        (data.title !== prevVersion.translations[data.locale]?.published?.title ||
          data.content !== prevVersion.translations[data.locale]?.published?.content);

      console.log("hasUnpublishedChanges", hasUnpublishedChanges);
      console.log("prevVersion", prevVersion);
      console.log(
        "data.title !== prevVersion.translations[data.locale]?.published?.title",
        data.title !== prevVersion?.translations[data.locale]?.published?.title,
      );
      console.log(
        "data.content !== prevVersion.translations[data.locale]?.published?.content",
        data.content !== prevVersion?.translations[data.locale]?.published?.content,
      );

      if (isLatestVersion) {
        queryClient.setQueryData(docListQO.queryKey, (old) => {
          if (!old) return old;

          return old.map((doc) => {
            if (doc.contentId !== contentId) return doc;
            console.log("previous translations", doc.translations);

            return {
              ...doc,
              translations: doc.translations.map((tr) => {
                if (tr.lang !== data.locale) return tr;

                console.log("mapping translation prev", tr);
                // if there is published, update its hasUnpublishedChanges
                if (tr.status === "published") {
                  const res = { ...tr, hasUnpublishedChanges };
                  console.log("mapping translations, change", { from: tr, to: res });
                  return res;
                } else {
                  // if only draft present, update the draft title
                  return { ...tr, ...data };
                }
              }),
            };
          });
        });
      }

      queryClient.setQueryData(docVersionsListQO.queryKey, (old) => {
        if (!old) return old;
        return old.map((version) => {
          if (version.versionNumber === versionNumber) {
            const existingLocale = version.translations.find((tr) => tr.lang === data.locale);

            const updatedTranslations = existingLocale
              ? version.translations.map((tr) => {
                  if (tr.lang !== data.locale) return tr;
                  if (tr.status === "published") return { ...tr, hasUnpublishedChanges };
                  return { ...tr, title: data.title };
                })
              : [
                  ...version.translations,
                  { status: "draft" as const, lang: data.locale, title: data.title },
                ];

            return { ...version, translations: updatedTranslations };
          }
          return version;
        });
      });
      return { prevVersion, prevList, prevDocList };
    },

    onSuccess: (data, variables) => {
      queryClient.setQueryData(docVersionQO.queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          translations: {
            ...old.translations,
            [variables.locale]: {
              ...old.translations[variables.locale],
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              author: data.author,
            },
          },
        };
      });
    },
    onError: (_, __, context) => {
      if (context?.prevVersion) {
        queryClient.setQueryData(docVersionQO.queryKey, context.prevVersion);
      }
      if (context?.prevList) {
        queryClient.setQueryData(docVersionsListQO.queryKey, context.prevList);
      }
      if (context?.prevDocList) {
        queryClient.setQueryData(docListQO.queryKey, context.prevDocList);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(docVersionQO);
      await queryClient.invalidateQueries(docVersionsListQO);
      await queryClient.invalidateQueries(docListQO);
    },
  });
}

function usePublishDraft(contentId: string, versionNumber: number) {
  const {
    version: docVersionQO,
    list: docVersionsListQO,
    docsList: docListQO,
  } = useDocVersionQueryOptions(contentId, versionNumber);

  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["documentVersion", contentId, versionNumber, "published", "publish"],
    mutationFn: async ({ locale }: { locale: Locale }) => {
      await waitUntilNoMutations(queryClient, {
        mutationKey: ["documentVersion", contentId, versionNumber, "draft", "save"],
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
      const draftTitle = previousVersion?.translations[data.locale]?.draft?.title;

      queryClient.setQueryData(docVersionsListQO.queryKey, (old) => {
        if (!old) return old;
        return old.map((item) => {
          if (item.versionNumber !== versionNumber) return item;
          return {
            ...item,
            translations: item.translations.map((t) => {
              if (t.lang !== data.locale) return t;
              if (t.status === "published") return { ...t, hasUnpublishedChanges: false };
              return {
                status: "published" as const,
                lang: t.lang,
                title: draftTitle ?? t.title,
                hasUnpublishedChanges: false,
              };
            }),
          };
        });
      });

      const versionsList = queryClient.getQueryData(docVersionsListQO.queryKey);
      const isLatestVersion = versionsList?.at(0)?.versionNumber === versionNumber;

      let prevDocList;

      if (isLatestVersion) {
        await queryClient.cancelQueries(docListQO);
        prevDocList = queryClient.getQueryData(docListQO.queryKey);

        queryClient.setQueryData(docListQO.queryKey, (old) => {
          if (!old) return old;
          return old.map((doc) => {
            if (doc.contentId !== contentId) return doc;
            return {
              ...doc,
              translations: doc.translations.map((tr) => {
                if (tr.lang !== data.locale) return tr;
                return {
                  ...tr,
                  title: draftTitle ?? tr.title,
                  status: "published" as const,
                  hasUnpublishedChanges: false,
                };
              }),
            };
          });
        });
      }

      return { previousVersion, previousList, prevDocList };
    },
    onError: (_, __, context) => {
      if (context?.previousVersion) {
        queryClient.setQueryData(docVersionQO.queryKey, context.previousVersion);
      }
      if (context?.previousList) {
        queryClient.setQueryData(docVersionsListQO.queryKey, context.previousList);
      }
      if (context?.prevDocList) {
        queryClient.setQueryData(docListQO.queryKey, context.prevDocList);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(docVersionQO);
      await queryClient.invalidateQueries(docVersionsListQO);
      await queryClient.invalidateQueries(docListQO);
    },
  });
}

function useResetDraft(contentId: string, versionNumber: number) {
  const { version: docVersionQO, list: docVersionsListQO } = useDocVersionQueryOptions(
    contentId,
    versionNumber,
  );
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["documentVersion", contentId, versionNumber, "draft", "reset"],
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
  const { version: docVersionQO, list: docVersionsListQO } = useDocVersionQueryOptions(
    contentId,
    versionNumber,
  );
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["documentVersion", contentId, versionNumber, "published", "unpublish"],
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
      const draftTitle = previousVersion?.translations[data.locale]?.draft?.title;

      queryClient.setQueryData(docVersionsListQO.queryKey, (old) => {
        if (!old) return old;
        return old.map((item) => {
          if (item.versionNumber !== versionNumber) return item;
          return {
            ...item,
            translations: item.translations.map((t) => {
              if (t.lang !== data.locale) return t;
              if (t.status === "draft") return t;

              return {
                status: "draft" as const,
                lang: t.lang,
                title: draftTitle ?? t.title,
              };
            }),
          };
        });
      });

      return { previousVersion, previousList };
    },
    onError: (_, __, context) => {
      if (context?.previousVersion) {
        queryClient.setQueryData(docVersionQO.queryKey, context.previousVersion);
      }
      if (context?.previousList) {
        queryClient.setQueryData(docVersionsListQO.queryKey, context.previousList);
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
