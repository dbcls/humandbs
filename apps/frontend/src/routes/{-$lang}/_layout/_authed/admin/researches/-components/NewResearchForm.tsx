import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { useState } from "react";

import type { CreateResearchRequest } from "@humandbs/backend/types";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { DataProviderArrayField } from "@/components/form-context/research-fields/DataProviderArrayField";
import { GrantArrayField } from "@/components/form-context/research-fields/GrantArrayField";
import { RelatedPublicationArrayField } from "@/components/form-context/research-fields/RelatedPublicationArrayField";
import { ResearchProjectArrayField } from "@/components/form-context/research-fields/ResearchProjectArrayField";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import type { CreateResearchResult } from "@/serverFunctions/researches";
import { $createResearch } from "@/serverFunctions/researches";

import { AdminStatusMessage } from "../../-components/AdminStatusMessage";
import { MergeResearchDialog } from "./MergeResearch/index";
import { DUMMY_HUM_ID } from "./utils/dummyResearch";
import type { NewResearchMergeValues } from "./utils/researchValues";
import { pickNewResearchMergeValues, toResearchValuesForMerge } from "./utils/researchValues";

const defaultValues: CreateResearchRequest = {
  humId: undefined,
  title: { ja: "", en: "" },
  summary: {
    aims: { ja: { text: "" }, en: { text: "" } },
    methods: { ja: { text: "" }, en: { text: "" } },
    targets: { ja: { text: "" }, en: { text: "" } },
    url: { ja: [], en: [] },
  },
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  uids: [],
  initialReleaseNote: {
    ja: { text: "" },
    en: { text: "" },
  },
};

