import { Card } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import { useCan } from "@/hooks/useCan";
import {
  $approveResearch,
  $deleteResearch,
  $rejectResearch,
  $submitResearch,
  $updateResearch,
  $updateResearchUids,
  getResearchQueryOptions,
  type UpdateResearchResult,
  type WorkflowActionResult,
} from "@/serverFunctions/researches";
import useConfirmationStore from "@/stores/confirmationStore";
import { JsonImportExport } from "./-JsonImportExport";
import { Tag } from "@/components/StatusTag";
import { VersionCard } from "@/routes/{-$lang}/_layout/_main/_other/data-usage/researches/$humId/-VersionCard";
import type { ResearchDetailResponse, ResearchStatus } from "@humandbs/backend/types";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-form";
import { deepEqual } from "@/components/form-context/fields/useFieldModified";
import { Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useAppForm } from "@/components/form-context/FormContext";
import { SummaryForm } from "@/components/form-context/researchFields/SummaryForm";
import { DataProviderArrayField } from "@/components/form-context/researchFields/DataProviderArrayField";
import { ResearchProjectArrayField } from "@/components/form-context/researchFields/ResearchProjectArrayField";
import { GrantArrayField } from "@/components/form-context/researchFields/GrantArrayField";
import { RelatedPublicationArrayField } from "@/components/form-context/researchFields/RelatedPublicationArrayField";
import { ControlledAccessUserArrayField } from "@/components/form-context/researchFields/ControlledAccessUserArrayField";

