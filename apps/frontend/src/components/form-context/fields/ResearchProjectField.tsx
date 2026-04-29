import { Label } from "@/components/ui/label";
import URLField from "../researchFields/URLInputPair";
import { withForm } from "../FormContext";

import { BilingualTextValueField } from "./BilingualTextValueField";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Research project card subform.
 *
 * Props:
 * - `baseName`: e.g. "researchProject[0]"
 */
export const ResearchProjectField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as { baseName: string },
  render({ form, baseName }) {
    return (
      <div className="flex flex-col gap-3">
        {/* Name */}
        <BilingualTextValueField
          form={form}
          baseName={`${baseName}.name`}
          label="Name"
        />

        {/* URL */}
        <fieldset className="flex flex-col gap-1">
          <Label className="text-sm">URL</Label>
          <div className="flex gap-2">
            <div className="flex-1 text-xs font-medium text-gray-500 uppercase">
              En
            </div>
            <div className="flex-1 text-xs font-medium text-gray-500 uppercase">
              Ja
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <form.AppField name={`${baseName}.url.en` as AnyName}>
                {() => <URLField />}
              </form.AppField>
            </div>
            <div className="flex-1">
              <form.AppField name={`${baseName}.url.ja` as AnyName}>
                {() => <URLField />}
              </form.AppField>
            </div>
          </div>
        </fieldset>
      </div>
    );
  },
});
