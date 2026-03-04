import type {
  ResearchDetailResponse,
  ResearchSearchUnifiedResponse,
  UpdateResearchRequest,
} from "@humandbs/backend/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { useAppForm, withForm } from "@/components/form-context/FormContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Locale } from "@/config/i18n";
import {
  $updateResearch,
  $updateResearchUids,
  getResearchForEditQueryOptions,
  type UpdateResearchUidsResult,
} from "@/serverFunctions/researches";

interface UpdateResearchFormValues {
  title: { ja: string; en: string };
  summary: {
    aims: {
      ja: { text: string; rawHtml: string };
      en: { text: string; rawHtml: string };
    };
    methods: {
      ja: { text: string; rawHtml: string };
      en: { text: string; rawHtml: string };
    };
    targets: {
      ja: { text: string; rawHtml: string };
      en: { text: string; rawHtml: string };
    };
    url: {
      ja: { text: string; url: string }[];
      en: { text: string; url: string }[];
    };
    footers: {
      ja: { text: string; rawHtml: string }[];
      en: { text: string; rawHtml: string }[];
    };
  };
  dataProvider: NonNullable<UpdateResearchRequest["dataProvider"]>;
  researchProject: NonNullable<UpdateResearchRequest["researchProject"]>;
  grant: NonNullable<UpdateResearchRequest["grant"]>;
  relatedPublication: NonNullable<UpdateResearchRequest["relatedPublication"]>;
  uids: string[];
}

const defaultValues: UpdateResearchFormValues = {
  title: { ja: "", en: "" },
  summary: {
    aims: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
    methods: {
      ja: { text: "", rawHtml: "" },
      en: { text: "", rawHtml: "" },
    },
    targets: {
      ja: { text: "", rawHtml: "" },
      en: { text: "", rawHtml: "" },
    },
    url: { ja: [], en: [] },
    footers: { ja: [], en: [] },
  },
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  uids: [],
};

function toTextValue(
  value: { text?: string | null; rawHtml?: string | null } | null | undefined,
) {
  return {
    text: value?.text ?? "",
    rawHtml: value?.rawHtml ?? "",
  };
}

function toUrlValue(
  value: { text?: string | null; url?: string | null } | null | undefined,
) {
  return {
    text: value?.text ?? "",
    url: value?.url ?? "",
  };
}

function toBilingualText(
  value: { ja?: string | null; en?: string | null } | null | undefined,
) {
  return {
    ja: value?.ja ?? "",
    en: value?.en ?? "",
  };
}

function toBilingualTextValue(
  value:
    | {
        ja?: { text?: string | null; rawHtml?: string | null } | null;
        en?: { text?: string | null; rawHtml?: string | null } | null;
      }
    | null
    | undefined,
) {
  return {
    ja: toTextValue(value?.ja),
    en: toTextValue(value?.en),
  };
}

function toFormValues(
  detail: ResearchDetailResponse["data"],
): UpdateResearchFormValues {
  return {
    title: toBilingualText(detail.title),
    summary: {
      aims: toBilingualTextValue(detail.summary?.aims),
      methods: toBilingualTextValue(detail.summary?.methods),
      targets: toBilingualTextValue(detail.summary?.targets),
      url: {
        ja: (detail.summary?.url?.ja ?? []).map((item) => toUrlValue(item)),
        en: (detail.summary?.url?.en ?? []).map((item) => toUrlValue(item)),
      },
      footers: {
        ja: (detail.summary?.footers?.ja ?? []).map((item) =>
          toTextValue(item),
        ),
        en: (detail.summary?.footers?.en ?? []).map((item) =>
          toTextValue(item),
        ),
      },
    },
    dataProvider: (detail.dataProvider ?? []).map((person) => ({
      ...person,
      name: toBilingualTextValue(person.name),
      email: person.email ?? "",
      orcid: person.orcid ?? "",
      organization: {
        name: toBilingualTextValue(person.organization?.name),
        address: {
          country: person.organization?.address?.country ?? "",
        },
      },
      datasetIds: person.datasetIds ?? [],
      researchTitle: toBilingualText(person.researchTitle),
      periodOfDataUse: person.periodOfDataUse ?? null,
    })),
    researchProject: (detail.researchProject ?? []).map((project) => ({
      ...project,
      name: toBilingualTextValue(project.name),
      url: {
        ja: toUrlValue(project.url?.ja),
        en: toUrlValue(project.url?.en),
      },
    })),
    grant: (detail.grant ?? []).map((grant) => ({
      ...grant,
      id: grant.id ?? [],
      title: toBilingualText(grant.title),
      agency: {
        ...grant.agency,
        name: toBilingualText(grant.agency?.name),
      },
    })),
    relatedPublication: (detail.relatedPublication ?? []).map(
      (publication) => ({
        ...publication,
        title: toBilingualText(publication.title),
        doi: publication.doi ?? "",
        datasetIds: publication.datasetIds ?? [],
      }),
    ),
    uids: detail.uids ?? [],
  };
}

