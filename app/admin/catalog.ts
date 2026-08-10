/**
 * What the catalog screen is allowed to change, decided without a database.
 *
 * **The type of a key is not on this list.** Typing a key as a vocabulary or a
 * number is what turns it into a facet, and a facet needs an aggregation, an
 * input control and a way of reading the existing prose into terms — none of
 * which an administrator can supply from a form. So the line is drawn there:
 * adding, renaming, reordering and removing free-text keys is administration,
 * and changing what a key holds is development
 * (docs/data-model.md の「catalog と語彙」).
 *
 * A code is an identity. It never appears to a reader, but it does appear in
 * the address of a refined search, so it has to be readable and it has to keep
 * clear of the four field names the search owns.
 */

import { BUILT_IN_FIELDS } from "~/search/fields"

export const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type CodeProblem = "malformed" | "reserved"

/**
 * Why a code cannot be used, or null when it can. Uniqueness is not decided
 * here — the table decides that, and a check in front of it would be a second
 * answer to the same question.
 */
export function codeProblem(code: string): CodeProblem | null {
  if (!CODE_PATTERN.test(code)) return "malformed"
  // A key named `title` would make `title:x` mean two things at once.
  return BUILT_IN_FIELDS.has(code) ? "reserved" : null
}

/**
 * What a term's code may not be. It is looser than a key's, because the codes
 * of an external standard are not ours to shape — ICD10 writes `C34` and
 * `H18.51`. The rule is only that it can be written in a query without quoting
 * and without meaning something else there.
 */
const TERM_CODE_REFUSED = /[\s:()[\]"'{}^~/\\*?]/

export function termCodeProblem(code: string): CodeProblem | null {
  return code === "" || TERM_CODE_REFUSED.test(code) ? "malformed" : null
}

/**
 * The positions of a list after one entry has been moved one place. Positions
 * are rewritten from the order rather than swapped, so a list that arrived with
 * gaps or duplicates comes back consecutive.
 */
export function moved<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: "up" | "down",
): T[] {
  const at = items.findIndex((item) => item.id === id)
  const to = direction === "up" ? at - 1 : at + 1
  if (at === -1 || to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const moving = next[at]
  const displaced = next[to]
  if (moving === undefined || displaced === undefined) return next
  next[at] = displaced
  next[to] = moving
  return next
}
