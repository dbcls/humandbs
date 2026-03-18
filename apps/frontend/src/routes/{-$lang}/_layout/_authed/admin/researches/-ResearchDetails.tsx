import { Card } from "@/components/Card";
import { PersonField } from "@/components/form-context/fields/PersonField";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/config/i18n";
import { getResearchQueryOptions } from "@/serverFunctions/researches";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  useAppForm,
  withFieldGroup,
} from "@/components/form-context/FormContext";
import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";
import { Label } from "@/components/ui/label";

export function ResearchDetails({
  humId,
  lang,
}: {
  humId: string;
  lang: Locale;
}) {
  const { data } = useSuspenseQuery(getResearchQueryOptions({ humId, lang }));
  const researchValues = data.data;

  console.log("researchValues", researchValues);
  const { _seq_no, _primary_term } = data.meta;
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const [editingHumId, setEditingHumId] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: researchValues,
    onSubmit: async ({ value }) => {
      // await mutateAsync({
      //   body: {
      //     title: value.title,
      //     summary: value.summary,
      //     dataProvider: value.dataProvider,
      //     researchProject: value.researchProject,
      //     grant: value.grant,
      //     relatedPublication: value.relatedPublication,
      //     controlledAccessUser: value.controlledAccessUser,
      //     _seq_no: seqNo,
      //     _primary_term: primaryTerm,
      //   },
      //   uids: normalizedUids,
      // });
    },
  });

  return (
    <>
      <Card
        className="flex h-full flex-1 flex-col"
        caption={researchValues.humId}
        containerClassName="flex flex-1 flex-col overflow-auto"
      >
        <Tabs defaultValue="basic">
          <TabsList>
            <TabsTrigger value="title">Title</TabsTrigger>

            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="datasets">Datasets</TabsTrigger>
            <TabsTrigger value="dataProvider">Data Provider</TabsTrigger>
            <TabsTrigger value="researchProject">Research Project</TabsTrigger>
          </TabsList>
          <TabsContent value="title">
            <form.AppField name="title">
              {(field) => <field.BilingualTextField />}
            </form.AppField>
          </TabsContent>
          <TabsContent value="summary">
            <div>Summary </div>
            <SummaryForm form={form} fields="summary" />
          </TabsContent>
          <TabsContent value="dataProvider">
            <DataProviderForm form={form} fields="dataProvider" />
            {/*<ArrayField
              form={form}
              name="dataProvider"
              defaultItem={() => ({
                name: { ja: { text: "", rawHtml: "" }, en: { text: "", rawHtml: "" } },
                email: null,
                orcid: null,
                organization: null,
              })}
              getItemTitle={(item) => item?.name?.en?.text ?? item?.name?.ja?.text ?? ""}
              label="Data Providers"
              renderItem={(i) => <DataProviderItemFields form={form} index={i} />}
            />*/}
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}

const summarySchema = z.object({ ...ResearchDetailSchema.shape.summary.shape });

type SummaryFields = z.infer<typeof summarySchema>;

const SummaryForm = withFieldGroup({
  defaultValues: {} as SummaryFields,
  render: function Render({ group }) {
    return (
      <div>
        <group.AppField name="aims">
          {(field) => <field.BilingualTextValueField label={"Aims"} />}
        </group.AppField>
        <group.AppField name="methods">
          {(field) => <field.BilingualTextValueField label={"Methods"} />}
        </group.AppField>
        <group.AppField name="targets">
          {(field) => <field.BilingualTextValueField label={"Targets"} />}
        </group.AppField>
        <group.AppField name="url">
          {(field) => <field.BilingualURLArrayField label={"URLs"} />}
        </group.AppField>
      </div>
    );
  },
});

const dataProviderSchema = z.object({
  ...ResearchDetailSchema.shape.dataProvider.element.shape,
});

type Person = z.infer<typeof dataProviderSchema>;

const DataProviderForm = withFieldGroup({
  defaultValues: [] as Person[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render: function Render({ group, form }) {
    return (
      <form.AppField name="dataProvider" mode="array">
        {(field: any) => {
          const items: Person[] = field.state.value ?? [];
          return (
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-semibold">Data Providers</legend>
              {items.map((_item, i) => (
                <div key={i} className="rounded border bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      #{i + 1}{" "}
                      {_item?.name?.en?.text ?? _item?.name?.ja?.text ?? ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => field.removeValue(i)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                  <PersonField form={group} baseName={`[${i}]`} />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  field.pushValue({
                    name: {
                      ja: { text: "", rawHtml: "" },
                      en: { text: "", rawHtml: "" },
                    },
                    email: null,
                    orcid: null,
                    organization: null,
                  })
                }
                className="w-full rounded border border-dashed py-2 text-sm text-gray-500 hover:bg-gray-50"
              >
                + Add
              </button>
            </fieldset>
          );
        }}
      </form.AppField>
    );
  },
});