export function ResearchDetails({
  humId,
  lang,
  onDeselect,
}: {
  humId: string;
  lang: Locale;
  onDeselect?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(getResearchQueryOptions({ humId, lang }));
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
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const { mutateAsync: updateResearch, isPending: isSaving } = useMutation({
    mutationFn: async (value: typeof researchValues) => {
      const calls: Promise<unknown>[] = [
        $updateResearch({
          data: {
            humId,
            body: {
              title: value.title,
              summary: value.summary,
              dataProvider: value.dataProvider,
              researchProject: value.researchProject,
              grant: value.grant,
              relatedPublication: value.relatedPublication,
              controlledAccessUser: value.controlledAccessUser,
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
      (old) => old ? { ...old, data: { ...old.data, status: targetStatus } } : old,
    );

    // Patch list (infinite) cache — filter-aware
    // Query key shape: ["researches", "list", "infinite", { status?, ... }]
    type InfiniteData = { pages: Array<{ data: Array<{ humId: string; status?: ResearchStatus }> }>; pageParams: unknown[] };
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
            ? page.data.map((r) =>
                r.humId === humId ? { ...r, status: targetStatus } : r,
              )
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
    previousById.forEach(([key, data]) => queryClient.setQueryData(key, data));
    previousList.forEach(([key, data]) => queryClient.setQueryData(key, data));
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

  const form = useAppForm({
    defaultValues: researchValues,
    onSubmit: async ({ value }) => {
      setError(null);
      setIsConflict(false);
      await updateResearch(value);
    },
  });
  const previewValues = useStore(form.store, (state) => state.values);
  const [preview, setPreview] = useState(false);

  // Per-tab dirty state: compare current value of each top-level field to initial
  const dirtyFields = useStore(form.store, (state) => {
    const v = state.values;
    const i = researchValues;
    return {
      title: !deepEqual(v.title, i.title),
      summary: !deepEqual(v.summary, i.summary),
      dataProvider: !deepEqual(v.dataProvider, i.dataProvider),
      researchProject: !deepEqual(v.researchProject, i.researchProject),
      grant: !deepEqual(v.grant, i.grant),
      relatedPublication: !deepEqual(
        v.relatedPublication,
        i.relatedPublication,
      ),
      controlledAccessUser: !deepEqual(
        v.controlledAccessUser,
        i.controlledAccessUser,
      ),
    };
  });

  return (
    <>
      <Card
        className="flex h-full flex-1 flex-col min-w-0"
        caption={
          <>
            <span>{researchValues.humId}</span>
            <Tag tag={researchValues.status} size="md" className="ml-3" />
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-normal text-gray-500">
              Preview
              <Switch
                checked={preview}
                onCheckedChange={setPreview}
                className="data-[state=checked]:bg-secondary"
              />
            </label>
          </>
        }
        captionClassName="flex items-center"
        containerClassName="flex flex-1 flex-col min-h-0"
      >
        {error && (
          <div className="mx-5 mt-5 rounded border border-red-200 bg-red-50 p-2 text-sm text-danger">
            {error}
          </div>
        )}
        {isConflict && (
          <div className="mx-5 mt-5 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
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
        {preview ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-5">
            <VersionCard
              versionData={previewValues as ResearchDetailResponse["data"]}
            />
          </div>
        ) : (
          <>
            {/* Workflow action row */}
            <div className="mx-5 mt-5 flex items-center gap-2">
              <div className="ml-auto flex items-center gap-2">
                {canUpdate && (
                  <Button
                    size="slim"
                    onClick={() => form.handleSubmit()}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving…" : "Save draft"}
                  </Button>
                )}
                <JsonImportExport
                  filename={humId}
                  getValues={() => form.store.state.values}
                  onImport={(values) =>
                    form.reset(values as typeof researchValues)
                  }
                  hasData={() => {
                    const v = form.store.state.values;
                    return !!(v.title?.ja || v.title?.en);
                  }}
                />
                {canSubmit && (
                  <Button variant="outline" size="slim" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Submitting…" : "Submit for review"}
                  </Button>
                )}
                {canReject && (
                  <Button variant="outline" size="slim" onClick={handleReject} disabled={isRejecting}>
                    {isRejecting ? "Rejecting…" : "Reject"}
                  </Button>
                )}
                {canApprove && (
                  <Button size="slim" onClick={handleApprove} disabled={isApproving}>
                    {isApproving ? "Approving…" : "Approve"}
                  </Button>
                )}
                {canUnpublish && (
                  <Button variant="outline" size="slim">
                    Unpublish
                  </Button>
                )}
                {canNewVersion && (
                  <Button variant="outline" size="slim">
                    New version
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="action"
                    size="slim"
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {canUpdateUids && (
              <div className="px-5 pt-5">
                <form.AppField name="uids" mode="array">
                  {(field) => (
                    <fieldset className="flex flex-col gap-2">
                      <Label>User IDs (uids)</Label>
                      <div className="nested-form flex flex-col gap-1">
                        {field.state.value?.map((_: string, i: number) => (
                          <div key={i} className="flex items-center gap-1">
                            <form.AppField name={`uids[${i}]` as "uids"}>
                              {(f) => <f.TextField />}
                            </form.AppField>
                            <button
                              type="button"
                              onClick={() => field.removeValue(i)}
                            >
                              <Trash2 className="text-danger size-4" />
                            </button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="slim"
                          className="self-start"
                          onClick={() => field.pushValue("")}
                        >
                          Add UID
                        </Button>
                      </div>
                    </fieldset>
                  )}
                </form.AppField>
              </div>
            )}

            <Tabs
              defaultValue="title"
              className="mt-5 flex flex-col flex-1 min-h-0"
            >
              <div className="overflow-x-auto px-5 shrink-0">
                <TabsList variant="line">
                  <TabsTrigger variant="line" value="title">
                    <TabLabel dirty={dirtyFields.title}>Title</TabLabel>
                  </TabsTrigger>
                  <TabsTrigger variant="line" value="summary">
                    <TabLabel dirty={dirtyFields.summary}>Summary</TabLabel>
                  </TabsTrigger>
                  <TabsTrigger variant="line" value="datasets">
                    Datasets
                  </TabsTrigger>
                  <TabsTrigger variant="line" value="dataProvider">
                    <TabLabel dirty={dirtyFields.dataProvider}>
                      Data providers
                    </TabLabel>
                  </TabsTrigger>
                  <TabsTrigger variant="line" value="researchProject">
                    <TabLabel dirty={dirtyFields.researchProject}>
                      Research project
                    </TabLabel>
                  </TabsTrigger>
                  <TabsTrigger variant="line" value="grant">
                    <TabLabel dirty={dirtyFields.grant}>Grant</TabLabel>
                  </TabsTrigger>
                  <TabsTrigger variant="line" value="relatedPublication">
                    <TabLabel dirty={dirtyFields.relatedPublication}>
                      Related publication
                    </TabLabel>
                  </TabsTrigger>
                  <TabsTrigger variant="line" value="controlledAccessUser">
                    <TabLabel dirty={dirtyFields.controlledAccessUser}>
                      Controlled access user
                    </TabLabel>
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-5">
                <TabsContent value="title">
                  <form.AppField name="title">
                    {(field) => <field.BilingualTextField label="Title" />}
                  </form.AppField>
                </TabsContent>
                <TabsContent value="summary">
                  <SummaryForm form={form} fields="summary" />
                </TabsContent>
                <TabsContent value="dataProvider">
                  <DataProviderArrayField form={form} />
                </TabsContent>
                <TabsContent value="researchProject">
                  <ResearchProjectArrayField form={form} />
                </TabsContent>
                <TabsContent value="grant">
                  <GrantArrayField form={form} />
                </TabsContent>
                <TabsContent value="relatedPublication">
                  <RelatedPublicationArrayField form={form} />
                </TabsContent>
                <TabsContent value="controlledAccessUser">
                  <ControlledAccessUserArrayField form={form} />
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </Card>
    </>
  );
}

function TabLabel({
  dirty,
  children,
}: {
  dirty: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      {children}
      {dirty && (
        <span className="inline-block rounded bg-yellow-400 px-1 py-0 text-2xs font-semibold text-yellow-900">
          Modified
        </span>
      )}
    </span>
  );
}
