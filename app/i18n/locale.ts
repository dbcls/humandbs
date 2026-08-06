/**
 * Choosing a language for a value.
 *
 * The content type says which of three kinds a field is (`app/content/types.ts`),
 * and each kind is resolved differently. A translated pair falls back to the
 * other language, because a research published with only Japanese still has to
 * render on the English page. A per-language value does not fall back, because
 * its two sides are different resources — a lab's Japanese page and its English
 * page — and showing one in place of the other would send the reader somewhere
 * that was never claimed to be the translation.
 *
 * Whether a value is untranslated is derived here rather than stored: one side
 * empty and the other filled is untranslated, both empty is nobody having filled
 * it in yet. A flag would drift from the values it describes.
 *
 * **Not every pair of languages is content.** Cached values from upstream (a
 * controlled-access usage record) carry whatever languages upstream has, and
 * curators cannot edit them, so nothing marks them as untranslated even though
 * they resolve through the same function.
 */

import { isEmptyRichText } from "~/content/richtext"
import type {
  Link,
  LocalizedLinks,
  RichText,
  TranslatedRichText,
  TranslatedText,
} from "~/content/types"

export const LOCALES = ["ja", "en"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "ja"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

export interface ResolvedText {
  text: string
  /** The other language was used because the wanted one is empty. */
  untranslated: boolean
}

export function resolveText(text: TranslatedText, locale: Locale): ResolvedText {
  const wanted = text[locale]
  if (wanted !== "") return { text: wanted, untranslated: false }

  const other = locale === "ja" ? text.en : text.ja
  return other === ""
    ? { text: "", untranslated: false }
    : { text: other, untranslated: true }
}

export interface ResolvedRichText {
  text: RichText
  untranslated: boolean
}

/**
 * The same rule for prose, with "empty" meaning no line carries any text. A
 * tree of blank lines reads as nothing having been written, exactly as an empty
 * string does.
 */
export function resolveRichText(text: TranslatedRichText, locale: Locale): ResolvedRichText {
  const wanted = text[locale]
  if (!isEmptyRichText(wanted)) return { text: wanted, untranslated: false }

  const other = locale === "ja" ? text.en : text.ja
  return isEmptyRichText(other)
    ? { text: [], untranslated: false }
    : { text: other, untranslated: true }
}

/** No fallback: the languages of a link are different destinations, not translations. */
export function resolveLinks(links: LocalizedLinks, locale: Locale): Link[] {
  return links[locale]
}
