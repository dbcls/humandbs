/**
 * Which of the two labels a catalog row shows.
 *
 * Keys, categories and vocabulary sets carry both languages; a vocabulary term
 * carries English and may carry Japanese, because whether a concept is written
 * in Japanese varies inside one vocabulary rather than between vocabularies
 * ([data-model.md](../../docs/data-model.md) の「catalog と語彙」). So the
 * Japanese side falls back and the English side never does — and that rule is
 * written once, here, rather than at each place a label reaches a screen.
 */

import type { Locale } from "./locale"

export function catalogLabel(
  row: { labelJa: string | null, labelEn: string },
  locale: Locale,
): string {
  return locale === "ja" ? row.labelJa ?? row.labelEn : row.labelEn
}
