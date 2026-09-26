/**
 * What the catalog screen is allowed to change, decided without a database.
 *
 * **The type of a key is not on this list.** Typing a key as a vocabulary or a
 * number is what turns it into a facet, and a facet needs an aggregation, an
 * input control and a way of reading the existing prose into terms — none of
 * which an administrator can supply from a form. So the line is drawn there:
 * adding, renaming, reordering and removing free-text keys is administration,
 * and changing what a key holds is development.
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
 * The code a new key or term is stored under, made from its English label.
 *
 * **Nobody is asked for it.** The code is an address the public side uses
 * (`?q=experimental-method:atac-seq`), not a name a curator chooses — and
 * asking for one is expecting somebody to know which characters a query can hold
 * unquoted. The label already shows what the value is.
 *
 * **A vocabulary that arrives with codes of its own keeps them** — ICD10 writes
 * `C34`, and a slug made from the label would be a second name for the same
 * thing. That is the one place a code is still typed.
 *
 * **Runs of anything else become one hyphen**, so `CUT&RUN-seq` and
 * `Genotyping by array` come out as they were already written by hand. What
 * comes out is empty or a code `codeProblem` calls well-formed, so a key —
 * whose shape is the stricter of the two — is made the same way as a term.
 */
export function codeFrom(labelEn: string): string {
  return labelEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

/**
 * The first of `wanted`, `wanted-2`, `wanted-3`… that `taken` does not hold.
 *
 * **A generated code cannot refuse the value.** Two entries may honestly read
 * the same in English, and the curator who typed the second one has no code to
 * correct — so the second takes the next free spelling instead.
 */
export function freeCode(wanted: string, taken: ReadonlySet<string>): string {
  if (!taken.has(wanted)) return wanted
  for (let n = 2; ; n++) {
    const next = `${wanted}-${n}`
    if (!taken.has(next)) return next
  }
}

/**
 * The code a new key takes: clear of the keys the catalog holds and of the
 * field names the search owns (`codeProblem`). A key labelled "Title" is stored
 * as `title-2` rather than refused — the label is the curator's to choose, and
 * the code is only where the key appears in an address.
 */
export function freeKeyCode(wanted: string, held: Iterable<string>): string {
  return freeCode(wanted, new Set([...held, ...BUILT_IN_FIELDS.keys()]))
}

/**
 * The vocabularies whose values are settled by what the portal is, rather than
 * by what arrives in the data.
 *
 * **Every one of them is an axis of classification** — two to five terms, and
 * five of them share the same 「混在」. Nothing a new study brings can add to
 * one: a study does not arrive with a fourth sex or a second way of being
 * unrestricted. So the migration puts them in and no screen edits them
 * afterwards — the same as the access types, which are settled by the
 * structure and must not be reworded.
 *
 * **ICD10 is settled for a different reason**: it is an external standard put
 * in whole, and its headings are the standard's to word, not the portal's.
 *
 * **The other eleven grow with the data** — platform, library prep kit, tissue
 * and the rest — and those are the ones an administrator keeps.
 *
 * The label of the *field* one of these belongs to is not settled by this: what
 * a refinement is called is the administrator's to write, and only what it may
 * hold is fixed.
 */
/**
 * The one vocabulary whose values link their label to an article: the data use
 * policies, each of which has its text written in an article. **A special case
 * of this vocabulary, not something every refinement offers** — a tissue or a
 * platform has no article to point at, and a control for one on every
 * vocabulary is a question nobody there has to answer.
 */
export const DOCUMENT_LINKED_VOCABULARY = "policies"

export const SETTLED_VOCABULARIES: ReadonlySet<string> = new Set([
  "access-criteria",
  "age-group",
  "has-phenotype-data",
  "health-status",
  "icd10",
  "is-tumor",
  "read-type",
  "sex",
  "subject-count-type",
])

/**
 * The order of a list after one entry has been put at `to`, the rows between
 * closing over the place it left. Positions are rewritten from the order rather
 * than swapped, so a list that arrived with gaps or duplicates comes back
 * consecutive.
 *
 * **A place that is not there leaves the order alone**, as does an entry that
 * is not: what a screen can request is bounded by what it was showing, and a
 * request from a stale screen should do nothing rather than something else.
 */
export function movedTo<T extends { id: string }>(
  items: readonly T[],
  id: string,
  to: number,
): T[] {
  const at = items.findIndex((item) => item.id === id)
  if (at === -1 || !Number.isInteger(to) || to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const moving = next[at]
  if (moving === undefined) return next
  next.splice(at, 1)
  next.splice(to, 0, moving)
  return next
}

/** The order after one entry has been moved one place, which is `movedTo` its neighbour's place. */
export function moved<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: "up" | "down",
): T[] {
  const at = items.findIndex((item) => item.id === id)
  if (at === -1) return [...items]
  return movedTo(items, id, direction === "up" ? at - 1 : at + 1)
}

// === the fields listing ===

/**
 * What a field of an analysis method holds.
 *
 * **Only the four an experiment field can be typed as are here.** `single` and
 * `accession` belong to the two fields a dataset has, which this screen
 * does not show (`catalog.server.ts`) — an axis offering them would hold values
 * that can never leave anything.
 */
export type KeyValueType = "text" | "vocabulary" | "number" | "disease"

export const KEY_VALUE_TYPES: readonly KeyValueType[] = ["text", "vocabulary", "number", "disease"]

export function isKeyValueType(value: string): value is KeyValueType {
  return (KEY_VALUE_TYPES as readonly string[]).includes(value)
}

/**
 * What is wrong with how a key is named, as far as a program can tell.
 *
 * A key's name is the heading of its column on the public page and, for a
 * typed key, the name of a refinement. The rules a program can check are
 * checked here; the rest (a heading is singular, ja and en name the same thing)
 * are the writer's.
 *
 * - **Brackets are half-width with a space before and after** (`Coverage (depth)`),
 *   as everywhere else on the site.
 * - **No unit in brackets.** A number is shown in the unit it was written in
 *   (`73 TB`), so a heading naming one unit contradicts the values under it.
 * - **No 〜の別 or 〜の単位.** A key is named for what its values are.
 * - **English in sentence case, for a typed key** — the first letter capital
 *   and no word after it capitalised, an acronym or a spelling with capitals
 *   inside (`ICD-10`, `RNA-seq`, `ChIP-seq`) kept as it is. Free-text keys are
 *   left out: several are named after an archive (`Sequence Read Archive
 *   Accession`), which a program cannot tell from a word written in title case.
 */
export type KeyLabelProblem = "label-brackets" | "label-unit" | "label-relational" | "label-case"

const UNIT_IN_BRACKETS = /\(\s*(?:bp|kbp?|Mbp?|Gbp?|[KMGT]B|%|x|×|reads?|塩基|人|名|件|本|個)\s*\)/i

export function keyLabelProblem(labelJa: string, labelEn: string, typed: boolean): KeyLabelProblem | null {
  for (const label of [labelJa, labelEn]) {
    if (/[（）]/.test(label) || /\S\(/.test(label) || /\)[^\s)]/.test(label)) return "label-brackets"
    if (UNIT_IN_BRACKETS.test(label)) return "label-unit"
  }
  if (/の(?:別|単位)$/.test(labelJa.trim())) return "label-relational"
  if (typed && !isSentenceCase(labelEn)) return "label-case"
  return null
}

