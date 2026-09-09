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
 * The vocabularies whose values are settled by what the portal is, rather than
 * by what arrives in the data.
 *
 * **Every one of them is an axis of classification** — two to five terms, and
 * five of them share the same 「混在」. Nothing a new study brings can add to
 * one: a study does not arrive with a fourth sex or a second way of being
 * unrestricted. So the migration puts them in and no screen edits them
 * afterwards — which is what the glossary already said about the access types,
 * that they are settled by the structure and must not be reworded
 * (docs/glossary.md).
 *
 * **The other twelve grow with the data** — platform, library prep kit, tissue,
 * disease and the rest — and those are the ones an administrator keeps
 * (docs/data-model.md の「catalog と語彙」).
 *
 * The label of the *field* one of these belongs to is not settled by this: what
 * a refinement is called is the administrator's to write, and only what it may
 * hold is fixed.
 */
export const SETTLED_VOCABULARIES: ReadonlySet<string> = new Set([
  "access-criteria",
  "age-group",
  "has-phenotype-data",
  "health-status",
  "is-tumor",
  "read-type",
  "sex",
  "subject-count-type",
])

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
