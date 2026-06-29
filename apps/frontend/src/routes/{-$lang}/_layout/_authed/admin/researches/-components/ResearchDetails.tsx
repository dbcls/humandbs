import { evaluate, useStore } from "@tanstack/react-form";
import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { LucideUser2 } from "lucide-react";
import { IntlProvider } from "use-intl";

import { useMemo, useState } from "react";

import type { ResearchDetailResponse, ResearchStatus } from "@humandbs/backend/types";
import { UpdateResearchRequestSchema } from "@humandbs/backend/types";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { BilingualMarkdownEditorField } from "@/components/form-context/fields/BilingualMarkdownEditorField";
import { TabLabel } from "@/components/form-context/fields/TabLabel";
import { FieldControl } from "@/components/form-context/schema-form/FieldControl";
import { getFieldKind } from "@/components/form-context/schema-form/getFieldKind";
import type { FieldOverride } from "@/components/form-context/schema-form/SchemaObjectFields";
import { SchemaObjectFields } from "@/components/form-context/schema-form/SchemaObjectFields";
import { humanize } from "@/components/form-context/schema-form/utils";
import { StatusTag } from "@/components/StatusTag";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import { messages } from "@/config/messages";
import { useCan } from "@/hooks/useCan";
import { VersionCard } from "@/routes/{-$lang}/_layout/_main/_other/research/$humId/-VersionCard";
import type { UpdateResearchResult } from "@/serverFunctions/researches";
import {
  $approveResearch,
  $rejectResearch,
  $submitResearch,
  $unpublishResearch,
  $updateResearch,
  getResearchForEditQueryOptions,
  getResearchOwnersQueryOptions,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";
import { researchLegacyRawHtml } from "@/utils/renderedHtml/legacyRawHtml";
import { useResearchPreviewRenderedHtml } from "@/utils/renderedHtml/usePreviewRenderedHtml";

import { AdminStatusMessage } from "../../-components/AdminStatusMessage";
import { PreviewDialog } from "../../-components/PreviewDialog";
import { DatasetCreateView } from "./DatasetCreateView";
import { DatasetEditView } from "./DatasetEditView";
import { MergeResearchDialog } from "./MergeResearch/index";
import { ResearchDatasetsTab } from "./ResearchDatasetsTab";
import { ResearchVersionSelector } from "./ResearchVersionSelector";
import { researchFieldsConfig } from "./researchFieldsConfig";
import type { ResearchForm, ResearchValues } from "./researchForm";
import { TabContentLayout } from "./TabContentLayout";
import { isResearchEditable, isViewingDraftVersion } from "./utils/researchEditTarget";
import type { MergeResearchResult } from "./utils/researchValues";

/**
 * Top-level research metadata fields rendered as tabs, derived from the schema
 * shape (single source of truth) and ordered/labelled via `researchFieldsConfig`.
 * Fields whose key carries no config entry and resolve to a primitive kind fall
 * through to the generic schema-driven `FieldControl` — so a new scalar backend
 * field surfaces automatically with no code change here.
 *
 * `releaseNote`, `status`, versions and datasets are handled separately
 * outside this tabbed loop, so they're excluded.
 */
const EXCLUDED_FIELDS = new Set<string>([
  "humId",
  "url",
  "status",
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
  renderer?: (form: ResearchForm) => React.ReactNode;
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
  initialRelatedAccessions = [],
  selectedVersion: selectedVersionProp,
  onVersionChange,
}: {
  humId: string;
  lang: Locale;
  initialRelatedAccessions?: string[];
  selectedVersion?: string;
  onVersionChange?: (v: string) => void;
}) {
  const queryClient = useQueryClient();

  // Initial load — no version param to get the default (draftVersion ?? latestVersion)
  // Uses the "for edit" fn (includeRawHtml: true, no render transform) so legacy
  // rawHtml survives for the editor's reference popup.
  const { data: initialData } = useSuspenseQuery(
    getResearchForEditQueryOptions({ humId, lang, includeRawHtml: true }),
  );

  const defaultVersion =
    initialData.data.draftVersion ?? initialData.data.latestVersion ?? initialData.data.version;
  const selectedVersion = selectedVersionProp ?? defaultVersion;
  const setSelectedVersion = onVersionChange ?? (() => {});

  // Re-fetch for the selected version
  const { data } = useSuspenseQuery(
    getResearchForEditQueryOptions({
      humId,
      lang,
      version: selectedVersion,
      includeRawHtml: true,
    }),
  );
  const researchValues = data.data;

  // Legacy rawHtml side-channel: read-only lookup threaded to the field editors.
  // Never enters submittable form state.
  const legacyRawHtml = useMemo(() => researchLegacyRawHtml(data), [data]);

  const [seqNo, setSeqNo] = useState(data.meta._seq_no);
  const [primaryTerm, setPrimaryTerm] = useState(data.meta._primary_term);

  const { can: canUpdate } = useCan({
    resource: "researches",
    action: "update",
    params: { research: researchValues },
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

  const { can: canCreateDataset } = useCan({
    resource: "datasets",
    action: "create",
    params: { research: researchValues },
  });

  // Owners are resolved server-side from the JGA DB and only readable via the
  // admin-only GET /research/{humId}/owners. Gate the fetch on admin access so
  // non-admin viewers don't trigger a 403.
  const { can: isAdmin } = useCan({ resource: "admin-panel", action: "view-cms" });
  const { data: ownersResult } = useQuery({
    ...getResearchOwnersQueryOptions(humId),
    enabled: isAdmin,
  });
  const owners = ownersResult?.ok ? ownersResult.data.owners : [];

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
      // Both the draft and the published latest are saved via PUT /research/{humId}/update.
      // Editability is guaranteed by the Save button gate (isResearchEditable).
      const result = await $updateResearch({
        data: {
          humId,
          body: { ...value, _seq_no: seqNo, _primary_term: primaryTerm },
        },
      });
      return result;
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
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to save research.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["researches", "byId"] });
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
    },
  });

  const { openConfirmation } = useConfirmationStore();

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
      if (!result.ok) {
        setError(result.error);
      } else {
        setSeqNo(result.data.meta._seq_no);
        setPrimaryTerm(result.data.meta._primary_term);
        setIsConflict(false);
        setError(null);
      }
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
      if (!result.ok) {
        setError(result.error);
      } else {
        setSeqNo(result.data.meta._seq_no);
        setPrimaryTerm(result.data.meta._primary_term);
        setIsConflict(false);
        setError(null);
      }
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

  const { mutate: unpublishResearch, isPending: isUnpublishing } = useMutation({
    mutationFn: () => $unpublishResearch({ data: { humId } }),
    onMutate: () => optimisticallySetStatus("draft"),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(result.error);
      } else {
        setError(null);
        setSeqNo(result.data.meta._seq_no);
        setPrimaryTerm(result.data.meta._primary_term);

        setIsConflict(false);
      }
    },
    onError: (err: Error, _v, context) => {
      if (context) rollbackStatus(context.previousById, context.previousList);
      setError(err.message ?? "Failed to unpublish research.");
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

  function handleUnpublish() {
    openConfirmation({
      title: "Unpublish research?",
      description: "This will return the research to draft status and remove it from public view.",
      actionLabel: "Unpublish",
      onAction: () => unpublishResearch(),
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
  const setEffectivePreview = isDatasetSubviewActive ? setDatasetPreview : setPreview;
  const previewLabel = isDatasetSubviewActive ? "Dataset preview" : "Research preview";

  // True only when the selected version is the current draft being edited.
  // researchValues.draftVersion always reflects the current research state —
  // getResearchDetail always spreads the full research doc (incl. draftVersion)
  // regardless of which version was requested.
  // Draft-only workflow actions (Submit/Reject/Approve, Merge) stay gated on this.
  const isViewingDraft = isViewingDraftVersion({
    selectedVersion,
    draftVersion: researchValues.draftVersion,
  });

  // The edit surface (fieldsets + Save) is unlocked whenever editing is valid:
  // the draft version, OR the published latest of a published research (patch).
  // Replaces the former isViewingDraft-only gates so the published view is editable.
  const isEditable = isResearchEditable({
    selectedVersion,
    draftVersion: researchValues.draftVersion,
    latestVersion: researchValues.latestVersion,
    status: researchValues.status,
  });

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
  // releaseNote is part of the update payload but rendered outside the tabbed
  // loop (excluded from topLevelFields), so track its dirty state separately to
  // keep the Save draft button in sync. Compare per-locale text and treat empty
  // string and undefined as equivalent, so clearing all text in a field that
  // started empty returns it to the non-modified state.
  const releaseNoteCurrent = (formValues as Record<string, any>).releaseNote;
  const releaseNoteDefault = (defaultValues as Record<string, any>).releaseNote;
  const releaseNoteDirty = (["en", "ja"] as const).some(
    (locale) =>
      !evaluate(
        releaseNoteCurrent?.[locale]?.text || undefined,
        releaseNoteDefault?.[locale]?.text || undefined,
      ),
  );
  const isModified = Object.values(dirtyFields).some(Boolean) || releaseNoteDirty;

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
          <Button
            type="button"
            variant="outline"
            size="slim"
            className="ml-auto"
            onClick={() => setEffectivePreview(true)}
          >
            {previewLabel}
          </Button>
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
      <PreviewDialog
        open={preview}
        onOpenChange={setPreview}
        title={`${researchValues.humId} preview`}
        lang={previewLang}
        onLangChange={setPreviewLang}
      >
        <div className="px-5 py-5">
          <IntlProvider locale={previewLang} messages={messages[previewLang]}>
            <ResearchPreviewCard previewValues={previewValues} lang={previewLang} />
          </IntlProvider>
        </div>
      </PreviewDialog>

      {/* Owners — resolved server-side from the JGA DB (admin-only, read-only) */}
      {isAdmin && (
        <div className="mx-5 mt-5 flex shrink-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-muted-foreground">Owners:</span>
          {owners.length > 0 ? (
            <div className="flex flex-wrap gap-4">
              {owners.map((owner) => (
                <span key={owner} className="text-neutral-700">
                  <LucideUser2 className="inline size-6 align-text-bottom" />
                  {owner}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground italic">None</span>
          )}
        </div>
      )}

      {/* Research-wide workflow actions — apply to the research as a whole,
          independent of which tab (metadata/datasets) is active. */}
      <div className="mx-5 mt-5 flex shrink-0 flex-wrap items-center justify-end gap-2">
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
          <Button variant="outline" size="lg" onClick={handleUnpublish} disabled={isUnpublishing}>
            {isUnpublishing ? "Unpublishing…" : "Unpublish"}
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
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
            {/* Metadata-editing actions — Merge (draft construction) and Save
                operate on the metadata form, so they stay with this tab. */}
            <div className="mx-5 mt-5 flex shrink-0 flex-wrap items-center gap-2">
              {/* Merge is a draft-construction tool — hidden entirely on non-draft
                  views (e.g. published patch). The spacer keeps the rest of the
                  action row right-aligned when the button is absent. */}
              {isViewingDraft ? (
                <MergeResearchDialog
                  className="mr-auto"
                  currentValues={formValues}
                  disabled={!canUpdate}
                  onMerge={applyMergedValues}
                />
              ) : (
                <div className="mr-auto" />
              )}

              {isEditable && canUpdate && (
                <Button
                  size="lg"
                  onClick={() => form.handleSubmit()}
                  disabled={isSaving || !isModified}
                >
                  {isSaving ? "Saving…" : isViewingDraft ? "Save draft" : "Save"}
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <fieldset disabled={!isEditable || !canUpdate} className="group/fieldset p-5">
                <BilingualMarkdownEditorField
                  // withForm components take a loosely-typed form; cast matches the
                  // idiom used by the other schema-driven field components.
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  form={form as any}
                  baseName="releaseNote"
                  label="Release note"
                  legacyFieldKey="releaseNote"
                  legacyRawHtml={legacyRawHtml}
                />
              </fieldset>
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
                <fieldset disabled={!isEditable || !canUpdate} className="group/fieldset p-5">
                  {metadataFields.map((field) => (
                    <TabsContent key={field.key} value={field.key}>
                      {field.key === "summary" ? (
                        <SummaryMarkdownFields form={form} legacyRawHtml={legacyRawHtml} />
                      ) : field.renderer ? (
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
                onPreviewChange={setDatasetPreview}
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
                onPreviewChange={setDatasetPreview}
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

/**
 * Summary editor: aims/methods/targets become Markdown editors (with live preview
 * + legacy popup) via per-key overrides; `url` falls through to the generic
 * schema-driven rendering. Each Markdown editor edits only `text`.
 */
function SummaryMarkdownFields({
  form,
  legacyRawHtml,
}: {
  form: ResearchForm;
  legacyRawHtml: ReturnType<typeof researchLegacyRawHtml>;
}) {
  const overrides = useMemo<Record<string, FieldOverride>>(() => {
    const markdownOverride =
      (legacyFieldKey: string): FieldOverride =>
      ({ form: fieldForm, name, label }) => (
        <BilingualMarkdownEditorField
          form={fieldForm}
          baseName={name}
          label={label}
          legacyFieldKey={legacyFieldKey}
          legacyRawHtml={legacyRawHtml}
        />
      );
    return {
      aims: markdownOverride("aims"),
      methods: markdownOverride("methods"),
      targets: markdownOverride("targets"),
    };
    // Each override reads `ctx.form` (the field-level form), so the outer `form`
    // is not a dependency — only the legacy lookup is.
  }, [legacyRawHtml]);

  return (
    <SchemaObjectFields
      form={form}
      baseName="summary"
      schema={unwrapSummarySchema(UpdateResearchRequestSchema.shape.summary)}
      overrides={overrides}
    />
  );
}

/** Unwrap nullable/optional/default to reach the inner summary object schema. */
function unwrapSummarySchema(schema: unknown): unknown {
  let s = schema as { _def?: { type?: string; innerType?: unknown } };
  for (let i = 0; i < 10; i++) {
    const t = s?._def?.type;
    if (t === "nullable" || t === "optional" || t === "default") {
      s = s._def!.innerType as typeof s;
    } else break;
  }
  return s;
}

/**
 * Admin whole-card preview: runs the same `addResearchRenderedHtml` transform used
 * on the public read path over the live (unsaved) form values, then feeds the
 * widened result to the pure public `VersionCard`. Preview ≡ public output.
 */
function ResearchPreviewCard({
  previewValues,
  lang,
}: {
  previewValues: ResearchValues;
  lang: "ja" | "en";
}) {
  const rendered = useResearchPreviewRenderedHtml(previewValues);
  if (!rendered) return null;
  return <VersionCard versionData={rendered} lang={lang} />;
}
