import type { CreateResearchRequest } from "@humandbs/backend/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { DataProviderArrayField } from "@/components/form-context/researchFields/DataProviderArrayField";
import { GrantArrayField } from "@/components/form-context/researchFields/GrantArrayField";
import { RelatedPublicationArrayField } from "@/components/form-context/researchFields/RelatedPublicationArrayField";
import { ResearchProjectArrayField } from "@/components/form-context/researchFields/ResearchProjectArrayField";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import {
  $createResearch,
  type CreateResearchResult,
} from "@/serverFunctions/researches";
import { DUMMY_HUM_ID } from "./-dummyResearch";

const defaultValues: CreateResearchRequest = {
  humId: undefined,
  title: { ja: "", en: "" },
  summary: {
    aims: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
    methods: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
    targets: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
    url: { ja: [], en: [] },
  },
  dataProvider: [],
  researchProject: [],
  grant: [],
  relatedPublication: [],
  uids: [],
  initialReleaseNote: {
    ja: { text: "", rawHtml: "" },
    en: { text: "", rawHtml: "" },
  },
};

export function NewResearchForm({
  lang,
  onCreated,
}: {
  lang: Locale;
  onCreated: (humId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (body: CreateResearchRequest) =>
      $createResearch({ data: body }),
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
      onCreated(result.data.data.humId);
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
        value.humId == null || value.humId.trim() === ""
          ? undefined
          : value.humId.trim();
      await mutateAsync({ ...value, humId: normalizedHumId });
    },
  });

  return (
    <Card
      className="flex h-full flex-1 flex-col min-w-0"
      caption="New Research"
      containerClassName="flex flex-1 flex-col min-h-0"
    >
      <form.AppForm>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-1 flex-col min-h-0"
        >
          {error && (
            <div className="mx-5 mt-5 rounded border border-red-200 bg-red-50 p-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="mx-5 mt-5 flex items-center gap-2">
            <Button
              type="submit"
              variant="accent"
              disabled={isPending}
              size="slim"
            >
              {isPending ? "Creating…" : "Create"}
            </Button>
          </div>

          <div className="flex flex-col gap-4 px-5 pt-5 shrink-0">
            <form.AppField name="humId">
              {(field) => (
                <div className="flex flex-col gap-1">
                  <field.TextField type="col" label="Research ID (humId)" />
                  {field.state.meta.errors.length > 0 && (
                    <em role="alert" className="text-danger text-xs">
                      {field.state.meta.errors.map((e, i) => (
                        <p key={i}>{String(e)}</p>
                      ))}
                    </em>
                  )}
                </div>
              )}
            </form.AppField>

            <form.AppField name="uids" mode="array">
              {(field) => (
                <fieldset className="flex flex-col gap-2">
                  <Label>User IDs (uids)</Label>
                  <div className="nested-form flex flex-col gap-1">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(field.state.value as any[])?.map(
                      (_: string, i: number) => (
                        <div key={i} className="flex items-center gap-1">
                          <form.AppField name={`uids[${i}]`}>
                            {(f) => <f.TextField />}
                          </form.AppField>
                          <button
                            type="button"
                            onClick={() => field.removeValue(i)}
                          >
                            <Trash2 className="text-danger size-4" />
                          </button>
                        </div>
                      ),
                    )}
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

            <form.AppField name="initialReleaseNote">
              {(field) => (
                <field.BilingualTextValueField
                  label="Initial Release Note"
                  inputsClassName="flex w-full gap-2"
                />
              )}
            </form.AppField>
          </div>

          <Tabs
            defaultValue="title"
            className="mt-4 flex flex-col flex-1 min-h-0"
          >
            <div className="overflow-x-auto px-5 shrink-0">
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