function normalizeUids(uids: string[]): string[] {
  return Array.from(
    new Set(uids.map((uid) => uid.trim()).filter((uid) => uid.length > 0)),
  );
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

interface UpdateMutationInput {
  body: UpdateResearchRequest;
  uids: string[];
}

type UpdateMutationResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED";
    };

interface OptimisticContext {
  previousLists: [
    queryKey: readonly unknown[],
    data: ResearchSearchUnifiedResponse | undefined,
  ][];
  previousById: [
    queryKey: readonly unknown[],
    data: ResearchDetailResponse | undefined,
  ][];
}

function getLangFromResearchListQueryKey(
  queryKey: readonly unknown[],
): "ja" | "en" | undefined {
  const params = queryKey[2];
  if (!params || typeof params !== "object") return undefined;

  const lang = (params as { lang?: unknown }).lang;
  if (lang === "ja" || lang === "en") return lang;
  return undefined;
}

function getHumIdFromResearchByIdQueryKey(
  queryKey: readonly unknown[],
): string | undefined {
  if (queryKey[0] !== "researches" || queryKey[1] !== "byId") return undefined;

  const params =
    queryKey[2] === "edit"
      ? (queryKey[3] as { humId?: unknown } | undefined)
      : (queryKey[2] as { humId?: unknown } | undefined);

  return typeof params?.humId === "string" ? params.humId : undefined;
}

