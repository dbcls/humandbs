import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { type ExportTable, spreadsheetSafe, toTsv } from "./export"

/**
 * What a reader of tab-separated text gets back: the two separators and nothing
 * else. **It honours no quoting**, which is the point — the writer has to leave
 * a table that survives being read this simply, since that is how a paste and a
 * column-at-a-time tool both read it.
 */
function readTsv(text: string): string[][] {
  return text.split("\n").map((line) => line.split("\t"))
}

/**
 * A cell, built out of the characters that make a table hard to write down.
 *
 * **`fc.string()` is not enough here**: its default alphabet is printable
 * ASCII, so it never produces a newline or a tab — which is exactly what the
 * writer has to survive, and what a research title copied out of a spreadsheet
 * actually contains. Measured over 3,000 samples, the default yielded 0
 * newlines and 0 tabs, so the laws below were passing without ever reaching the
 * code they are about.
 */
const cell = fc.string({
  unit: fc.constantFrom("a", "z", "研", "究", " ", ",", "\"", "\n", "\r\n", "\r", "\t", "-"),
  maxLength: 10,
})

/** A table of any width, with the same width on every row. */
const table: fc.Arbitrary<ExportTable> = fc
  .integer({ min: 1, max: 6 })
  .chain((width) =>
    fc.record({
      headers: fc.array(cell, { minLength: width, maxLength: width }),
      rows: fc.array(
        fc.array(cell, { minLength: width, maxLength: width }),
        { maxLength: 8 },
      ),
    }),
  )

describe("a table written as TSV", () => {
  it("keeps one line per row, whatever the values hold", () => {
    fc.assert(fc.property(table, (written) => {
      expect(readTsv(toTsv(written))).toHaveLength(written.rows.length + 1)
    }))
  })

  it("keeps one column per value, whatever the values hold", () => {
    fc.assert(fc.property(table, (written) => {
      const width = written.headers.length
      for (const row of readTsv(toTsv(written))) expect(row).toHaveLength(width)
    }))
  })

  it("leaves no separator inside a value it reads back", () => {
    fc.assert(fc.property(table, (written) => {
      for (const row of readTsv(toTsv(written))) {
        for (const value of row) expect(value).not.toMatch(/[\t\n\r]/)
      }
    }))
  })

  it("loses nothing but the spacing", () => {
    // Compared with the whitespace taken out on both sides, so that the law
    // says "every other character survives" rather than repeating the way the
    // writer collapses a run of them.
    const visible = (value: string) => value.replaceAll(/\s+/gu, "")
    fc.assert(fc.property(table, (written) => {
      const back = readTsv(toTsv(written))
      const from = [written.headers, ...written.rows]
      from.forEach((row, y) => {
        row.forEach((value, x) => {
          expect(visible(back[y]?.[x] ?? "")).toBe(visible(spreadsheetSafe(value)))
        })
      })
    }))
  })

  it("never leaves a value a spreadsheet would evaluate", () => {
    fc.assert(fc.property(table, (written) => {
      for (const row of readTsv(toTsv(written))) {
        for (const value of row) expect(/^[=+\-@\t\r]/.test(value)).toBe(false)
      }
    }))
  })
})
