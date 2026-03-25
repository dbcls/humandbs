import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { withForm } from "../FormContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Bilingual text-value array field for `{ ja: { text, rawHtml }[], en: { text, rawHtml }[] }` patterns.
 * Each row: En text | Ja text | trash icon.
 * `+ Add` button at bottom.
 *
 * Props:
 * - `baseName`: e.g. "summary.footers"
 * - `label`: section label
 */
export const TextValueArrayField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as { baseName: string; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-2">
        <Label className="text-sm">{label}</Label>

        <form.AppField name={`${baseName}.en` as AnyName} mode="array">
          {(enField: AnyName) => (
            <form.AppField name={`${baseName}.ja` as AnyName} mode="array">
              {(jaField: AnyName) => {
                const enItems: unknown[] = enField.state.value ?? [];

                return (
                  <div className="flex flex-col gap-2">
                    {/* Column headers */}
                    {enItems.length > 0 && (
                      <div className="flex gap-2">
                        <div className="flex-1 text-xs font-medium text-gray-500 uppercase">
                          En
                        </div>
                        <div className="flex-1 text-xs font-medium text-gray-500 uppercase">
                          Ja
                        </div>
                        <div className="w-8" />
                      </div>
                    )}

                    {enItems.map((_: unknown, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1">
                          <form.AppField
                            name={`${baseName}.en[${i}].text` as AnyName}
                          >
                            {(f: AnyName) => <f.TextField />}
                          </form.AppField>
                        </div>
                        <div className="flex-1">
                          <form.AppField
                            name={`${baseName}.ja[${i}].text` as AnyName}
                          >
                            {(f: AnyName) => <f.TextField />}
                          </form.AppField>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            enField.removeValue(i);
                            jaField.removeValue(i);
                          }}
                        >
                          <Trash2 className="text-danger size-4" />
                        </button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => {
                        enField.pushValue({ text: "", rawHtml: "" });
                        jaField.pushValue({ text: "", rawHtml: "" });
                      }}
                    >
                      + Add
                    </Button>
                  </div>
                );
              }}
            </form.AppField>
          )}
        </form.AppField>
      </fieldset>
    );
  },
});
