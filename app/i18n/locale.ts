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
 * **Each language carries its own state**, so resolving is a decision about the
 * wanted language first:
 *
 * - `not-applicable` is an answer, so it is returned as one and never falls back
 * - `unknown` is a question. It does not fall back either: the preview is where
 *   an unsettled value is meant to be visible as an empty frame with the comment
 *   asking for it, and filling that frame from the other language would hide
 *   what is being asked. On a public page the projection has already turned it
 *   into an empty value, so the fallback below applies instead
 * - an empty value is nobody having written anything, and falls back
 *
 * Whether a value is untranslated is derived here rather than stored: one side
 * holding a value and the other holding an empty one is untranslated, both empty
 * is nobody having filled it in yet. A flag would drift from the values it
 * describes.
 *
 * **Not every pair of languages is content.** Cached values from upstream (a
 * controlled-access usage record) carry whatever languages upstream has and no
 * state at all, and curators cannot edit them, so nothing marks them as
 * untranslated.
 */

import { isEmptyRichText } from "~/content/richtext"
import type {
  Bilingual,
  Link,
  LocalizedLinks,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
} from "~/content/types"

export const LOCALES = ["ja", "en"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "ja"

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

export type Resolved<T>
  = | { state: "not-applicable" }
    | {
      state: "value"
      value: T
      /** The other language was used because the wanted one is empty. */
      untranslated: boolean
    }

function other(locale: Locale): Locale {
  return locale === "ja" ? "en" : "ja"
}

function resolve<T>(
  pair: { ja: Slot<T>, en: Slot<T> },
  locale: Locale,
  empty: T,
  isEmpty: (value: T) => boolean,
): Resolved<T> {
  const wanted = pair[locale]
  if (wanted.state === "not-applicable") return { state: "not-applicable" }
  if (wanted.state === "unknown") return { state: "value", value: empty, untranslated: false }
  if (!isEmpty(wanted.value)) return { state: "value", value: wanted.value, untranslated: false }

  const fallback = pair[other(locale)]
  if (fallback.state !== "value" || isEmpty(fallback.value)) {
    return { state: "value", value: empty, untranslated: false }
  }
  return { state: "value", value: fallback.value, untranslated: true }
}

export function resolveText(text: TranslatedText, locale: Locale): Resolved<string> {
  return resolve(text, locale, "", (value) => value === "")
}

/**
 * The same rule for prose, with "empty" meaning no line carries any text. A
 * tree of blank lines reads as nothing having been written, exactly as an empty
 * string does.
 */
export function resolveRichText(text: TranslatedRichText, locale: Locale): Resolved<RichText> {
  return resolve(text, locale, [], isEmptyRichText)
}

/** No fallback: the languages of a link are different destinations, not translations. */
export function resolveLinks(links: LocalizedLinks, locale: Locale): Link[] {
  const slot = links[locale]
  return slot.state === "value" ? slot.value : []
}

/**
 * A pair from upstream, which has no state and no notion of being untranslated.
 * An empty side still shows the other one, because a record with only English
 * is upstream's answer rather than a gap the portal can close.
 */
export function resolveBilingual(text: Bilingual, locale: Locale): string {
  const wanted = text[locale]
  return wanted === "" ? text[other(locale)] : wanted
}
