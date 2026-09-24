/**
 * Taking a source's values into a draft: the three-row face's arithmetic.
 *
 * A source is anything already in the draft's own shape — a version, another
 * draft, or an application laid over this draft (`templates.ts` の
 * `applicationInput`). The face never asks which: it reads the paths the two
 * disagree at (`diff.ts`, `dataset-diff.ts`), shows both readings, and holds a
 * third value — **what will be written** — that starts from the source and is
 * edited like any field.
 *
 * **Where the source says nothing, the draft's reading stands.** An empty
 * language of a title, an empty list of links, an empty list of numbers: the
 * source leaving a blank is not the source saying "blank", and starting the
 * written value from it would clear the draft's work without anybody asking.
 * A state (未確定・該当なし) is something said, and is taken.
 *
 * **An array of things with an identity is a set of rows to tick**, not one
 * value. Both sides' elements stand in one list — the draft's in its order,
 * then the ones only the source has — and all of them start ticked, for the
 * same reason as above: an element the source lacks is not one it asks to
 * remove. An element both sides hold is compared field by field under its own
 * paths, so ticking it keeps whatever those rows say.
 */

import { diffDraftInput } from "./diff"
import type { DraftInput } from "./form"
import { identityOf, readAt, writeAt } from "./paths"

/** How one kind of form is compared and addressed. */
export interface TakeShape<T> {
  diff: (base: T, other: T) => string[]
  /** The keys a reported path is read at: a research's paths are under `content`. */
  keysOf: (path: string) => string[]
  /** Paths the face does not offer: what the draft decides elsewhere. */
  skip: readonly string[]
  /**
   * Other paths that are the same place as a reported one and move with it —
   * the diff names the place once, but the form holds it in two fields.
   */
  along?: (path: string) => string[]
}

/** The paths the face shows, in the order the form shows them. */
export function takePlaces<T>(shape: TakeShape<T>, mine: T, theirs: T): string[] {
  return shape.diff(mine, theirs).filter((path) => !shape.skip.includes(path))
}

/** Whether the value at a path is a list of identified elements on either side. */
export function isList<T>(shape: TakeShape<T>, mine: T, theirs: T, path: string): boolean {
  const keys = shape.keysOf(path)
  return [mine, theirs].some((side) => {
    const found = readAt(side, keys)
    return found.found && Array.isArray(found.value)
      && found.value.some((item) => identityOf(item) !== undefined)
  })
}

export interface ListRow {
  id: string
  /** The element as the draft holds it, or the source's where the draft has none. */
  element: unknown
  inMine: boolean
  inTheirs: boolean
}

function listAt(side: unknown, keys: readonly string[]): unknown[] {
  const found = readAt(side, keys)
  return found.found && Array.isArray(found.value) ? found.value : []
}

/** Both sides' elements: the draft's in its order, then the ones only the source has. */
export function listRows<T>(shape: TakeShape<T>, mine: T, theirs: T, path: string): ListRow[] {
  const keys = shape.keysOf(path)
  const ours = listAt(mine, keys)
  const others = listAt(theirs, keys)
  const ourIds = new Set(ours.map(identityOf))
  const otherIds = new Set(others.map(identityOf))
  const rows: ListRow[] = []
  for (const element of ours) {
    const id = identityOf(element)
    if (id !== undefined) rows.push({ id, element, inMine: true, inTheirs: otherIds.has(id) })
  }
  for (const element of others) {
    const id = identityOf(element)
    if (id !== undefined && !ourIds.has(id)) rows.push({ id, element, inMine: false, inTheirs: true })
  }
  return rows
}

/**
 * The written value with one element ticked in or out. The list is rebuilt in
 * the rows' order, so ticking an element back puts it where it stood. An element
 * still in the written value keeps what was written into it; one ticked back in
 * comes back as the face opened it (`opened`), holding the source's reading.
 */
