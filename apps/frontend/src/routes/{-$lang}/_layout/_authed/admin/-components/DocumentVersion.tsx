import { useStore } from "@tanstack/react-form";
import {
  useMutation,
  useMutationState,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Save } from "lucide-react";
import { Suspense, useMemo, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { SkeletonLoading } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { i18n, Locale } from "@/config/i18n-config";
import { DOCUMENT_VERSION_STATUS } from "@/db/schema/documentVersion";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";
import {
  DocVersionListItemResponse,
  DocVersionResponse,
  getDocumentVersionListQueryOptions,
  getDocumentVersionQueryOptions,
  $saveDocumentVersionDraft,
  $publishDocumentVersionDraft,
  $resetDocumentVersionDraft,
  $createDocumentVersion,
} from "@/serverFunctions/documentVersion";
import { waitUntilNoMutations } from "@/utils/mutations";

import { StatusTag, Tag } from "./StatusTag";
import { UnpublishedDot } from "./UnpublishedDot";

interface FormMeta {
  submitAction: "saveDraft" | "publish" | "resetDraft" | null;
}

const defaultMeta: FormMeta = {
  submitAction: null,
};

interface FormData {
  lang: Locale;
  translations: DocVersionResponse["translations"];
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
  const [defaultValues, setDefaultValues] = useState(initialValues);
  const prevVersionNumber = useRef(versionNumber);

  const { mutate: saveDraft } = useSaveDraft(contentId, versionNumber);
  const { mutateAsync: publishDraft } = usePublishDraft(
    contentId,
    versionNumber
  );
  const { mutateAsync: resetDraft } = useResetDraft(contentId, versionNumber);

  const isIgnoreRef = useRef(false);

  const form = useAppForm({
    defaultValues,
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

              const resetValue = {
                ...value,
                translations: {
                  ...value.translations,
                  [value.lang]: {
                    ...value.translations[value.lang],
                    draft: {
                      title: publishedTitle,
                      content: publishedContent,
                    },
                  },
                },
              };
              setDefaultValues(resetValue);
              formApi.reset(resetValue, { keepDefaultValues: false });
            })
            .finally(() => {
              isIgnoreRef.current = false;
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
              const newValue = {
                ...value,
                translations: {
                  ...value.translations,
                  [value.lang]: {
                    ...value.translations[value.lang],
                    published: {
                      title: title ?? "",
                      content: content ?? "",
                    },
                  },
                },
              };
              setDefaultValues(newValue);
              formApi.reset(newValue, { keepDefaultValues: false });
            })
            .finally(() => {
              isIgnoreRef.current = false;
            });
          break;
      }
    },
  });

  // Reset form when version number changes (e.g., when selecting a different version)
  if (prevVersionNumber.current !== versionNumber) {
    prevVersionNumber.current = versionNumber;
    setDefaultValues(initialValues);
    form.reset(initialValues, { keepDefaultValues: false });
  }

  return form;
}

export function DocumentVersion({ contentId }: { contentId: string }) {
  const {
    selectedVersionContent,
    selectedVersionNumber,
    setSelectedVersionNumber,
    versions,
  } = useDocVersions(contentId);

  const savingStatuses = useMutationState({
    filters: {
      mutationKey: [
        "documentVersion",
        contentId,
        selectedVersionNumber,
        "draft",
        "save",
      ],
    },
    select: (mutation) => mutation.state.status,
  });

  const { isPending: isPublishPending } = usePublishDraft(
    contentId,
    selectedVersionNumber ?? 0
  );

  const form = useDocumentVersionForm({
    initialValues: {
      lang: i18n.defaultLocale,
      translations: selectedVersionContent.translations,
    },
    contentId,
    versionNumber: selectedVersionNumber ?? 0,
  });

  const isDraftChanged = useStore(
    form.store,
    (state) =>
      state.isValid &&
      (state.values.translations[state.values.lang]?.draft?.content !==
        state.values.translations[state.values.lang]?.published?.content ||
        state.values.translations[state.values.lang]?.draft?.title !==
          state.values.translations[state.values.lang]?.published?.title)
  );

  return (
    <Card
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-col flex-1"
      captionSize={"sm"}
      caption={
        <span className="flex items-center gap-5">
          <DocumentVersionSelector
            items={versions}
            versionNumber={selectedVersionNumber}
            onSelect={setSelectedVersionNumber}
            contentId={contentId}
          />

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
            {isDraftChanged && <UnpublishedDot />}
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
          <form.Subscribe selector={(state) => state.values.lang}>
            {(lang) => (
              <>
                <form.AppField
                  name={`translations.${lang}.${DOCUMENT_VERSION_STATUS.DRAFT}.title`}
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
                    name={`translations.${lang}.${DOCUMENT_VERSION_STATUS.DRAFT}.content`}
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
            )}
          </form.Subscribe>

          <div className="flex items-center justify-between">
            <Button
              variant={"outline"}
              disabled={!isDraftChanged}
              onClick={() => form.handleSubmit({ submitAction: "resetDraft" })}
            >
              Reset
            </Button>
            <div className="flex gap-2">
              <Button
                type="submit"
                onClick={() => form.handleSubmit({ submitAction: "publish" })}
                className="gap-1 self-end"
                size={"lg"}
                variant={"accent"}
                disabled={!isDraftChanged}
              >
                <Save className="size-5" />
                Publish
              </Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent
          className="flex min-h-0 flex-1 shrink-0 flex-col gap-2 overflow-y-auto"
          value={DOCUMENT_VERSION_STATUS.PUBLISHED}
        >
          <form.Subscribe selector={(state) => state.values.lang}>
            {(lang) => {
              if (
                !selectedVersionContent.translations[lang]?.published?.content
              ) {
                return <div>No published content</div>;
              }
              const { content } = transformMarkdoc({
                rawContent:
                  selectedVersionContent.translations[lang]?.published
                    ?.content ?? "",
              });

              return <RenderMarkdoc content={content} />;
            }}
          </form.Subscribe>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function useDocVersions(contentId: string) {
  const docVersionsListQO = getDocumentVersionListQueryOptions({ contentId });
  const { data: versions } = useSuspenseQuery(docVersionsListQO);

  const [selectedVersionNumber, setSelectedVersionNumber] = useState<
    number | undefined
  >(versions.at(-1)?.versionNumber);

  const docVersionQO = getDocumentVersionQueryOptions({
    contentId,
    versionNumber: selectedVersionNumber,
  });

  const { data: selectedVersionContent } = useSuspenseQuery(docVersionQO);

  return useMemo(
    () => ({
      selectedVersionNumber,
      setSelectedVersionNumber,
      selectedVersionContent,
      versions,
    }),
    [selectedVersionNumber, selectedVersionContent, versions]
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
    (item) => item.versionNumber === versionNumber
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
      onValueChange={(versionNumberStr) => onSelect(Number(versionNumberStr))}
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
    [contentId, versionNumber]
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
    onSettled: () => {
      queryClient.invalidateQueries(docVersionQO);
      queryClient.invalidateQueries(docVersionsListQO);
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
    onSettled: () => {
      queryClient.invalidateQueries(docVersionQO);
      queryClient.invalidateQueries(docVersionsListQO);
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
    onSettled: () => {
      queryClient.invalidateQueries(docVersionQO);
      queryClient.invalidateQueries(docVersionsListQO);
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
