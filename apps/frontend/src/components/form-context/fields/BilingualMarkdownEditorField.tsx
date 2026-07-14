import { capitalize } from "@/components/FrontStatsVisualization/utils";
import { Label } from "@/components/ui/label";
import { i18n } from "@/config/i18n";
import type { LegacyRawHtmlLookup } from "@/utils/renderedHtml/legacyRawHtml";
import { getLegacyRawHtml } from "@/utils/renderedHtml/legacyRawHtml";

import { withForm } from "../FormContext";
import { MarkdownTextEditor } from "./MarkdownTextEditor";
import { ResetFieldButton } from "./ResetFieldButton";
import { getFieldDefaultValue, isFieldModified } from "./useFieldModified";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Bilingual Markdown editor for a `{ ja: { text }, en: { text } }` field. Each
 * locale gets a {@link MarkdownTextEditor} (textarea + live preview + legacy popup),
 * editing only `text`. The legacy `rawHtml` per locale is read from the side-channel
 * lookup by `legacyFieldKey` and shown read-only — never written to form state.
 */
export const BilingualMarkdownEditorField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as {
    baseName: string;
    label: string;
    /** Key into the legacy lookup (e.g. "aims", "releaseNote"). */
    legacyFieldKey?: string;
    legacyRawHtml?: LegacyRawHtmlLookup;
  },
  render({ form, baseName, label, legacyFieldKey, legacyRawHtml }) {
    return (
      <fieldset className="flex flex-col gap-1.5">
        <Label className="text-sm">{label}</Label>
        <div className="flex gap-3">
          {i18n.locales.map((locale) => (
            <div key={locale} className="relative flex flex-1 flex-col gap-1">
              <span className="font-medium text-form-label text-xs uppercase">{locale}</span>
              <form.AppField name={`${baseName}.${locale}.text` as AnyName}>
                {(f: AnyName) => {
                  const modified = isFieldModified(f);
                  return (
                    <>
                      <MarkdownTextEditor
                        value={(f.state.value as string | undefined) ?? ""}
                        onChange={(next) => f.handleChange(next)}
                        onBlur={() => f.handleBlur()}
                        placeholder={capitalize(locale)}
                        fieldLabel={`${label} (${locale})`}
                        modified={modified}
                        legacyRawHtml={
                          legacyFieldKey
                            ? getLegacyRawHtml(legacyRawHtml, legacyFieldKey, locale)
                            : undefined
                        }
                      />
                      {modified && (
                        <ResetFieldButton
                          onClick={() =>
                            f.handleChange(getFieldDefaultValue(f) as string | null | undefined)
                          }
                        />
                      )}
                    </>
                  );
                }}
              </form.AppField>
            </div>
          ))}
        </div>
      </fieldset>
    );
  },
});
