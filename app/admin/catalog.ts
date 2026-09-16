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

// === the fields listing ===

/**
 * What a field of an analysis method holds.
 *
 * **Only the four an experiment field can be typed as are here.** `single` and
 * `accession` belong to the two fields a dataset carries, which this screen
 * does not show (`catalog.server.ts`) — an axis offering them would hold values
 * that can never leave anything.
 */
export type KeyValueType = "text" | "vocabulary" | "number" | "disease"

export const KEY_VALUE_TYPES: readonly KeyValueType[] = ["text", "vocabulary", "number", "disease"]

export function isKeyValueType(value: string): value is KeyValueType {
  return (KEY_VALUE_TYPES as readonly string[]).includes(value)
}

/** Whether a field is drawn on the public analysis-method table. */
export type KeyShowing = "shown" | "hidden"

export const KEY_SHOWINGS: readonly KeyShowing[] = ["shown", "hidden"]

export function isKeyShowing(value: string): value is KeyShowing {
  return (KEY_SHOWINGS as readonly string[]).includes(value)
}

/**
 * The value the box axis carries for a field standing in none.
 *
 * **It is a value of the axis rather than the absence of one**, because most
 * fields are in no box at all — an axis that could only say which box a field
 * is in would leave the larger half of the listing unreachable.
 */
export const NO_BOX = "none"

/** What the listing reads off a field. The screen's row carries more. */
export interface KeyFilterRow {
  code: string
  labelJa: string
  labelEn: string
  valueType: string
  /** The code of the box this field stands in, or null when it stands in none. */
  categoryCode: string | null
  showOnPublicPage: boolean
}

export function keyBox(row: KeyFilterRow): string {
  return row.categoryCode ?? NO_BOX
}

export function keyShowing(row: KeyFilterRow): KeyShowing {
  return row.showOnPublicPage ? "shown" : "hidden"
}

export interface KeyFilter {
  keyword: string
  /** Which to keep. Empty is every one, as an untouched axis is. */
  types: readonly string[]
  boxes: readonly string[]
  showing: readonly string[]
}

/**
 * The fields a filter leaves, in the order they were handed over — which is the
 * order of the public table, and the thing this screen edits.
 *
 * **What is typed is looked for in the code and in both labels**, each read on
 * its own: a field is reached by its code as often as by its name, and the two
 * languages are what an administrator is comparing when they come here.
 *
 * The box and the three axes combine as an AND; within an axis the choices are
 * an OR — the rule the other listings run on (`app/admin/listing.ts`).
 */
export function filterKeyRows<Row extends KeyFilterRow>(
  rows: readonly Row[],
  filter: KeyFilter,
): Row[] {
  const needle = filter.keyword.trim().toLowerCase()
  return rows.filter((row) => {
    if (needle !== "") {
      const held = [row.code, row.labelJa, row.labelEn]
      if (!held.some((one) => one.toLowerCase().includes(needle))) return false
    }
    if (filter.types.length > 0 && !filter.types.includes(row.valueType)) return false
    if (filter.boxes.length > 0 && !filter.boxes.includes(keyBox(row))) return false
    if (filter.showing.length > 0 && !filter.showing.includes(keyShowing(row))) return false
    return true
  })
}
