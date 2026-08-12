/**
 * Flattening the public projection into the two strings the full-text index is
 * built on.
 *
 * The input is the **public projection**, not the content: a key the catalog
 * hides and a value nobody has settled are already gone by the time the walk
 * sees them. That is what makes "a row cannot be found by text that never
 * appears in its public projection" true rather than merely intended.
 *
 * Within the projection the rule is opt-out: everything is searchable unless it
 * is listed below. Opting out is for values that are not read as text —
 * identities, machine state, and the destination of a link. A URL is not what a
 * reader sees; where the destination is also the text of the link, the text
 * side is indexed and searching by domain still works.
 *
 * Language is carried down the walk rather than decided at the leaf: a link
 * inside `LocalizedLinks.ja` belongs to the Japanese text however deeply it is
 * nested, and a single-valued field belongs to both.
 */

import { toPlainText } from "~/content/richtext"
import type { RichText, Span } from "~/content/types"

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

function isSpan(value: unknown): value is Span {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const span = value as Record<string, unknown>
  return typeof span.text === "string"
}

/**
 * Prose has to be recognised before the generic walk reaches its spans: joining
 * them with a separator would break a word the tree only split because a link
 * started (`1.73m` + `²`), and the joined form is what a reader searches for.
 */
function asRichText(value: unknown): RichText | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (!value.every((line) => Array.isArray(line) && line.every(isSpan))) return null
  return value
}

/**
 * A link is the one place a URL is stored beside the words that stand for it.
 * Only the words are indexed: the destination is not something a reader sees.
 * Where the two are the same string — which is most of the research and project
 * URLs — the text side keeps the address searchable anyway.
 */
function isLink(record: Record<string, unknown>): boolean {
  return typeof record.url === "string" && typeof record.text === "string"
}

function walk(value: unknown, language: Language, ja: string[], en: string[]): void {
  if (typeof value === "string") {
    if (!value) return
    if (language !== "en") ja.push(value)
    if (language !== "ja") en.push(value)
    return
  }
  if (Array.isArray(value)) {
    const rich = asRichText(value)
    if (rich !== null) {
      walk(toPlainText(rich), language, ja, en)
      return
    }
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
  if (isLink(record)) {
    walk(record.text, language, ja, en)
    return
  }
  for (const [key, item] of Object.entries(record)) {
    if (OPTED_OUT_FIELDS.has(key)) continue
    walk(item, language, ja, en)
  }
}

/**
 * @param extra Strings that belong to both languages — the pinned labels, which
 * are not in the content because they are labels but are the first thing anyone
 * types into the search box.
 */
export function searchTextOf(projection: unknown, extra: string[] = []): SearchText {
  const ja: string[] = [...extra]
  const en: string[] = [...extra]
  walk(projection, "both", ja, en)
  return { ja: ja.join(" "), en: en.join(" ") }
}

/**
 * The vocabulary values a row carries, as text.
 *
 * The projection holds the identity of a term and not its label — resolving
 * labels is the renderer's job, not the projection's (docs/data-model.md の
 * 「公開表現」) — so the walk above cannot see the words a reader will see. This
 * is where they are put back, for the slots that survived the projection and
 * therefore for the keys the catalog shows.
 *
 * **The code goes into both languages.** It is what an ICD10 term is looked up
 * by, and it is not a word in either language.
 */
export function termsSearchText(
  terms: readonly { code: string, labelJa: string | null, labelEn: string }[],
): SearchText {
  const ja: string[] = []
  const en: string[] = []
  for (const term of terms) {
    ja.push(term.code)
    en.push(term.code)
    if (term.labelJa !== null && term.labelJa !== "") ja.push(term.labelJa)
    if (term.labelEn !== "") en.push(term.labelEn)
  }
  return { ja: ja.join(" "), en: en.join(" ") }
}

/** Both sides concatenated. A research row carries its datasets' text this way. */
export function concatSearchText(parts: readonly SearchText[]): SearchText {
  return {
    ja: parts.map((part) => part.ja).filter(Boolean).join(" "),
    en: parts.map((part) => part.en).filter(Boolean).join(" "),
  }
}
