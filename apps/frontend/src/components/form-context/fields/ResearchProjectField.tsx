import { withForm } from "../FormContext";

import { BilingualTextValueField } from "./BilingualTextValueField";
import { BilingualUrlValueField } from "./BilingualUrlValueField";

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
        <BilingualUrlValueField
          form={form}
          baseName={`${baseName}.url`}
          label="URL"
        />
      </div>
    );
  },
});
