/**
 * Two versions of a table of elements, set as one table.
 *
 * The rows are paired by the element's id, not by position: taking out the
 * third element would otherwise pair every later row with its neighbour and
 * mark all of them changed. A row only the published side has is shown where it
 * stood — after the last row before it that both sides still hold — so a table
 * read top to bottom keeps the published order with the draft's rows in theirs.
 */

import { diffText, type DiffPart } from "~/passage-diff"

export interface ComparedTable {
  columns: string[]
  rows: { id: string, cells: string[] }[]
}

export type ComparedRow
  = | { kind: "same", id: string, cells: string[] }
    | { kind: "removed", id: string, cells: string[] }
    | { kind: "added", id: string, cells: string[] }
    /** A cell is its pieces where the two sides say something else, and null where they agree. */
    | { kind: "changed", id: string, cells: string[], parts: (DiffPart[] | null)[] }

export function compareRows(before: ComparedTable, after: ComparedTable | null): ComparedRow[] {
  const afterRows = after?.rows ?? []
  const kept = new Set(afterRows.map((row) => row.id))
  const beforeById = new Map(before.rows.map((row) => [row.id, row]))

  // Each row the draft dropped, gathered under the last surviving row above it.
  const dropped = new Map<string | null, ComparedRow[]>()
  let anchor: string | null = null
  for (const row of before.rows) {
    if (kept.has(row.id)) {
      anchor = row.id
      continue
    }
    const under = dropped.get(anchor) ?? []
    under.push({ kind: "removed", id: row.id, cells: row.cells })
    dropped.set(anchor, under)
  }

  const out: ComparedRow[] = [...dropped.get(null) ?? []]
  for (const row of afterRows) {
    const was = beforeById.get(row.id)
    if (was === undefined) {
      out.push({ kind: "added", id: row.id, cells: row.cells })
    } else {
      const parts = row.cells.map((cell, at) => {
        const old = was.cells[at] ?? ""
        return old === cell ? null : diffText(old, cell)
      })
      out.push(parts.every((part) => part === null)
        ? { kind: "same", id: row.id, cells: row.cells }
        : { kind: "changed", id: row.id, cells: row.cells, parts })
    }
    out.push(...dropped.get(row.id) ?? [])
  }
  return out
}
