import { Card } from "@/components/Card";
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
            <TabsTrigger value="">Summary</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
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
