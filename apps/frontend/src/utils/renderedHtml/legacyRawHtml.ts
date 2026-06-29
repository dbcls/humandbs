import type { Locale } from "@/config/i18n";

/**
 * Legacy `rawHtml` side-channel.
 *
 * The admin "for edit" read fns (`includeRawHtml: true`, no render transform) return
 * the untouched legacy `rawHtml`. This module shapes those responses into a flat,
 * per-field lookup the editor reads — `fieldKey → locale → legacy rawHtml` — WITHOUT
 * ever putting `rawHtml` into submittable form state. Form state stays request-shaped
 * (`text` only); legacy travels separately and read-only.
 *
 * The lookup is a pure function of the response, so it's unit-tested directly.
 */

export type LegacyRawHtmlLookup = Record<string, Partial<Record<Locale, string>>>;

type BilingualLike =
  | {
      ja?: { rawHtml?: string | null } | null;
      en?: { rawHtml?: string | null } | null;
    }
  | null
  | undefined;

function setLegacy(lookup: LegacyRawHtmlLookup, fieldKey: string, field: BilingualLike): void {
  if (field == null) return;
  const ja = field.ja?.rawHtml;
  const en = field.en?.rawHtml;
  if (ja == null && en == null) return;
  const entry: Partial<Record<Locale, string>> = {};
  if (ja != null) entry.ja = ja;
  if (en != null) entry.en = en;
  lookup[fieldKey] = entry;
}

/**
 * Field-key helper for an experiment data value: `experiment.<index>.<dataKey>`.
 * Used both when building the dataset lookup and when reading it in the field UI.
 */
export function experimentDataFieldKey(experimentIndex: number, dataKey: string): string {
  return `experiment.${experimentIndex}.${dataKey}`;
}

/**
 * Build the legacy lookup from a research detail response (`includeRawHtml: true`).
 * In-scope fields only: summary.aims/methods/targets + releaseNote.
 */
export function researchLegacyRawHtml(response: {
  data?: {
    summary?: { aims?: BilingualLike; methods?: BilingualLike; targets?: BilingualLike };
    releaseNote?: BilingualLike;
  } | null;
}): LegacyRawHtmlLookup {
  const lookup: LegacyRawHtmlLookup = {};
  const data = response?.data;
  if (!data) return lookup;
  setLegacy(lookup, "aims", data.summary?.aims);
  setLegacy(lookup, "methods", data.summary?.methods);
  setLegacy(lookup, "targets", data.summary?.targets);
  setLegacy(lookup, "releaseNote", data.releaseNote);
  return lookup;
}

/**
 * Build the legacy lookup from a dataset detail response (`includeRawHtml: true`).
 * In-scope: every experiment.data.* value, keyed by {@link experimentDataFieldKey}.
 * `experiment.header` is out of scope and intentionally excluded.
 */
export function datasetLegacyRawHtml(response: {
  data?: {
    experiments?: Array<{ data?: Record<string, BilingualLike> }> | null;
  } | null;
}): LegacyRawHtmlLookup {
  const lookup: LegacyRawHtmlLookup = {};
  const experiments = response?.data?.experiments;
  if (!experiments) return lookup;
  experiments.forEach((experiment, index) => {
    const data = experiment?.data;
    if (!data) return;
    for (const [dataKey, value] of Object.entries(data)) {
      setLegacy(lookup, experimentDataFieldKey(index, dataKey), value);
    }
  });
  return lookup;
}

/** Read the legacy `rawHtml` for one field+locale, or `undefined` if none. */
export function getLegacyRawHtml(
  lookup: LegacyRawHtmlLookup | undefined,
  fieldKey: string,
  locale: Locale,
): string | undefined {
  return lookup?.[fieldKey]?.[locale];
}