export function UpdateResearchDialog({
  lang,
  humId,
  onClose,
}: {
  lang: Locale;
  humId: string | null;
  onClose: () => void;
}) {
  const open = humId != null;

  const detailQuery = useQuery({
    ...getResearchForEditQueryOptions({
      humId: humId ?? "",
      lang,
      includeRawHtml: true,
    }),
    enabled: open,
  });

  const detail = detailQuery.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Update Research</DialogTitle>
          <DialogDescription>
            Update existing Research metadata. Changes are saved with optimistic
            locking.
          </DialogDescription>
        </DialogHeader>

        {!open ? null : detailQuery.isLoading || detailQuery.isFetching ? (
          <div className="py-8 text-sm text-foreground-light">
            Loading research details...
          </div>
        ) : detailQuery.isError || !detail || !humId ? (
          <div className="flex flex-col gap-3 py-4">
            <div className="text-danger text-sm rounded border border-red-200 bg-red-50 p-2">
              Failed to load research details.
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  detailQuery.refetch();
                }}
              >
                Retry
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <UpdateResearchForm
            key={`${humId}-${detail.meta._seq_no}-${detail.meta._primary_term}`}
            humId={humId}
            initialValues={toFormValues(detail.data)}
            seqNo={detail.meta._seq_no}
            primaryTerm={detail.meta._primary_term}
            onClose={onClose}
            onReloadLatest={() => {
              detailQuery.refetch();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UpdateResearchForm({
  humId,
  initialValues,
  seqNo,
  primaryTerm,
  onClose,
  onReloadLatest,
}: {
  humId: string;
  initialValues: UpdateResearchFormValues;
  seqNo: number;
  primaryTerm: number;
  onClose: () => void;
  onReloadLatest: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const queryClient = useQueryClient();

  const form = useAppForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      setError(null);
      setIsConflict(false);
      const normalizedUids = normalizeUids(value.uids);

      await mutateAsync({
        body: {
          title: value.title,
          summary: value.summary,
          dataProvider: value.dataProvider,
          researchProject: value.researchProject,
          grant: value.grant,
          relatedPublication: value.relatedPublication,
          _seq_no: seqNo,
          _primary_term: primaryTerm,
        },
        uids: normalizedUids,
      });
    },
  });

  const rollbackOptimistic = (context?: OptimisticContext) => {
    if (!context) return;

    context.previousLists.forEach(([queryKey, data]) => {
      queryClient.setQueryData(queryKey, data);
    });
    context.previousById.forEach(([queryKey, data]) => {
      queryClient.setQueryData(queryKey, data);
    });
  };

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (
      input: UpdateMutationInput,
    ): Promise<UpdateMutationResult> => {
      const updateResult = await $updateResearch({
        data: { humId, body: input.body },
      });
      if (!updateResult.ok) {
        return updateResult;
      }

      const currentUids = updateResult.data.data.uids ?? [];
      if (areStringArraysEqual(currentUids, input.uids)) {
        return { ok: true };
      }

      const updateUidsResult: UpdateResearchUidsResult =
        await $updateResearchUids({
          data: {
            humId,
            body: {
              uids: input.uids,
              _seq_no: updateResult.data.meta._seq_no,
              _primary_term: updateResult.data.meta._primary_term,
            },
          },
        });

      if (!updateUidsResult.ok) {
        return updateUidsResult;
      }

      return { ok: true };
    },
    onMutate: async (
      input: UpdateMutationInput,
    ): Promise<OptimisticContext> => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["researches", "list"] }),
        queryClient.cancelQueries({ queryKey: ["researches", "byId"] }),
      ]);

      const previousLists =
        queryClient.getQueriesData<ResearchSearchUnifiedResponse>({
          queryKey: ["researches", "list"],
        });
      const previousById = queryClient.getQueriesData<ResearchDetailResponse>({
        queryKey: ["researches", "byId"],
      });

      previousLists.forEach(([queryKey]) => {
        queryClient.setQueryData<ResearchSearchUnifiedResponse>(
          queryKey,
          (old) => {
            if (!old) return old;

            const lang = getLangFromResearchListQueryKey(queryKey) ?? "ja";
            const optimisticTitle =
              lang === "en"
                ? (input.body.title?.en ?? input.body.title?.ja ?? "")
                : (input.body.title?.ja ?? input.body.title?.en ?? "");
            const optimisticMethods =
              lang === "en"
                ? (input.body.summary?.methods?.en?.text ??
                  input.body.summary?.methods?.ja?.text)
                : (input.body.summary?.methods?.ja?.text ??
                  input.body.summary?.methods?.en?.text);
            const optimisticTargets =
              lang === "en"
                ? (input.body.summary?.targets?.en?.text ??
                  input.body.summary?.targets?.ja?.text)
                : (input.body.summary?.targets?.ja?.text ??
                  input.body.summary?.targets?.en?.text);

            return {
              ...old,
              data: old.data.map((item) =>
                item.humId === humId
                  ? {
                      ...item,
                      title: optimisticTitle || item.title,
                      methods: optimisticMethods ?? item.methods,
                      targets: optimisticTargets ?? item.targets,
                    }
                  : item,
              ),
            };
          },
        );
      });

      previousById.forEach(([queryKey]) => {
        const queryHumId = getHumIdFromResearchByIdQueryKey(queryKey);
        if (queryHumId !== humId) return;

        queryClient.setQueryData<ResearchDetailResponse>(queryKey, (old) => {
          if (!old) return old;

          return {
            ...old,
            data: {
              ...old.data,
              title: input.body.title ?? old.data.title,
              summary: input.body.summary ?? old.data.summary,
              dataProvider: input.body.dataProvider ?? old.data.dataProvider,
              researchProject:
                input.body.researchProject ?? old.data.researchProject,
              grant: input.body.grant ?? old.data.grant,
              relatedPublication:
                input.body.relatedPublication ?? old.data.relatedPublication,
              uids: input.uids,
            },
          };
        });
      });

      return { previousLists, previousById };
    },
    onSuccess: (
      result: UpdateMutationResult,
      _variables: UpdateMutationInput,
      context: OptimisticContext | undefined,
    ) => {
      if (!result.ok) {
        rollbackOptimistic(context);
        setError(result.error);
        setIsConflict(result.code === "CONFLICT");

        if (
          result.code === "FORBIDDEN" ||
          result.code === "NOT_FOUND" ||
          result.code === "UNAUTHORIZED"
        ) {
          if (result.code === "NOT_FOUND") {
            queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
          }
          onClose();
        }

        return;
      }

      setError(null);
      setIsConflict(false);
      onClose();
    },
    onError: (
      err: Error,
      _variables: UpdateMutationInput,
      context: OptimisticContext | undefined,
    ) => {
      rollbackOptimistic(context);
      setError(err.message ?? "Failed to update research.");
      setIsConflict(false);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["researches", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["researches", "byId"] }),
      ]);
    },
  });

  return (
    <form.AppForm>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        className="flex flex-col gap-4 overflow-auto flex-1 pr-2"
      >
        {error && (
          <div className="text-danger text-sm rounded border border-red-200 bg-red-50 p-2">
            <p>{error}</p>
            {isConflict && (
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="slim"
                  onClick={onReloadLatest}
                >
                  Reload latest
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Title */}
        <fieldset className="flex flex-col gap-2">
          <Label className="font-semibold">Title</Label>
          <div className="nested-form flex flex-col gap-2">
            <form.AppField name="title.ja">
              {(field) => <field.TextField type="col" label="Japanese" />}
            </form.AppField>
            <form.AppField name="title.en">
              {(field) => <field.TextField type="col" label="English" />}
            </form.AppField>
          </div>
        </fieldset>

        {/* Summary */}
        <fieldset className="flex flex-col gap-3">
          <Label className="font-semibold">Summary</Label>
          <div className="nested-form flex flex-col gap-3">
            <BilingualTextValueFields
              form={form}
              baseName="summary.aims"
              label="Aims"
            />
            <BilingualTextValueFields
              form={form}
              baseName="summary.methods"
              label="Methods"
            />
            <BilingualTextValueFields
              form={form}
              baseName="summary.targets"
              label="Targets"
            />

            <UrlArrayFields form={form} baseName="summary.url" label="URLs" />

            <TextValueArrayFields
              form={form}
              baseName="summary.footers"
              label="Footers"
            />
          </div>
        </fieldset>

        {/* Data Providers */}
        <ArraySection
          form={form}
          name="dataProvider"
          label="Data Providers"
          renderItem={(i) => <DataProviderFields form={form} index={i} />}
          emptyItem={{
            name: {
              ja: { text: "", rawHtml: "" },
              en: { text: "", rawHtml: "" },
            },
            email: "",
            orcid: "",
            organization: {
              name: {
                ja: { text: "", rawHtml: "" },
                en: { text: "", rawHtml: "" },
              },
              address: { country: "" },
            },
            datasetIds: [],
            researchTitle: { ja: "", en: "" },
            periodOfDataUse: null,
          }}
        />

        {/* Research Projects */}
        <ArraySection
          form={form}
          name="researchProject"
          label="Research Projects"
          renderItem={(i) => (
            <div className="nested-form flex flex-col gap-2">
              <BilingualTextValueFields
                form={form}
                baseName={`researchProject[${i}].name`}
                label="Name"
              />
              <fieldset className="flex flex-col gap-1">
                <Label className="text-sm">URL</Label>
                <div className="nested-form flex gap-2">
                  <div className="flex-1 flex flex-col gap-1">
                    <form.AppField name={`researchProject[${i}].url.ja.text`}>
                      {(f) => <f.TextField type="col" label="JA Text" />}
                    </form.AppField>
                    <form.AppField name={`researchProject[${i}].url.ja.url`}>
                      {(f) => <f.TextField type="col" label="JA URL" />}
                    </form.AppField>
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <form.AppField name={`researchProject[${i}].url.en.text`}>
                      {(f) => <f.TextField type="col" label="EN Text" />}
                    </form.AppField>
                    <form.AppField name={`researchProject[${i}].url.en.url`}>
                      {(f) => <f.TextField type="col" label="EN URL" />}
                    </form.AppField>
                  </div>
                </div>
              </fieldset>
            </div>
          )}
          emptyItem={{
            name: {
              ja: { text: "", rawHtml: "" },
              en: { text: "", rawHtml: "" },
            },
            url: {
              ja: { text: "", url: "" },
              en: { text: "", url: "" },
            },
          }}
        />

        {/* Grants */}
        <ArraySection
          form={form}
          name="grant"
          label="Grants"
          renderItem={(i) => (
            <div className="nested-form flex flex-col gap-2">
              <form.AppField name={`grant[${i}].id`} mode="array">
                {(field) => (
                  <div className="flex flex-col gap-1">
                    <Label className="text-sm">Grant IDs</Label>
                    {field.state.value?.map((_: string, j: number) => (
                      <div key={j} className="flex items-center gap-1">
                        <form.AppField name={`grant[${i}].id[${j}]`}>
                          {(f) => <f.TextField />}
                        </form.AppField>
                        <button
                          type="button"
                          onClick={() => {
                            field.removeValue(j);
                          }}
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
                      onClick={() => {
                        field.pushValue("");
                      }}
                    >
                      Add ID
                    </Button>
                  </div>
                )}
              </form.AppField>
              <fieldset className="flex gap-2">
                <div className="flex-1">
                  <form.AppField name={`grant[${i}].title.ja`}>
                    {(f) => <f.TextField type="col" label="Title (JA)" />}
                  </form.AppField>
                </div>
                <div className="flex-1">
                  <form.AppField name={`grant[${i}].title.en`}>
                    {(f) => <f.TextField type="col" label="Title (EN)" />}
                  </form.AppField>
                </div>
              </fieldset>
              <fieldset className="flex gap-2">
                <div className="flex-1">
                  <form.AppField name={`grant[${i}].agency.name.ja`}>
                    {(f) => <f.TextField type="col" label="Agency (JA)" />}
                  </form.AppField>
                </div>
                <div className="flex-1">
                  <form.AppField name={`grant[${i}].agency.name.en`}>
                    {(f) => <f.TextField type="col" label="Agency (EN)" />}
                  </form.AppField>
                </div>
              </fieldset>
            </div>
          )}
          emptyItem={{
            id: [],
            title: { ja: "", en: "" },
            agency: { name: { ja: "", en: "" } },
          }}
        />

        {/* Related Publications */}
        <ArraySection
          form={form}
          name="relatedPublication"
          label="Related Publications"
          renderItem={(i) => (
            <div className="nested-form flex flex-col gap-2">
              <fieldset className="flex gap-2">
                <div className="flex-1">
                  <form.AppField name={`relatedPublication[${i}].title.ja`}>
                    {(f) => <f.TextField type="col" label="Title (JA)" />}
                  </form.AppField>
                </div>
                <div className="flex-1">
                  <form.AppField name={`relatedPublication[${i}].title.en`}>
                    {(f) => <f.TextField type="col" label="Title (EN)" />}
                  </form.AppField>
                </div>
              </fieldset>
              <form.AppField name={`relatedPublication[${i}].doi`}>
                {(f) => <f.TextField type="col" label="DOI" />}
              </form.AppField>
              <form.AppField
                name={`relatedPublication[${i}].datasetIds`}
                mode="array"
              >
                {(field) => (
                  <div className="flex flex-col gap-1">
                    <Label className="text-sm">Dataset IDs</Label>
                    {field.state.value?.map((_: string, j: number) => (
                      <div key={j} className="flex items-center gap-1">
                        <form.AppField
                          name={`relatedPublication[${i}].datasetIds[${j}]`}
                        >
                          {(f) => <f.TextField />}
                        </form.AppField>
                        <button
                          type="button"
                          onClick={() => {
                            field.removeValue(j);
                          }}
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
                      onClick={() => {
                        field.pushValue("");
                      }}
                    >
                      Add Dataset ID
                    </Button>
                  </div>
                )}
              </form.AppField>
            </div>
          )}
          emptyItem={{
            title: { ja: "", en: "" },
            doi: "",
            datasetIds: [],
          }}
        />

        {/* UIDs */}
        <form.AppField name="uids" mode="array">
          {(field) => (
            <fieldset className="flex flex-col gap-2">
              <Label className="font-semibold">User IDs (uids)</Label>
              <div className="nested-form flex flex-col gap-1">
                {field.state.value?.map((_: string, i: number) => (
                  <div key={i} className="flex items-center gap-1">
                    <form.AppField name={`uids[${i}]`}>
                      {(f) => <f.TextField />}
                    </form.AppField>
                    <button
                      type="button"
                      onClick={() => {
                        field.removeValue(i);
                      }}
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
                  onClick={() => {
                    field.pushValue("");
                  }}
                >
                  Add UID
                </Button>
              </div>
            </fieldset>
          )}
        </form.AppField>

        <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t">
          <form.Subscribe selector={(s) => s.canSubmit}>
            {(canSubmit) => (
              <Button
                type="submit"
                variant="accent"
                disabled={!canSubmit || isPending}
              >
                {isPending ? "Updating..." : "Update"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </form.AppForm>
  );
}

// --- Helper sub-components ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;
type ArraySectionName =
  | "dataProvider"
  | "researchProject"
  | "grant"
  | "relatedPublication";
type ArraySectionItem =
  | NonNullable<UpdateResearchFormValues["dataProvider"]>[number]
  | NonNullable<UpdateResearchFormValues["researchProject"]>[number]
  | NonNullable<UpdateResearchFormValues["grant"]>[number]
  | NonNullable<UpdateResearchFormValues["relatedPublication"]>[number];

const BilingualTextValueFields = withForm({
  defaultValues,
  props: {} as { baseName: string; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-1">
        <Label className="text-sm">{label}</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <form.AppField name={`${baseName}.ja.text` as AnyName}>
              {(f) => <f.TextField type="col" label="JA" />}
            </form.AppField>
          </div>
          <div className="flex-1">
            <form.AppField name={`${baseName}.en.text` as AnyName}>
              {(f) => <f.TextField type="col" label="EN" />}
            </form.AppField>
          </div>
        </div>
      </fieldset>
    );
  },
});

const DataProviderFields = withForm({
  defaultValues,
  props: {} as { index: number },
  render({ form, index: i }) {
    return (
      <div className="nested-form flex flex-col gap-2">
        <BilingualTextValueFields
          form={form}
          baseName={`dataProvider[${i}].name`}
          label="Name"
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <form.AppField name={`dataProvider[${i}].email` as AnyName}>
              {(f) => <f.TextField type="col" label="Email" />}
            </form.AppField>
          </div>
          <div className="flex-1">
            <form.AppField name={`dataProvider[${i}].orcid` as AnyName}>
              {(f) => <f.TextField type="col" label="ORCID" />}
            </form.AppField>
          </div>
        </div>
        <fieldset className="flex flex-col gap-1">
          <Label className="text-sm">Organization</Label>
          <div className="nested-form flex flex-col gap-2">
            <BilingualTextValueFields
              form={form}
              baseName={`dataProvider[${i}].organization.name`}
              label="Organization Name"
            />
            <form.AppField
              name={
                `dataProvider[${i}].organization.address.country` as AnyName
              }
            >
              {(f) => <f.TextField type="col" label="Country" />}
            </form.AppField>
          </div>
        </fieldset>
        <fieldset className="flex gap-2">
          <div className="flex-1">
            <form.AppField
              name={`dataProvider[${i}].researchTitle.ja` as AnyName}
            >
              {(f) => <f.TextField type="col" label="Research Title (JA)" />}
            </form.AppField>
          </div>
          <div className="flex-1">
            <form.AppField
              name={`dataProvider[${i}].researchTitle.en` as AnyName}
            >
              {(f) => <f.TextField type="col" label="Research Title (EN)" />}
            </form.AppField>
          </div>
        </fieldset>
        <form.AppField
          name={`dataProvider[${i}].datasetIds` as AnyName}
          mode="array"
        >
          {(field) => (
            <div className="flex flex-col gap-1">
              <Label className="text-sm">Dataset IDs</Label>
              {field.state.value?.map((_: string, j: number) => (
                <div key={j} className="flex items-center gap-1">
                  <form.AppField
                    name={`dataProvider[${i}].datasetIds[${j}]` as AnyName}
                  >
                    {(f) => <f.TextField />}
                  </form.AppField>
                  <button
                    type="button"
                    onClick={() => {
                      field.removeValue(j);
                    }}
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
                onClick={() => {
                  field.pushValue("");
                }}
              >
                Add Dataset ID
              </Button>
            </div>
          )}
        </form.AppField>
      </div>
    );
  },
});

const UrlArrayFields = withForm({
  defaultValues,
  props: {} as { baseName: "summary.url"; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-2">
        <Label className="text-sm">{label}</Label>
        {(["ja", "en"] as const).map((lang) => (
          <form.AppField key={lang} name={`${baseName}.${lang}`} mode="array">
            {(field) => (
              <div className="flex flex-col gap-1">
                <Label className="text-xs uppercase">{lang}</Label>
                {field.state.value?.map((_: unknown, j: number) => (
                  <div key={j} className="flex items-center gap-1">
                    <form.AppField
                      name={`${baseName}.${lang}[${j}].text` as AnyName}
                    >
                      {(f) => <f.TextField label="Text" />}
                    </form.AppField>
                    <form.AppField
                      name={`${baseName}.${lang}[${j}].url` as AnyName}
                    >
                      {(f) => <f.TextField label="URL" />}
                    </form.AppField>
                    <button
                      type="button"
                      onClick={() => {
                        field.removeValue(j);
                      }}
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
                  onClick={() => {
                    field.pushValue({ text: "", url: "" });
                  }}
                >
                  Add {lang.toUpperCase()}
                </Button>
              </div>
            )}
          </form.AppField>
        ))}
      </fieldset>
    );
  },
});

const TextValueArrayFields = withForm({
  defaultValues,
  props: {} as { baseName: "summary.footers"; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-2">
        <Label className="text-sm">{label}</Label>
        {(["ja", "en"] as const).map((lang) => (
          <form.AppField key={lang} name={`${baseName}.${lang}`} mode="array">
            {(field) => (
              <div className="flex flex-col gap-1">
                <Label className="text-xs uppercase">{lang}</Label>
                {field.state.value?.map((_: unknown, j: number) => (
                  <div key={j} className="flex items-center gap-1">
                    <form.AppField
                      name={`${baseName}.${lang}[${j}].text` as AnyName}
                    >
                      {(f) => <f.TextField label="Text" />}
                    </form.AppField>
                    <button
                      type="button"
                      onClick={() => {
                        field.removeValue(j);
                      }}
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
                  onClick={() => {
                    field.pushValue({ text: "", rawHtml: "" });
                  }}
                >
                  Add {lang.toUpperCase()}
                </Button>
              </div>
            )}
          </form.AppField>
        ))}
      </fieldset>
    );
  },
});

const ArraySection = withForm({
  defaultValues,
  props: {} as {
    name: ArraySectionName;
    label: string;
    renderItem: (index: number) => React.ReactNode;
    emptyItem: ArraySectionItem;
  },
  render({ form, name, label, renderItem, emptyItem }) {
    return (
      <form.AppField name={name} mode="array">
        {(field) => (
          <fieldset className="flex flex-col gap-2">
            <Label className="font-semibold">{label}</Label>
            <div className="flex flex-col gap-3">
              {field.state.value?.map((_: unknown, i: number) => (
                <div key={i} className="relative rounded border p-3 pr-10">
                  <button
                    type="button"
                    className="absolute top-2 right-2 z-10"
                    onClick={() => {
                      field.removeValue(i);
                    }}
                  >
                    <Trash2 className="text-danger size-4" />
                  </button>
                  {renderItem(i)}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="slim"
                className="self-start"
                onClick={() => {
                  field.pushValue(emptyItem);
                }}
              >
                Add {label.replace(/s$/, "")}
              </Button>
            </div>
          </fieldset>
        )}
      </form.AppField>
    );
  },
});
