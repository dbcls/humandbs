import type {
  ResearchDetailResponse,
  ResearchSearchResponse,
  UpdateResearchRequest,
} from "@humandbs/backend/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { useAppForm } from "@/components/form-context/FormContext";
import {
  ArrayField,
  BilingualTextValueField,
  GrantField,
  ModifiedTag,
  PersonField,
  PublicationField,
  ResearchProjectField,
  TextValueArrayField,
  UrlArrayField,
  useFieldModified,
} from "@/components/form-context/fields";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import {
  $updateResearch,
  $updateResearchUids,
  getResearchForEditQueryOptions,
  type UpdateResearchUidsResult,
} from "@/serverFunctions/researches";
import { z } from "zod";

import { UpdateResearchRequestSchema } from "@humandbs/backend/types";

const formSchema = UpdateResearchRequestSchema;

type UpdateResearchFormValues = z.infer<typeof UpdateResearchRequestSchema>;

// interface UpdateResearchFormValues {
//   title: { ja: string; en: string };
//   summary: {
//     aims: {
//       ja: { text: string; rawHtml: string };
//       en: { text: string; rawHtml: string };
//     };
//     methods: {
//       ja: { text: string; rawHtml: string };
//       en: { text: string; rawHtml: string };
//     };
//     targets: {
//       ja: { text: string; rawHtml: string };
//       en: { text: string; rawHtml: string };
//     };
//     url: {
//       ja: { text: string; url: string }[];
//       en: { text: string; url: string }[];
//     };
//     footers: {
//       ja: { text: string; rawHtml: string }[];
//       en: { text: string; rawHtml: string }[];
//     };
//   };
//   dataProvider: NonNullable<UpdateResearchRequest["dataProvider"]>;
//   researchProject: NonNullable<UpdateResearchRequest["researchProject"]>;
//   grant: NonNullable<UpdateResearchRequest["grant"]>;
//   relatedPublication: NonNullable<UpdateResearchRequest["relatedPublication"]>;
//   controlledAccessUser: NonNullable<
//     UpdateResearchRequest["controlledAccessUser"]
//   >;
//   uids: string[];
// }

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
  },
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  controlledAccessUser: [],
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
    controlledAccessUser:
      (
        (detail as Record<string, unknown>).controlledAccessUser as
          | Array<Record<string, unknown>>
          | undefined
          | null
      )?.map((person) => ({
        name: toBilingualTextValue(
          person.name as {
            ja?: { text?: string | null; rawHtml?: string | null } | null;
            en?: { text?: string | null; rawHtml?: string | null } | null;
          },
        ),
        email: (person.email as string) ?? "",
        orcid: (person.orcid as string) ?? "",
        organization: {
          name: toBilingualTextValue(
            (person.organization as Record<string, unknown> | null)?.name as {
              ja?: { text?: string | null; rawHtml?: string | null } | null;
              en?: { text?: string | null; rawHtml?: string | null } | null;
            },
          ),
          address: {
            country:
              (
                (person.organization as Record<string, unknown> | null)
                  ?.address as { country?: string | null } | null
              )?.country ?? "",
          },
        },
        periodOfDataUse:
          (person.periodOfDataUse as {
            startDate: string | null;
            endDate: string | null;
          } | null) ?? null,
      })) ?? [],
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
    data: ResearchSearchResponse | undefined,
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

// --- Tab Modified Tag helpers ---

function TabModifiedTag({
  fieldName,
  initialValues,
}: {
  fieldName: string;
  initialValues: UpdateResearchFormValues;
}) {
  const { isModified } = useFieldModified(
    fieldName,
    initialValues as unknown as Record<string, unknown>,
  );
  return <ModifiedTag isModified={isModified} />;
}

