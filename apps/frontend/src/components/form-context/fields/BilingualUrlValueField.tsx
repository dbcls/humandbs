import { Label } from "@/components/ui/label";

import { withForm } from "../FormContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Bilingual URL-value field for `{ ja: { text, url }, en: { text, url } }` patterns.
 * Renders En and Ja side-by-side, each with stacked text + URL inputs.
 */
export const BilingualUrlValueField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as { baseName: string; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-1">
        <Label className="text-sm">{label}</Label>
        <div className="flex gap-2">
          <div className="flex-1 flex flex-col gap-1">
            <form.AppField name={`${baseName}.en.text` as AnyName}>
              {(f) => <f.TextField type="col" label="En Text" />}
            </form.AppField>
            <form.AppField name={`${baseName}.en.url` as AnyName}>
              {(f) => <f.TextField type="col" label="En URL" />}
            </form.AppField>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <form.AppField name={`${baseName}.ja.text` as AnyName}>
              {(f) => <f.TextField type="col" label="Ja Text" />}
            </form.AppField>
            <form.AppField name={`${baseName}.ja.url` as AnyName}>
              {(f) => <f.TextField type="col" label="Ja URL" />}
            </form.AppField>
          </div>
        </div>
      </fieldset>
    );
  },
});
