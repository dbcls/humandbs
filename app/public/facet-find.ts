/**
 * Looking for a value among the ones a facet is showing.
 *
 * **This runs in the browser.** The panel sends every value it has, so the box
 * that narrows them has nothing to ask the server for
 * (`docs/public-pages.md` の「絞り込み」). It lives apart from
 * `facets.server.ts` for that reason and for no other.
 */

import { icd10Resolve } from "~/icd10/codes"

/** A value is looked for by its code and its label, in whichever language. */
export function matches(find: string, value: { code: string, label: string }): boolean {
  if (find === "") return true
  const needle = find.toLowerCase()
  return value.code.toLowerCase().includes(needle) || value.label.toLowerCase().includes(needle)
}

/**
 * What the box of a disease facet is looking for.
 *
 * **A code is rolled up to the one the panel offers.** Only the roots of the
 * classification are listed, while what an article writes — and therefore what
 * a reader has in hand — is the code below it: `C340` has to find `C34`, or the
 * box says the facet holds nothing about a disease the data does carry
 * (`docs/public-pages.md` の「絞り込み」). The point and the case are the
 * writer's, so they are not asked about either.
 *
 * **Anything not shaped like a code is looked for as it was typed**, which is
 * what keeps the same box working for a word in either language.
 */
export function rolledUpFind(find: string, values: readonly { code: string }[]): string {
  const held = new Set(values.map((value) => value.code))
  return icd10Resolve(find, (code) => held.has(code)) ?? find
}