function MultiFieldModifiedTag({
  fieldNames,
  initialValues,
}: {
  fieldNames: string[];
  initialValues: UpdateResearchFormValues;
}) {
  // Check if any of the listed fields are modified
  const anyModified = fieldNames.some((name) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { isModified } = useFieldModified(
      name,
      initialValues as unknown as Record<string, unknown>,
    );
    return isModified;
  });
  return <ModifiedTag isModified={anyModified} />;
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
          controlledAccessUser: value.controlledAccessUser,
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

      const previousLists = queryClient.getQueriesData<ResearchSearchResponse>({
        queryKey: ["researches", "list"],
      });
      const previousById = queryClient.getQueriesData<ResearchDetailResponse>({
        queryKey: ["researches", "byId"],
      });

      previousLists.forEach(([queryKey]) => {
        queryClient.setQueryData<ResearchSearchResponse>(queryKey, (old) => {
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
        });
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

        <Tabs defaultValue="general" className="flex-1">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="general" className="gap-1">
              General
              <TabModifiedTag fieldName="title" initialValues={initialValues} />
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-1">
              Summary
              <TabModifiedTag
                fieldName="summary"
                initialValues={initialValues}
              />
            </TabsTrigger>
            <TabsTrigger value="dataProvider" className="gap-1">
              Data Provider
              <TabModifiedTag
                fieldName="dataProvider"
                initialValues={initialValues}
              />
            </TabsTrigger>
            <TabsTrigger value="researchProject" className="gap-1">
              Research Project
              <TabModifiedTag
                fieldName="researchProject"
                initialValues={initialValues}
              />
            </TabsTrigger>
            <TabsTrigger value="grants" className="gap-1">
              Grants
              <TabModifiedTag fieldName="grant" initialValues={initialValues} />
            </TabsTrigger>
            <TabsTrigger value="publications" className="gap-1">
              Publications
              <TabModifiedTag
                fieldName="relatedPublication"
                initialValues={initialValues}
              />
            </TabsTrigger>
            <TabsTrigger value="controlledAccess" className="gap-1">
              Controlled Access
              <TabModifiedTag
                fieldName="controlledAccessUser"
                initialValues={initialValues}
              />
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="flex flex-col gap-4">
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
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary" className="flex flex-col gap-3">
            <BilingualTextValueField
              form={form}
              baseName="summary.aims"
              label="Aims"
            />
            <BilingualTextValueField
              form={form}
              baseName="summary.methods"
              label="Methods"
            />
            <BilingualTextValueField
              form={form}
              baseName="summary.targets"
              label="Targets"
            />
            <UrlArrayField form={form} baseName="summary.url" label="URLs" />
            <TextValueArrayField
              form={form}
              baseName="summary.footers"
              label="Footers"
            />
          </TabsContent>

          {/* Data Provider Tab */}
          <TabsContent value="dataProvider" className="flex flex-col gap-3">
            <ArrayField
              form={form}
              name="dataProvider"
              icon="👤"
              getItemTitle={(item: Record<string, unknown>) => {
                const name = item.name as {
                  en?: { text?: string };
                  ja?: { text?: string };
                };
                return name?.en?.text || name?.ja?.text || "Unnamed";
              }}
              defaultItem={() => ({
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
              })}
              renderItem={(i) => (
                <PersonField
                  form={form}
                  baseName={`dataProvider[${i}]`}
                  withDatasetIds
                />
              )}
            />
          </TabsContent>

          {/* Research Project Tab */}
          <TabsContent value="researchProject" className="flex flex-col gap-3">
            <ArrayField
              form={form}
              name="researchProject"
              icon="📁"
              getItemTitle={(item: Record<string, unknown>) => {
                const name = item.name as {
                  en?: { text?: string };
                  ja?: { text?: string };
                };
                return name?.en?.text || name?.ja?.text || "Unnamed";
              }}
              defaultItem={() => ({
                name: {
                  ja: { text: "", rawHtml: "" },
                  en: { text: "", rawHtml: "" },
                },
                url: {
                  ja: { text: "", url: "" },
                  en: { text: "", url: "" },
                },
              })}
              renderItem={(i) => (
                <ResearchProjectField
                  form={form}
                  baseName={`researchProject[${i}]`}
                />
              )}
            />
          </TabsContent>

          {/* Grants Tab */}
          <TabsContent value="grants" className="flex flex-col gap-3">
            <ArrayField
              form={form}
              name="grant"
              icon="🎓"
              getItemTitle={(item: Record<string, unknown>) => {
                const title = item.title as { en?: string; ja?: string };
                return title?.en || title?.ja || "Unnamed";
              }}
              defaultItem={() => ({
                id: [],
                title: { ja: "", en: "" },
                agency: { name: { ja: "", en: "" } },
              })}
              renderItem={(i) => (
                <GrantField form={form} baseName={`grant[${i}]`} />
              )}
            />
          </TabsContent>

          {/* Publications Tab */}
          <TabsContent value="publications" className="flex flex-col gap-3">
            <ArrayField
              form={form}
              name="relatedPublication"
              icon="📄"
              getItemTitle={(item: Record<string, unknown>) => {
                const title = item.title as { en?: string; ja?: string };
                return title?.en || title?.ja || "Unnamed";
              }}
              defaultItem={() => ({
                title: { ja: "", en: "" },
                doi: "",
              })}
              renderItem={(i) => (
                <PublicationField
                  form={form}
                  baseName={`relatedPublication[${i}]`}
                />
              )}
            />
          </TabsContent>

          {/* Controlled Access Tab */}
          <TabsContent value="controlledAccess" className="flex flex-col gap-3">
            <ArrayField
              form={form}
              name="controlledAccessUser"
              icon="🔒"
              getItemTitle={(item: Record<string, unknown>) => {
                const name = item.name as {
                  en?: { text?: string };
                  ja?: { text?: string };
                };
                return name?.en?.text || name?.ja?.text || "Unnamed";
              }}
              defaultItem={() => ({
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
                periodOfDataUse: null,
              })}
              renderItem={(i) => (
                <PersonField
                  form={form}
                  baseName={`controlledAccessUser[${i}]`}
                  withPeriodOfDataUse
                />
              )}
            />
          </TabsContent>
        </Tabs>

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