export function NewResearchForm({
  lang,
  onCreated,
  onDiscard,
}: {
  lang: Locale;
  onCreated: (humId: string, relatedAccessions: string[]) => void;
  onDiscard: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [relatedAccessions, setRelatedAccessions] = useState<string[]>([]);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (body: CreateResearchRequest) => $createResearch({ data: body }),
    onSuccess: (result: CreateResearchResult) => {
      if (!result.ok) {
        if (result.code === "HUMID_CONFLICT") {
          form.setFieldMeta("humId", (prev) => ({
            ...prev,
            errorMap: { onSubmit: result.error },
          }));
        } else {
          setError(result.error);
        }
        return;
      }
      // Remove dummy entry from cache
      queryClient.setQueriesData<{
        pages: Array<{ data: Array<{ humId: string }> }>;
      }>({ queryKey: ["researches", "list", "infinite"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.filter((r) => r.humId !== DUMMY_HUM_ID),
          })),
        };
      });
      queryClient.invalidateQueries({ queryKey: ["researches", "list"] });
      onCreated(result.data.data.humId, relatedAccessions);
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to create research.");
    },
  });

  const form = useAppForm({
    defaultValues,

    onSubmit: async ({ value }) => {
      setError(null);
      const normalizedHumId =
        value.humId == null || value.humId.trim() === "" ? undefined : value.humId.trim();
      await mutateAsync({ ...value, humId: normalizedHumId });
    },
  });
  const formValues = useStore(form.store, (state) => state.values);

  function applyMergedValues(values: NewResearchMergeValues, incoming: string[]) {
    setRelatedAccessions(incoming);
    if (values.title !== undefined) form.setFieldValue("title", values.title);
    if (values.summary !== undefined) form.setFieldValue("summary", values.summary);
    if (values.dataProvider !== undefined) form.setFieldValue("dataProvider", values.dataProvider);
    if (values.researchProject !== undefined)
      form.setFieldValue("researchProject", values.researchProject);
    if (values.grant !== undefined) form.setFieldValue("grant", values.grant);
    if (values.relatedPublication !== undefined)
      form.setFieldValue("relatedPublication", values.relatedPublication);
  }

  return (
    <Card
      className="flex h-full min-w-0 flex-1 flex-col"
      caption="New Research"
      containerClassName="flex flex-1 flex-col min-h-0"
    >
      <form.AppForm>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {error ? <AdminStatusMessage className="mx-5 mt-5">{error}</AdminStatusMessage> : null}

          <div className="mx-5 mt-5 flex justify-end gap-2">
            <MergeResearchDialog
              className="mr-auto"
              currentValues={toResearchValuesForMerge(formValues)}
              onMerge={(values, relatedAccessions) =>
                applyMergedValues(pickNewResearchMergeValues(values), relatedAccessions)
              }
            />
            <Button
              type="button"
              variant="outline"
              size={"lg"}
              disabled={isPending}
              onClick={onDiscard}
            >
              Discard
            </Button>
            <Button type="submit" variant="accent" size={"lg"} disabled={isPending}>
              {isPending ? "Creating…" : "Create"}
            </Button>
          </div>

          <div className="flex shrink-0 flex-col gap-4 px-5 pt-5">
            <form.AppField
              name="humId"
              validators={{
                onChange: ({ value }) =>
                  !value || value.trim() === "" ? "Research ID is required" : undefined,
              }}
            >
              {(field) => <field.TextField type="col" label="Research ID (humId)*" />}
            </form.AppField>

            <form.AppField name="uids" mode="array">
              {(field) => (
                <fieldset className="flex flex-col gap-2">
                  <Label>User IDs (uids)</Label>
                  <div className="nested-form flex w-full flex-col gap-1">
                    {field.state.value?.map((_, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <form.AppField name={`uids[${i}]`}>
                          {(f) => <f.TextField className="flex-1" />}
                        </form.AppField>
                        <Button
                          size="icon"
                          variant="plain"
                          type="button"
                          onClick={() => field.removeValue(i)}
                        >
                          <Trash2 className="size-4 text-danger" />
                        </Button>
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

            <form.AppField name="initialReleaseNote">
              {(field) => (
                <field.BilingualTextValueField
                  label="Initial Release Note"
                  inputsClassName="flex w-full gap-2"
                />
              )}
            </form.AppField>
          </div>

          <Tabs defaultValue="title" className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 overflow-x-auto px-5">
              <TabsList variant="line">
                <TabsTrigger variant="line" value="title">
                  Title
                </TabsTrigger>
                <TabsTrigger variant="line" value="summary">
                  Summary
                </TabsTrigger>
                <TabsTrigger variant="line" value="dataProvider">
                  Data providers
                </TabsTrigger>
                <TabsTrigger variant="line" value="researchProject">
                  Research project
                </TabsTrigger>
                <TabsTrigger variant="line" value="grants">
                  Grant
                </TabsTrigger>
                <TabsTrigger variant="line" value="publications">
                  Related publication
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-5">
              <TabsContent value="title">
                <form.AppField name="title">
                  {(field) => <field.BilingualTextField label="Title" />}
                </form.AppField>
              </TabsContent>

              <TabsContent value="summary" className="flex flex-col gap-4">
                <form.AppField name="summary.aims">
                  {(field) => (
                    <field.BilingualTextValueField
                      label="Aims"
                      inputsClassName="flex w-full gap-2"
                    />
                  )}
                </form.AppField>
                <form.AppField name="summary.methods">
                  {(field) => (
                    <field.BilingualTextValueField
                      label="Methods"
                      inputsClassName="flex w-full gap-2"
                    />
                  )}
                </form.AppField>
                <form.AppField name="summary.targets">
                  {(field) => (
                    <field.BilingualTextValueField
                      label="Targets"
                      inputsClassName="flex w-full gap-2"
                    />
                  )}
                </form.AppField>
                <form.AppField name="summary.url">
                  {(field) => <field.BilingualURLArrayField label="URLs" />}
                </form.AppField>
              </TabsContent>

              <TabsContent value="dataProvider">
                <DataProviderArrayField form={form} />
              </TabsContent>

              <TabsContent value="researchProject">
                <ResearchProjectArrayField form={form} />
              </TabsContent>

              <TabsContent value="grants">
                <GrantArrayField form={form} />
              </TabsContent>

              <TabsContent value="publications">
                <RelatedPublicationArrayField form={form} />
              </TabsContent>
            </div>
          </Tabs>
        </form>
      </form.AppForm>
    </Card>
  );
}
