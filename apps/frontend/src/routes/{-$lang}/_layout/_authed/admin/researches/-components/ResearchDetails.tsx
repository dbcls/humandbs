import { evaluate, useStore } from "@tanstack/react-form";
import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { IntlProvider } from "use-intl";

import { useState } from "react";

import type { ResearchDetailResponse, ResearchStatus } from "@humandbs/backend/types";
import { UpdateResearchRequestSchema } from "@humandbs/backend/types";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { TabLabel } from "@/components/form-context/fields/TabLabel";
import { FieldControl } from "@/components/form-context/schema-form/FieldControl";
import { getFieldKind } from "@/components/form-context/schema-form/getFieldKind";
import { humanize } from "@/components/form-context/schema-form/utils";
import { LangSwitcherPill } from "@/components/LanguageSwitcher";
import { StatusTag } from "@/components/StatusTag";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import { messages } from "@/config/messages";
import { useCan } from "@/hooks/useCan";
import { cn } from "@/lib/utils";
import { VersionCard } from "@/routes/{-$lang}/_layout/_main/_other/research/$humId/-VersionCard";
import type { UpdateResearchResult } from "@/serverFunctions/researches";
import {
  $approveResearch,
  $deleteResearch,
  $rejectResearch,
  $submitResearch,
  $updateResearch,
  $updateResearchUids,
  getResearchQueryOptions,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";

import { AdminStatusMessage } from "../../-components/AdminStatusMessage";
import { DatasetCreateView } from "./DatasetCreateView";
import { DatasetEditView } from "./DatasetEditView";
import { MergeResearchDialog } from "./MergeResearch/index";
import { ResearchDatasetsTab } from "./ResearchDatasetsTab";
import { ResearchVersionSelector } from "./ResearchVersionSelector";
import { researchFieldsConfig } from "./researchFieldsConfig";
import { TabContentLayout } from "./TabContentLayout";
import type { MergeResearchResult } from "./utils/researchValues";

/**
 * Top-level research metadata fields rendered as tabs, derived from the schema
 * shape (single source of truth) and ordered/labelled via `researchFieldsConfig`.
 * Fields whose key carries no config entry and resolve to a primitive kind fall
 * through to the generic schema-driven `FieldControl` — so a new scalar backend
 * field surfaces automatically with no code change here.
 *
 * `uids`, `releaseNote`, `status`, versions and datasets are handled separately
 * outside this tabbed loop, so they're excluded.
 */
const EXCLUDED_FIELDS = new Set<string>([
  "humId",
  "url",
  "status",
  "uids",
  "draftVersion",
  "latestVersion",
  "version",
  "versionIds",
  "humVersionId",
  "versionReleaseDate",
  "releaseNote",
  "datasets",
  "controlledAccessUser",
  // Optimistic-locking metadata carried by UpdateResearchRequestSchema — not editable fields.
  "_seq_no",
  "_primary_term",
]);

type MetadataField = {
  key: string;
  label: string;
  order: number;
  kind: ReturnType<typeof getFieldKind>;
  renderer?: (form: any) => React.ReactNode;
};

const metadataFields: MetadataField[] = Object.entries(UpdateResearchRequestSchema.shape)
  .filter(([key]) => !EXCLUDED_FIELDS.has(key))
  .flatMap(([key, schema], schemaIndex): MetadataField[] => {
    const config = researchFieldsConfig[key as keyof typeof researchFieldsConfig];
    if (config?.hidden) return [];
    return [
      {
        key,
        label: config?.label ?? humanize(key),
        order: config?.order ?? schemaIndex + 1000,
        kind: getFieldKind(schema as { _def: any }),
        renderer: config?.renderer,
      },
    ];
  })
  .sort((a, b) => a.order - b.order);

const topLevelFields = metadataFields.map((f) => f.key);

export function ResearchDetails({
  humId,
  lang,
  onDeselect,
  initialRelatedAccessions = [],
}: {
  humId: string;
  lang: Locale;
  onDeselect?: () => void;
  initialRelatedAccessions?: string[];
}) {
  const queryClient = useQueryClient();

  // Initial load — no version param to get the default (draftVersion ?? latestVersion)
  const { data: initialData } = useSuspenseQuery(getResearchQueryOptions({ humId, lang }));

  const [selectedVersion, setSelectedVersion] = useState(
    initialData.data.draftVersion ?? initialData.data.latestVersion ?? initialData.data.version,
  );

  // TODO - clean up so RQ wont fetch same twice
  // Re-fetch when selectedVersion changes
  const { data } = useSuspenseQuery(
    getResearchQueryOptions({ humId, lang, version: selectedVersion }),
  );
  const researchValues = data.data;

  const [seqNo, setSeqNo] = useState(data.meta._seq_no);
  const [primaryTerm, setPrimaryTerm] = useState(data.meta._primary_term);

  const { can: canUpdate } = useCan({
    resource: "researches",
    action: "update",
    params: { research: researchValues },
  });
  const { can: canDelete } = useCan({
    resource: "researches",
    action: "delete",
  });
  const { can: canSubmit } = useCan({
    resource: "researches",
    action: "submit",
    params: { research: researchValues },
  });
  const { can: canApprove } = useCan({
    resource: "researches",
    action: "approve",
    params: { research: researchValues },
  });
  const { can: canReject } = useCan({
    resource: "researches",
    action: "reject",
    params: { research: researchValues },
  });
  const { can: canUnpublish } = useCan({
    resource: "researches",
    action: "unpublish",
    params: { research: researchValues },
  });
  const { can: canNewVersion } = useCan({
    resource: "researches",
    action: "versions/new",
    params: { research: researchValues },
  });

  const { can: canUpdateUids } = useCan({
    resource: "researches",
    action: "update-uids",
  });
  const { can: canCreateDataset } = useCan({
    resource: "datasets",
    action: "create",
    params: { research: researchValues },
  });
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  // Datasets tab view: null = table, string = editing existing, "new" = creating
  const [datasetView, setDatasetView] = useState<string | "new" | null>(null);
  const [datasetDirty, setDatasetDirty] = useState(false);
  const [jdsRelatedAccessions, setJdsRelatedAccessions] =
    useState<string[]>(initialRelatedAccessions);
  const [activeTab, setActiveTab] = useState<"metadata" | "datasets">("metadata");

  const { mutateAsync: updateResearch, isPending: isSaving } = useMutation({
    mutationFn: async (value: typeof researchValues) => {
      const calls: Promise<unknown>[] = [
        $updateResearch({
          data: {
            humId,
            body: {
              ...value,
              _seq_no: seqNo,
              _primary_term: primaryTerm,
            },
          },
        }),
      ];
      if (canUpdateUids) {
        calls.push(
          $updateResearchUids({
            data: {
              humId,
              body: {
                uids: value.uids ?? [],
                _seq_no: seqNo,
                _primary_term: primaryTerm,
              },
            },
          }),
        );
      }
      const [updateResult] = await Promise.all(calls);
      return updateResult as UpdateResearchResult;
    },
    onSuccess: (result: UpdateResearchResult) => {
      if (!result.ok) {
        if (result.code === "CONFLICT") {
          setIsConflict(true);
          setError(null);
        } else {
          setError(result.error);
        }
        return;
      }
      setSeqNo(result.data.meta._seq_no);
      setPrimaryTerm(result.data.meta._primary_term);
      setError(null);
      setIsConflict(false);
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to save research.");
    },
  });

  const { openConfirmation } = useConfirmationStore();

  const { mutate: deleteResearch } = useMutation({
    mutationFn: () => $deleteResearch({ data: { humId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
      onDeselect?.();
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to delete research.");
    },
  });

  function handleDelete() {
    openConfirmation({
      title: "Mark research as deleted?",
      description:
        "This will set the research status to 'deleted'. The data is not permanently removed and can be recovered by an administrator.",
      actionLabel: "Delete",
      onAction: () => deleteResearch(),
    });
  }

  async function optimisticallySetStatus(targetStatus: ResearchStatus) {
    await queryClient.cancelQueries({ queryKey: ["researches", "byId"] });
    await queryClient.cancelQueries({ queryKey: ["researches", "list"] });

    // Patch byId cache
    const previousById = queryClient.getQueriesData<ResearchDetailResponse>({
      queryKey: ["researches", "byId"],
    });
    queryClient.setQueriesData<ResearchDetailResponse>(
      { queryKey: ["researches", "byId"] },
      (old) => (old ? { ...old, data: { ...old.data, status: targetStatus } } : old),
    );

    // Patch list (infinite) cache — filter-aware
    // Query key shape: ["researches", "list", "infinite", { status?, ... }]
    type InfiniteData = {
      pages: Array<{ data: Array<{ humId: string; status?: ResearchStatus }> }>;
      pageParams: unknown[];
    };
    const previousList = queryClient.getQueriesData<InfiniteData>({
      queryKey: ["researches", "list"],
    });
    previousList.forEach(([key, old]) => {
      if (!old) return;
      const params = (key as unknown[])[3] as { status?: ResearchStatus } | undefined;
      const filterStatus = params?.status; // undefined = "all"
      const matchesFilter = filterStatus === undefined || filterStatus === targetStatus;
      queryClient.setQueryData<InfiniteData>(key, {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: matchesFilter
            ? page.data.map((r) => (r.humId === humId ? { ...r, status: targetStatus } : r))
            : page.data.filter((r) => r.humId !== humId),
        })),
      });
    });

    return { previousById, previousList };
  }

  function rollbackStatus(
    previousById: [QueryKey, ResearchDetailResponse | undefined][],
    previousList: [QueryKey, unknown][],
  ) {
    previousById.forEach(([key, data]) => {
      queryClient.setQueryData(key, data);
    });
    previousList.forEach(([key, data]) => {
      queryClient.setQueryData(key, data);
    });
  }

  const { mutate: submitResearch, isPending: isSubmitting } = useMutation({
    mutationFn: () => $submitResearch({ data: { humId } }),
    onMutate: () => optimisticallySetStatus("review"),
    onSuccess: (result) => {
      if (!result.ok) setError(result.error);
      else setError(null);
    },
    onError: (err: Error, _v, context) => {
      if (context) rollbackStatus(context.previousById, context.previousList);
      setError(err.message ?? "Failed to submit research.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
    },
  });

  const { mutate: approveResearch, isPending: isApproving } = useMutation({
    mutationFn: () => $approveResearch({ data: { humId } }),
    onMutate: () => optimisticallySetStatus("published"),
    onSuccess: (result) => {
      if (!result.ok) setError(result.error);
      else setError(null);
    },
    onError: (err: Error, _v, context) => {
      if (context) rollbackStatus(context.previousById, context.previousList);
      setError(err.message ?? "Failed to approve research.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
    },
  });

  const { mutate: rejectResearch, isPending: isRejecting } = useMutation({
    mutationFn: () => $rejectResearch({ data: { humId } }),
    onMutate: () => optimisticallySetStatus("draft"),
    onSuccess: (result) => {
      if (!result.ok) setError(result.error);
      else setError(null);
    },
    onError: (err: Error, _v, context) => {
      if (context) rollbackStatus(context.previousById, context.previousList);
      setError(err.message ?? "Failed to reject research.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
    },
  });

  function handleSubmit() {
    openConfirmation({
      title: "Submit for review?",
      description: "This will send the research to admins for review.",
      actionLabel: "Submit",
      onAction: () => submitResearch(),
    });
  }

  function handleApprove() {
    openConfirmation({
      title: "Approve research?",
      description: "This will publish the research and make it publicly visible.",
      actionLabel: "Approve",
      onAction: () => approveResearch(),
    });
  }

  function handleReject() {
    openConfirmation({
      title: "Reject research?",
      description: "This will return the research to draft status.",
      actionLabel: "Reject",
      onAction: () => rejectResearch(),
    });
  }

  const [defaultValues, setDefaultValues] = useState(() => researchValues);

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      setIsConflict(false);
      const result = await updateResearch(value);
      if (result?.ok) {
        formApi.options.defaultValues = value;
        formApi.reset(value);
        setDefaultValues(value);
      }
    },
  });

  function applyMergedValues(values: MergeResearchResult["values"], relatedAccessions: string[]) {
    form.setFieldValue("title", values.title);
    form.setFieldValue("summary", values.summary as unknown as typeof researchValues.summary);
    form.setFieldValue("dataProvider", values.dataProvider as typeof researchValues.dataProvider);
    form.setFieldValue(
      "researchProject",
      values.researchProject as typeof researchValues.researchProject,
    );
    form.setFieldValue("grant", values.grant as typeof researchValues.grant);
    form.setFieldValue(
      "relatedPublication",
      values.relatedPublication as typeof researchValues.relatedPublication,
    );
    setJdsRelatedAccessions(relatedAccessions);
  }

  const previewValues = useStore(form.store, (state) => state.values);
  const [preview, setPreview] = useState(false);
  const [previewLang, setPreviewLang] = useState<"ja" | "en">("ja");
  const [datasetPreview, setDatasetPreview] = useState(false);

  const isDatasetSubviewActive = activeTab === "datasets" && datasetView !== null;
  const effectivePreview = isDatasetSubviewActive ? datasetPreview : preview;
  const setEffectivePreview = isDatasetSubviewActive ? setDatasetPreview : setPreview;
  const previewLabel = isDatasetSubviewActive ? "Dataset preview" : "Research preview";

  // True only when the selected version is the current draft being edited.
  // researchValues.draftVersion always reflects the current research state —
  // getResearchDetail always spreads the full research doc (incl. draftVersion)
  // regardless of which version was requested.
  const isViewingDraft = selectedVersion === researchValues.draftVersion;

  // Per-tab dirty state: a tab is dirty if the field value differs from initial
  const formValues = useStore(form.store, (state) => state.values);

  const dirtyFields = Object.fromEntries(
    topLevelFields.map((field) => [
      field,
      !evaluate(
        (formValues as Record<string, unknown>)[field],
        (defaultValues as Record<string, unknown>)[field],
      ),
    ]),
  ) as Record<(typeof topLevelFields)[number], boolean>;
  const isModified = Object.values(dirtyFields).some(Boolean);

  return (
    <Card
      className="flex h-full min-w-0 flex-1 flex-col overflow-hidden"
      caption={
        <>
          <span>{researchValues.humId}</span>
          <StatusTag status={researchValues.status} className="mx-3" />
          <ResearchVersionSelector
            humId={humId}
            lang={lang}
            selectedVersion={selectedVersion}
            draftVersion={researchValues.draftVersion}
            latestVersion={researchValues.latestVersion}
            canNewVersion={canNewVersion}
            onVersionChange={setSelectedVersion}
          />
          <Label className="ml-auto flex cursor-pointer items-center gap-2 font-normal text-gray-500 text-sm">
            {previewLabel}
            <Switch
              checked={effectivePreview}
              onCheckedChange={setEffectivePreview}
              className="data-[state=checked]:bg-secondary"
            />
          </Label>
        </>
      }
      captionClassName="flex items-center"
      containerClassName="flex flex-1 flex-col min-h-0"
    >
      {error ? <AdminStatusMessage className="mx-5 mt-5">{error}</AdminStatusMessage> : null}
      {isConflict && (
        <div className="mx-5 mt-5 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800 text-sm">
          <span>Someone else saved a newer version. Reload to continue.</span>
          <Button
            size="slim"
            variant="outline"
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({
                queryKey: ["researches", "byId"],
              });
            }}
          >
            Reload
          </Button>
        </div>
      )}
      <div className={cn("min-h-0 flex-1 flex-col overflow-hidden", preview ? "flex" : "hidden")}>
        <div className="flex shrink-0 items-center gap-2 px-5 pt-3 pb-2">
          <LangSwitcherPill value={previewLang} onChange={setPreviewLang} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <IntlProvider locale={previewLang} messages={messages[previewLang]}>
            <VersionCard
              versionData={previewValues as ResearchDetailResponse["data"]}
              lang={previewLang}
            />
          </IntlProvider>
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", preview && "hidden")}>
        <Tabs
          defaultValue="metadata"
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "metadata" | "datasets")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 px-5 pt-5">
            <TabsList variant="line">
              <TabsTrigger variant="line" value="metadata">
                <TabLabel dirty={Object.values(dirtyFields).some(Boolean)}>
                  Research Metadata
                </TabLabel>
              </TabsTrigger>
              <TabsTrigger variant="line" value="datasets">
                <TabLabel dirty={datasetDirty}>Datasets</TabLabel>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="metadata" className="flex max-h-full min-h-0 flex-1 flex-col">
            {/* Workflow action row */}
            <div className="mx-5 mt-5 flex shrink-0 flex-wrap items-center gap-2">
              <MergeResearchDialog
                className="mr-auto"
                currentValues={formValues}
                currentHumId={humId}
                disabled={!isViewingDraft || !canUpdate}
                onMerge={applyMergedValues}
              />

              {canDelete && (
                <Button type="button" size="lg" onClick={handleDelete}>
                  Delete
                </Button>
              )}

              {isViewingDraft && canSubmit && (
                <Button variant="outline" size="lg" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Submitting…" : "Submit for review"}
                </Button>
              )}
              {isViewingDraft && canReject && (
                <Button variant="outline" size="lg" onClick={handleReject} disabled={isRejecting}>
                  {isRejecting ? "Rejecting…" : "Reject"}
                </Button>
              )}
              {isViewingDraft && canApprove && (
                <Button variant="action" size="lg" onClick={handleApprove} disabled={isApproving}>
                  {isApproving ? "Approving…" : "Approve"}
                </Button>
              )}
              {canUnpublish && (
                <Button variant="outline" size="lg">
                  Unpublish
                </Button>
              )}

              {isViewingDraft && canUpdate && (
                <Button
                  size="lg"
                  onClick={() => form.handleSubmit()}
                  disabled={isSaving || !isModified}
                >
                  {isSaving ? "Saving…" : "Save draft"}
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <ReleaseNoteDisplay releaseNote={researchValues.releaseNote} />

              {canUpdateUids && (
                <div className="px-5 pt-5">
                  <form.AppField name="uids" mode="array">
                    {(field) => (
                      <fieldset
                        disabled={!isViewingDraft || !canUpdate}
                        className="group/fieldset flex flex-col gap-2"
                      >
                        <Label>User IDs (uids)</Label>
                        <div className="nested-form flex w-full flex-col gap-1">
                          {field.state.value?.map((uid, i) => (
                            <div key={uid} className="flex items-center gap-1">
                              <form.AppField name={`uids[${i}]`}>
                                {(f) => <f.TextField className="flex-1" />}
                              </form.AppField>
                              <button type="button" onClick={() => field.removeValue(i)}>
                                <Trash2 className="size-4 text-danger" />
                              </button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="dashed"
                            size="slim"
                            className="self-start"
                            onClick={() => field.pushValue("")}
                          >
                            + Add UID
                          </Button>
                        </div>
                      </fieldset>
                    )}
                  </form.AppField>
                </div>
              )}

              <form.AppField name="releaseNote">
                {(field) => (
                  <field.BilingualTextValueField
                    label="Release note"
                    inputsClassName="flex w-full gap-2"
                  />
                )}
              </form.AppField>
              <Tabs defaultValue={metadataFields[0]?.key} className="mt-5 flex flex-col">
                <div className="shrink-0 overflow-x-auto px-5">
                  <TabsList variant="line">
                    {metadataFields.map((field) => (
                      <TabsTrigger key={field.key} variant="line" value={field.key}>
                        <TabLabel dirty={dirtyFields[field.key]}>{field.label}</TabLabel>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <fieldset
                  disabled={!isViewingDraft || !canUpdate}
                  className="group/fieldset px-5 pt-5 pb-5"
                >
                  {metadataFields.map((field) => (
                    <TabsContent key={field.key} value={field.key}>
                      {field.renderer ? (
                        field.renderer(form)
                      ) : (
                        <form.AppField name={field.key as never}>
                          {(f) => (
                            <FieldControl
                              fieldKey={field.key}
                              kind={field.kind}
                              value={f.state.value}
                              defaultValue={(defaultValues as Record<string, unknown>)[field.key]}
                              onChange={(v) => f.handleChange(v as never)}
                            />
                          )}
                        </form.AppField>
                      )}
                    </TabsContent>
                  ))}
                </fieldset>
              </Tabs>
            </div>
          </TabsContent>

          <TabsContent
            forceMount
            value="datasets"
            className="flex max-h-full min-h-0 flex-1 flex-col"
          >
            {datasetView === null ? (
              <TabContentLayout
                header={<span className="font-medium text-sm">Datasets</span>}
                actions={
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    disabled={!canCreateDataset}
                    onClick={() => setDatasetView("new")}
                  >
                    Add new dataset
                  </Button>
                }
              >
                <ResearchDatasetsTab
                  research={researchValues}
                  onSelectDataset={(id) => setDatasetView(id)}
                />
              </TabContentLayout>
            ) : datasetView !== "new" ? (
              <DatasetEditView
                datasetId={datasetView}
                lang={lang}
                research={researchValues}
                preview={datasetPreview}
                onBack={() => {
                  setDatasetView(null);
                  setDatasetDirty(false);
                  setDatasetPreview(false);
                }}
                onDirtyChange={setDatasetDirty}
              />
            ) : (
              <DatasetCreateView
                humId={humId}
                preview={datasetPreview}
                relatedAccessions={jdsRelatedAccessions}
                onBack={() => {
                  setDatasetView(null);
                  setDatasetPreview(false);
                }}
                onCreated={(id) => setDatasetView(id)}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
}

function ReleaseNoteDisplay({
  releaseNote,
}: {
  releaseNote: { en: { text: string } | null; ja: { text: string } | null } | null | undefined;
}) {
  const en = releaseNote?.en?.text;
  const ja = releaseNote?.ja?.text;
  if (!en && !ja) return null;

  return (
    <div className="mx-5 mt-5 flex gap-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
      {en && (
        <div className="flex-1">
          <p className="mb-1 font-medium text-gray-400 text-xs uppercase">Release note (En)</p>
          <p className="whitespace-pre-wrap text-gray-700">{en}</p>
        </div>
      )}
      {ja && (
        <div className="flex-1">
          <p className="mb-1 font-medium text-gray-400 text-xs uppercase">Release note (Ja)</p>
          <p className="whitespace-pre-wrap text-gray-700">{ja}</p>
        </div>
      )}
    </div>
  );
}
