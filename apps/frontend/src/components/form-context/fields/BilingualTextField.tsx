import { Label } from "@/components/ui/label";

import { withForm } from "../FormContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Bilingual text field for `{ ja: string, en: string }` patterns.
 * Renders En and Ja side-by-side with column headers.
 */
export const BilingualTextField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as { baseName: string; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-1">
        <Label className="text-sm">{label}</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <form.AppField name={`${baseName}.en` as AnyName}>
              {(f) => <f.TextField type="col" label="En" />}
            </form.AppField>
          </div>
          <div className="flex-1">
            <form.AppField name={`${baseName}.ja` as AnyName}>
              {(f) => <f.TextField type="col" label="Ja" />}
            </form.AppField>
          </div>
        </div>
      </fieldset>
    );
  },
});
