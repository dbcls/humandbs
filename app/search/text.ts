/**
 * Flattening content into the two strings the full-text index is built on.
 *
 * The rule is opt-out: everything in the content is searchable unless it is
 * listed below. Opting out is for values that are identities or machine state —
 * indexing a uuid makes a search for it match a document whose text never
 * mentions it, and the label of a vocabulary term is resolved through the
 * catalog rather than stored here.
 *
 * Language is carried down the walk rather than decided at the leaf: a link
 * inside `LocalizedLinks.ja` belongs to the Japanese text however deeply it is
 * nested, and a single-valued field belongs to both.
 */

const OPTED_OUT_FIELDS = new Set([
  "id",
  "keyId",
  "termIds",
  "datasetIds",
  "fileSelection",
  "state",
  "kind",
  "releaseDate",
  "unit",
  "inputUnit",
  "inputValue",
])

export interface SearchText {
  ja: string
  en: string
}

type Language = "ja" | "en" | "both"

function walk(value: unknown, language: Language, ja: string[], en: string[]): void {
  if (typeof value === "string") {
    if (!value) return
    if (language !== "en") ja.push(value)
    if (language !== "ja") en.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, language, ja, en)
    return
  }
  if (value === null || typeof value !== "object") return

  const record = value as Record<string, unknown>
  // A translated pair, or a pair of per-language lists. Either way the two
  // sides stop being interchangeable from here down.
  if ("ja" in record || "en" in record) {
    if ("ja" in record) walk(record.ja, language === "both" ? "ja" : language, ja, en)
    if ("en" in record) walk(record.en, language === "both" ? "en" : language, ja, en)
    return
  }
  for (const [key, item] of Object.entries(record)) {
    if (OPTED_OUT_FIELDS.has(key)) continue
    walk(item, language, ja, en)
  }
}

/**
 * @param extra Strings that belong to both languages — the hum label and the
 * dataset id, which are not in the content because they are pinned labels but
 * are the first thing anyone types into the search box.
 */
export function searchTextOf(content: unknown, extra: string[] = []): SearchText {
  const ja: string[] = [...extra]
  const en: string[] = [...extra]
  walk(content, "both", ja, en)
  return { ja: ja.join(" "), en: en.join(" ") }
}
