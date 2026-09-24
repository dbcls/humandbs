import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { compareRows, type ComparedTable } from "./compare-rows"

const COLUMNS = ["研究課題名", "研究課題番号"]

function table(...rows: [string, ...string[]][]): ComparedTable {
  return { columns: COLUMNS, rows: rows.map(([id, ...cells]) => ({ id, cells })) }
}

describe("compareRows", () => {
  it("pairs rows by id, so taking one out does not mark every row after it changed", () => {
    const before = table(["a", "A", "1"], ["b", "B", "2"], ["c", "C", "3"])
    const after = table(["a", "A", "1"], ["c", "C", "3"])

    expect(compareRows(before, after).map((row) => [row.kind, row.id])).toEqual([
      ["same", "a"], ["removed", "b"], ["same", "c"],
    ])
  })

  it("marks a row the draft adds, in the draft's place", () => {
    const rows = compareRows(table(["a", "A", "1"]), table(["n", "N", "9"], ["a", "A", "1"]))

    expect(rows.map((row) => [row.kind, row.id])).toEqual([["added", "n"], ["same", "a"]])
  })

  it("marks only the cells that moved in a row both sides hold", () => {
    const [row] = compareRows(table(["a", "Old title", "1"]), table(["a", "New title", "1"]))

    if (row?.kind !== "changed") throw new Error(row?.kind)
    expect(row.parts[1]).toBeNull()
    expect(row.parts[0]?.some((part) => part.kind === "del" && part.text.includes("Old"))).toBe(true)
    expect(row.parts[0]?.some((part) => part.kind === "ins" && part.text.includes("New"))).toBe(true)
  })

  it("keeps a row dropped from the top at the top", () => {
    const rows = compareRows(table(["x", "X", ""], ["a", "A", ""]), table(["a", "A", ""]))

    expect(rows.map((row) => row.id)).toEqual(["x", "a"])
  })

  it("lists every published row as removed when the draft holds none", () => {
    const before = table(["a", "A", "1"], ["b", "B", "2"])

    expect(compareRows(before, table())).toEqual(compareRows(before, null))
    expect(compareRows(before, null).map((row) => [row.kind, row.id])).toEqual([["removed", "a"], ["removed", "b"]])
  })

  it("puts every row of either side in the table once, the draft's in its order and each dropped one under the row above it", () => {
    const ids = fc.uniqueArray(fc.constantFrom<string>("a", "b", "c", "d", "e", "f"), { maxLength: 6 })
    fc.assert(fc.property(ids, ids, fc.boolean(), (was, now, retitle) => {
      const before = table(...was.map((id): [string, string, string] => [id, id, ""]))
      const after = table(...now.map((id): [string, string, string] => [id, retitle ? `${id}!` : id, ""]))
      const rows = compareRows(before, after)

      const seen = rows.map((row) => row.id)
      expect(new Set(seen).size).toBe(seen.length)
      expect(new Set(seen)).toEqual(new Set([...was, ...now]))
      expect(rows.filter((row) => row.kind !== "removed").map((row) => row.id)).toEqual(now)
      // A dropped row stands after the row that stood above it and survived,
      // and a dropped row with none above it stands ahead of every survivor.
      for (const [at, row] of rows.entries()) {
        if (row.kind !== "removed") continue
        const above = was.slice(0, was.indexOf(row.id)).filter((id) => now.includes(id)).at(-1)
        const firstKept = rows.findIndex((one) => one.kind !== "removed")
        if (above === undefined) expect(firstKept === -1 || at < firstKept).toBe(true)
        else expect(seen.indexOf(above)).toBeLessThan(at)
      }
      for (const row of rows) {
        const expected = !was.includes(row.id) ? "added" : !now.includes(row.id) ? "removed" : retitle ? "changed" : "same"
        expect(row.kind).toBe(expected)
      }
    }))
  })
})
