import { ResearchDetailSchema } from "@humandbs/backend/types";
import { z } from "zod";

import { withFieldGroup } from "@/components/form-context/FormContext";
import { BilingualColumnHeader } from "./BilingualColumnHeader";

const summarySchema = z.object({ ...ResearchDetailSchema.shape.summary.shape });

type SummaryFields = z.infer<typeof summarySchema>;

export const SummaryForm = withFieldGroup({
  defaultValues: {} as SummaryFields,
  render: function Render({ group }) {
    return (
      <div className="flex flex-col gap-4">
        <BilingualColumnHeader />
        <group.AppField name="aims">
          {(field) => (
            <field.BilingualTextValueField
              label="Aims"
              inputsClassName="flex w-full gap-2"
            />
          )}
        </group.AppField>
        <group.AppField name="methods">
          {(field) => (
            <field.BilingualTextValueField
              label="Methods"
              inputsClassName="flex w-full gap-2"
            />
          )}
        </group.AppField>
        <group.AppField name="targets">
          {(field) => (
            <field.BilingualTextValueField
              label="Targets"
              inputsClassName="flex w-full gap-2"
            />
          )}
        </group.AppField>
        <group.AppField name="url">
          {(field) => <field.BilingualURLArrayField label="URLs" />}
        </group.AppField>
      </div>
    );
  },
});
