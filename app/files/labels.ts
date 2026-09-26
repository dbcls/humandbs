/**
 * A file's label: the words shown beside a file of a research's prefix, in each
 * language (`file_label`).
 */

import type { Locale } from "~/i18n/locale"

/** Either language may be empty; a label with neither is not kept. */
export interface FileLabel {
  ja: string
  en: string
}

/** Longer than any label anybody writes; past it the post is not one the screen sends. */
export const FILE_LABEL_MAX_LENGTH = 1000

/**
 * What a page in `locale` shows: its own language, and **the other where its
 * own is empty**. A label written in one language only is ordinary — a file
 * whose two languages are two separate files has a label on each in its own
 * language only — and shown on the other page it still names the file better
 * than nothing. Empty when there is no label.
 */
export function fileLabelIn(label: FileLabel | undefined, locale: Locale): string {
  if (label === undefined) return ""
  const [own, other] = locale === "ja" ? [label.ja, label.en] : [label.en, label.ja]
  return own === "" ? other : own
}

/**
 * What is kept of what was typed: each language without the whitespace around
 * it. `null` when both are empty, which is deleting the label.
 */
export function typedFileLabel(ja: string, en: string): FileLabel | null {
  const label = { ja: ja.trim(), en: en.trim() }
  return label.ja === "" && label.en === "" ? null : label
}

export function sameFileLabel(a: FileLabel | null, b: FileLabel | null): boolean {
  return a?.ja === b?.ja && a?.en === b?.en
}
