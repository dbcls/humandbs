import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { withForm } from "../FormContext";

import { BilingualTextValueField } from "./BilingualTextValueField";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Person card subform used by both dataProvider and controlledAccessUser arrays.
 *
 * Props:
 * - `baseName`: e.g. "dataProvider[0]" or "controlledAccessUser[0]"
 * - `withPeriodOfDataUse`: show period of data usage fields (controlledAccessUser only)
 * - `withDatasetIds`: show dataset IDs list (controlledAccessUser only)
 */
export const PersonField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as {
    baseName: string;
    withPeriodOfDataUse?: boolean;
    withDatasetIds?: boolean;
  },
  render({
    form,
    baseName,
    withPeriodOfDataUse = false,
    withDatasetIds = false,
  }) {
    return (
      <div className="flex flex-col gap-3">
        {/* ORCID search placeholder */}
        <Input
          placeholder="Search by ORCID and apply..."
          disabled
          className="bg-gray-50 text-gray-400"
        />

        {/* Name */}
        <BilingualTextValueField
          form={form}
          baseName={`${baseName}.name`}
          label="Name *"
        />

        {/* Title */}
        <BilingualTextValueField
          form={form}
          baseName={`${baseName}.researchTitle`}
          label="Title *"
        />

        {/* Email + ORCID */}

        <form.AppField name={`${baseName}.email` as AnyName}>
          {(f: AnyName) => <f.TextField type="col" label="Email" />}
        </form.AppField>

        <form.AppField name={`${baseName}.orcid` as AnyName}>
          {(f: AnyName) => <f.TextField type="col" label="ORCID" />}
        </form.AppField>

        {/* Period of data usage (conditional) */}
        {withPeriodOfDataUse && (
          <div className="flex gap-2">
            <div className="flex-1">
              <form.AppField
                name={`${baseName}.periodOfDataUse.startDate` as AnyName}
              >
                {(f: AnyName) => <f.DateField label="Start Date" />}
              </form.AppField>
            </div>
            <div className="flex-1">
              <form.AppField
                name={`${baseName}.periodOfDataUse.endDate` as AnyName}
              >
                {(f: AnyName) => <f.DateField label="End Date" />}
              </form.AppField>
            </div>
          </div>
        )}

        {/* Organization */}
        <fieldset className="flex flex-col gap-2">
          <Label className="text-sm font-medium">Organization</Label>
          <div className="rounded border p-3">
            <div className="flex flex-col gap-2">
              <BilingualTextValueField
                form={form}
                baseName={`${baseName}.organization.name`}
                label="Name"
              />
              <form.AppField
                name={`${baseName}.organization.address.country` as AnyName}
              >
                {(f: AnyName) => <f.TextField type="col" label="Country" />}
              </form.AppField>
            </div>
          </div>
        </fieldset>

        {/* Dataset IDs (conditional) */}
        {withDatasetIds && (
          <form.AppField
            name={`${baseName}.datasetIds` as AnyName}
            mode="array"
          >
            {(field: AnyName) => (
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Dataset IDs</Label>
                {field.state.value?.map((_: string, j: number) => (
                  <div key={j} className="flex items-center gap-1">
                    <form.AppField
                      name={`${baseName}.datasetIds[${j}]` as AnyName}
                    >
                      {(f: AnyName) => <f.TextField />}
                    </form.AppField>
                    <button type="button" onClick={() => field.removeValue(j)}>
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
                  Add dataset
                </Button>
              </div>
            )}
          </form.AppField>
        )}
      </div>
    );
  },
});
