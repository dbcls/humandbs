import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { withForm } from "../FormContext";
import { ResetFieldButton } from "./ResetFieldButton";
import { getFieldDefaultValue, isFieldModified } from "./useFieldModified";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Bilingual URL array field for `{ ja: { text, url }[], en: { text, url }[] }` patterns.
 * Each row: En column (text + url stacked) | Ja column (text + url stacked) | trash icon.
 * `+ Add` button at bottom.
 *
 * Props:
 * - `baseName`: e.g. "summary.url"
 * - `label`: section label
 */
export const UrlArrayField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as { baseName: string; label: string },
  render({ form, baseName, label }) {
    return (
      <fieldset className="flex flex-col gap-2">
        <Label className="text-sm">{label}</Label>

        {/* We drive from the En array length — both arrays should stay in sync */}
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
                        <div className="flex-1 font-medium text-form-label text-xs uppercase">En</div>
                        <div className="flex-1 font-medium text-form-label text-xs uppercase">Ja</div>
                        <div className="w-8" />
                      </div>
                    )}

                    {enItems.map((_: unknown, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        {/* En: text + url */}
                        <form.AppField name={`${baseName}.en[${i}]` as AnyName}>
                          {(f: AnyName) => {
                            const modified = isFieldModified(f);
                            const defaultVal = getFieldDefaultValue(f) as AnyName;
                            return (
                              <div className="relative flex flex-1 flex-col gap-1">
                                <form.AppField name={`${baseName}.en[${i}].text` as AnyName}>
                                  {(tf: AnyName) => <tf.TextField label="Text" />}
                                </form.AppField>
                                <form.AppField name={`${baseName}.en[${i}].url` as AnyName}>
                                  {(tf: AnyName) => <tf.TextField label="URL" />}
                                </form.AppField>
                                {modified && (
                                  <ResetFieldButton
                                    className="-top-1"
                                    onClick={() => f.handleChange(defaultVal ?? null)}
                                  />
                                )}
                              </div>
                            );
                          }}
                        </form.AppField>
                        {/* Ja: text + url */}
                        <form.AppField name={`${baseName}.ja[${i}]` as AnyName}>
                          {(f: AnyName) => {
                            const modified = isFieldModified(f);
                            const defaultVal = getFieldDefaultValue(f) as AnyName;
                            return (
                              <div className="relative flex flex-1 flex-col gap-1">
                                <form.AppField name={`${baseName}.ja[${i}].text` as AnyName}>
                                  {(tf: AnyName) => <tf.TextField label="Text" />}
                                </form.AppField>
                                <form.AppField name={`${baseName}.ja[${i}].url` as AnyName}>
                                  {(tf: AnyName) => <tf.TextField label="URL" />}
                                </form.AppField>
                                {modified && (
                                  <ResetFieldButton
                                    className="-top-1"
                                    onClick={() => f.handleChange(defaultVal ?? null)}
                                  />
                                )}
                              </div>
                            );
                          }}
                        </form.AppField>
                        {/* Trash */}
                        <button
                          type="button"
                          className="mt-1"
                          onClick={() => {
                            enField.removeValue(i);
                            jaField.removeValue(i);
                          }}
                        >
                          <Trash2 className="size-4 text-danger" />
                        </button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => {
                        enField.pushValue({ text: "", url: "" });
                        jaField.pushValue({ text: "", url: "" });
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
