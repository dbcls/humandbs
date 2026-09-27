/**
 * What the publish confirmation sets side by side for each place a publish
 * changes: the version it is measured against on the left, the draft on the
 * right.
 *
 * **The same comparisons the editing screens open from their "変更あり"**
 * (`field-review.tsx`): a table of elements compared as the page draws it,
 * every other place as the form holds it — both languages, a line each. The
 * one exception is a list of IDs, which the page draws with the datasets'
 * labels where the form holds their identities.
 *
 * Only reads what it is handed, so the screen's loader decides what is drawn.
 */

import { anchoredSide, describeAt, lineRows, type CompareRow } from "./changes"
import { readAt } from "./paths"

import type { AnchoredValue, RowsView } from "~/public/view.server"

/** One place's two sides, as the screen draws them. */
export type ChangeCompare
  = | { kind: "lines", rows: CompareRow[] }
    | { kind: "rows", before: RowsView, after: RowsView | null }

export interface ChangeView {
  path: string
  /** What every screen listing the places of a draft calls this one (`components/places.ts`). */
  name: string
  /** Null where there is nothing to set side by side: only the name is shown. */
  compare: ChangeCompare | null
}

/** One side of the comparison: the form's values, and the page drawn from them where there is one. */
export interface ChangeSide {
  input: unknown
  drawn?: Record<string, AnchoredValue>
}

export function changeViews(
  paths: readonly string[],
  before: ChangeSide,
  after: ChangeSide,
  words: {
    nameOf: (path: string) => string
    /** A vocabulary term's label, for a value that names terms. */
    termLabel: (id: string) => string
    /** What an element of a list is called, where the list is compared by which elements it holds. */
    elementName: (element: unknown) => string
  },
): ChangeView[] {
  return paths.map((path) => ({
    path,
    name: words.nameOf(path),
    compare: compareAt(path, before, after, words),
  }))
}

function compareAt(
  path: string,
  before: ChangeSide,
  after: ChangeSide,
  words: { termLabel: (id: string) => string, elementName: (element: unknown) => string },
): ChangeCompare | null {
  const drawnBefore = before.drawn?.[path]
  const drawnAfter = after.drawn?.[path]
  if (drawnBefore?.kind === "rows" || drawnAfter?.kind === "rows") {
    const shown = drawnBefore?.kind === "rows" ? drawnBefore.rows : null
    const now = drawnAfter?.kind === "rows" ? drawnAfter.rows : null
    return { kind: "rows", before: shown ?? { columns: now?.columns ?? [], rows: [] }, after: now }
  }
  if (drawnBefore?.kind === "ids" || drawnAfter?.kind === "ids") {
    return {
      kind: "lines",
      rows: [{
        label: "",
        before: drawnBefore === undefined ? null : anchoredSide(drawnBefore),
        after: drawnAfter === undefined ? null : anchoredSide(drawnAfter),
      }],
    }
  }

  const lines = [describeAt(before.input, path), describeAt(after.input, path)] as const
  if (lines[0] !== null || lines[1] !== null) {
    return { kind: "lines", rows: lineRows(lines[0] ?? [], lines[1] ?? [], words.termLabel) }
  }

  const keys = path.split(".")
  const was = readAt(before.input, keys)
  const now = readAt(after.input, keys)
  const held = [was.found ? was.value : undefined, now.found ? now.value : undefined] as const
  if (Array.isArray(held[0]) || Array.isArray(held[1])) {
    return { kind: "lines", rows: elementLines(asList(held[0]), asList(held[1]), words.elementName) }
  }
  if (typeof held[0] === "string" || typeof held[1] === "string") {
    return {
      kind: "lines",
      rows: [{ label: "", before: textSide(held[0]), after: textSide(held[1]) }],
    }
  }
  return null
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function textSide(value: unknown): CompareRow["before"] {
  return typeof value === "string" ? { state: "value", text: value } : null
}

/**
 * A list compared by the elements it holds and their order, an element to a
 * line by its name — the two sides compared the way a field's lines are
 * (`passage-diff.ts`), so one moved reads as taken out where it was and put
 * in where it is, and one added or taken away as a line on one side only.
 */
export function elementLines(
  before: readonly unknown[],
  after: readonly unknown[],
  nameOf: (element: unknown) => string,
): CompareRow[] {
  const side = (elements: readonly unknown[]): CompareRow["before"] =>
    elements.length === 0 ? null : { state: "value", text: elements.map(nameOf).join("\n") }
  return [{ label: "", before: side(before), after: side(after) }]
}

/**
 * What an element of a list compared by its elements is called: a value by the
 * catalog key it is under, an experiment by its name, a data provider of the
 * listing's row by the name it shows (Japanese, else English).
 */
export function elementName(element: unknown, keyLabel: (keyId: string) => string): string {
  if (typeof element !== "object" || element === null) return ""
  const held = element as { keyId?: unknown, label?: unknown, name?: unknown }
  if (typeof held.keyId === "string") return keyLabel(held.keyId)
  if (held.label !== undefined) return textOf(held.label)
  if (typeof held.name === "object" && held.name !== null) {
    const pair = held.name as { ja?: unknown, en?: unknown }
    return textOf(pair.ja) || textOf(pair.en)
  }
  return ""
}

function textOf(slot: unknown): string {
  if (typeof slot !== "object" || slot === null) return ""
  const text = (slot as { text?: unknown }).text
  return typeof text === "string" ? text : ""
}

/**
 * The datasets in the order each side shows them, as a table of rows paired
 * by dataset: its position, then its ID. A dataset that moved shows the
 * version's position struck and the draft's added (`previous.tsx` の
 * `RowsCompare`); one only a side has is a row of that side alone.
 */
export function orderCompare(
  before: readonly string[],
  after: readonly string[],
  labelOf: (datasetId: string) => string,
  columns: { position: string, datasetId: string },
): ChangeCompare {
  const table = (ids: readonly string[]): RowsView => ({
    columns: [columns.position, columns.datasetId],
    rows: ids.map((id, at) => ({ id, cells: [String(at + 1), labelOf(id)] })),
  })
  return { kind: "rows", before: table(before), after: table(after) }
}