export function withElement<T>(
  shape: TakeShape<T>,
  written: T,
  opened: T,
  rows: readonly ListRow[],
  path: string,
  id: string,
  on: boolean,
): T {
  const keys = shape.keysOf(path)
  const byId = (value: T) => new Map(listAt(value, keys).map((element) => [identityOf(element), element]))
  const held = byId(written)
  const first = byId(opened)
  const next = rows.flatMap((row) => {
    const keep = row.id === id ? on : held.has(row.id)
    if (!keep) return []
    return [held.get(row.id) ?? first.get(row.id) ?? row.element]
  })
  return writeAt(written, keys, next) as T
}

/** The ids a written value's list holds at a path. */
export function heldIds<T>(shape: TakeShape<T>, written: T, path: string): string[] {
  return listAt(written, shape.keysOf(path)).flatMap((element) => {
    const id = identityOf(element)
    return id === undefined ? [] : [id]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** A slot (`TextInput` or `LinksInput`) that is a value and holds nothing. */
function blankSlot(value: unknown): boolean {
  if (!isRecord(value) || value.state !== "value") return false
  if (typeof value.text === "string") return value.text.trim() === ""
  if (Array.isArray(value.links)) return value.links.length === 0
  return false
}

/**
 * The source's reading, with whatever it leaves blank filled from the draft's.
 * A pair is decided a language at a time; a plain list of strings (grant
 * numbers, cited datasets) is blank when it is empty.
 */
export function sourceOrDraft(mine: unknown, theirs: unknown): unknown {
  if (Array.isArray(theirs)) {
    return theirs.length === 0 && Array.isArray(mine) && theirs.every((item) => typeof item === "string")
      ? mine
      : theirs
  }
  if (isRecord(theirs) && isRecord(theirs.ja) && isRecord(theirs.en) && isRecord(mine)) {
    return {
      ...theirs,
      ja: blankSlot(theirs.ja) && mine.ja !== undefined ? mine.ja : theirs.ja,
      en: blankSlot(theirs.en) && mine.en !== undefined ? mine.en : theirs.en,
    }
  }
  return blankSlot(theirs) && mine !== undefined ? mine : theirs
}

/**
 * What the face opens holding: the draft, with every offered place set to the
 * source's reading (blanks kept from the draft) and every list holding both
 * sides' elements.
 */
export function initialTake<T>(shape: TakeShape<T>, mine: T, theirs: T): T {
  let written = mine
  for (const path of takePlaces(shape, mine, theirs)) {
    const keys = shape.keysOf(path)
    if (isList(shape, mine, theirs, path)) {
      const rows = listRows(shape, mine, theirs, path)
      written = writeAt(written, keys, rows.map((row) => {
        const found = readAt(written, [...keys, row.id])
        return found.found ? found.value : row.element
      })) as T
      continue
    }
    const along = shape.along?.(path) ?? []
    if (along.length === 0) {
      const source = readAt(theirs, keys)
      if (!source.found) continue
      const held = readAt(written, keys)
      written = writeAt(written, keys, sourceOrDraft(held.found ? held.value : undefined, source.value)) as T
      continue
    }
    // **One place is blank only when all of it is**: the source naming a
    // dataset only in the typed list still says which datasets it cites.
    const parts = [keys, ...along.map((one) => shape.keysOf(one))]
    const blank = parts.every((part) => {
      const source = readAt(theirs, part)
      return !source.found || blankValue(source.value)
    })
    if (blank) continue
    for (const part of parts) {
      const source = readAt(theirs, part)
      if (source.found) written = writeAt(written, part, source.value) as T
    }
  }
  return written
}

/** A value the source says nothing with: an empty slot, or an empty list of strings. */
function blankValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  return blankSlot(value)
}

export const RESEARCH_TAKE: TakeShape<DraftInput> = {
  diff: diffDraftInput,
  keysOf: (path) => ["content", ...path.split(".")],
  // Which datasets a version lists is the research's to say, and the draft
  // holds only their order (docs/editing.md の「データセットを足す・消す」).
  skip: ["datasetIds"],
  // A publication's datasets are one place in two lists: the research's own,
  // chosen, and the ones typed (`diff.ts` の `takeField`).
  along: (path) => /^relatedPublications\.[^.]+\.datasetIds$/.test(path)
    ? [path.replace(/datasetIds$/, "externalIds")]
    : [],
}
