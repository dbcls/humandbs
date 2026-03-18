import { Label } from "@/components/ui/label";

import { withForm } from "../FormContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Bilingual text-value field for `{ ja: { text, rawHtml }, en: { text, rawHtml } }` patterns.
 * Renders En and Ja side-by-side with column headers.
 * Only exposes the `text` sub-field (rawHtml is managed separately or left empty).
 */
export const BilingualTextValueField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as { baseName: string; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-1">
        <Label className="text-sm">{label}</Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <form.AppField name={`${baseName}.en.text` as AnyName}>
              {(f) => <f.TextField type="col" label="En" />}
            </form.AppField>
          </div>
          <div className="flex-1">
            <form.AppField name={`${baseName}.ja.text` as AnyName}>
              {(f) => <f.TextField type="col" label="Ja" />}
            </form.AppField>
          </div>
        </div>
      </fieldset>
    );
  },
});