/** The first letter a capital, and no later word a capital followed only by small letters. */
function isSentenceCase(label: string): boolean {
  const words = label.trim().split(/\s+/).map((word) => word.replace(/^[([]+|[)\],.:;]+$/g, ""))
  const [first = "", ...rest] = words
  if (/^[a-z]/.test(first)) return false
  return rest.every((word) => !/^[A-Z][a-z]+$/.test(word))
}

/** Whether a field is drawn on the public analysis-method table. */
/**
 * The orders the terms of one field can be read in.
 *
 * **A vocabulary is a set, not a sequence.** What order the terms of a field
 * are offered in is the input control's business, so this listing is free to be
 * read either way round — unlike the table of fields, where the order on screen
 * is the order the public page draws and is therefore edited rather than
 * chosen.
 */
export const TERM_SORT_KEYS = ["code", "label"] as const
export type TermSortKey = typeof TERM_SORT_KEYS[number]
export const TERM_SORT: TermSortKey = "code"

/** What the listing reads off a field. The screen's row has more. */
export interface KeyFilterRow {
  code: string
  labelJa: string
  labelEn: string
  valueType: string
}

export interface KeyFilter {
  keyword: string
  /** Which to keep. Empty is every one, as an untouched axis is. */
  types: readonly string[]
}

/**
 * The fields a filter leaves, in the order they were handed over — which is the
 * order of the public table, and the thing this screen edits.
 *
 * **What is typed is looked for in the code and in both labels**, each read on
 * its own: a field is reached by its code as often as by its name, and the two
 * languages are what an administrator is comparing when they come here.
 *
 * The keyword and the type combine as an AND; within the axis the choices are
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
    return true
  })
}
