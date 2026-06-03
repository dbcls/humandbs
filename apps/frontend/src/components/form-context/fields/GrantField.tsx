import { Label } from "@/components/ui/label";

import { withForm } from "../FormContext";
import { BilingualTextField } from "./BilingualTextField";
import { ResetFieldButton } from "./ResetFieldButton";
import { TagInput } from "./TagInput";
import { getFieldDefaultValue, isFieldModified } from "./useFieldModified";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Grant card subform.
 *
 * Props:
 * - `baseName`: e.g. "grant[0]"
 */
export const GrantField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as { baseName: string },
  render({ form, baseName }) {
    return (
      <div className="flex flex-col gap-3">
        {/* Title */}
        <BilingualTextField form={form} baseName={`${baseName}.title`} label="Title" />

        {/* IDs — TagInput */}
        <form.AppField name={`${baseName}.id` as AnyName} mode="array">
          {(field: AnyName) => {
            const modified = isFieldModified(field);
            const defaultVal = getFieldDefaultValue(field) as AnyName;
            return (
              <div className="relative">
                <TagInput
                  label="IDs"
                  value={field.state.value ?? []}
                  onChange={(newValue) => field.setValue(newValue)}
                />
                {modified && (
                  <ResetFieldButton
                    className="top-0"
                    onClick={() => field.setValue(defaultVal ?? [])}
                  />
                )}
              </div>
            );
          }}
        </form.AppField>

        {/* Agency */}
        <fieldset className="flex flex-col gap-2">
          <Label className="font-medium text-sm">Agency</Label>
          <div className="rounded border border-form-border p-3">
            <BilingualTextField form={form} baseName={`${baseName}.agency.name`} label="Name" />
          </div>
        </fieldset>
      </div>
    );
  },
});
