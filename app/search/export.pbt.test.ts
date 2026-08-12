import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { type ExportTable, spreadsheetSafe, toCsv, toTsv } from "./export"

/**
 * A minimal RFC 4180 reader, so that what the writer produces is checked by
 * something that does not share its idea of the format.
 */
function readCsv(text: string): string[][] {
  const rows: string[][] = [[]]
  let value = ""
  let quoted = false
  let at = 0
  const push = () => {
    rows[rows.length - 1]?.push(value)
    value = ""
  }
  while (at < text.length) {
    const char = text.charAt(at)
    if (quoted) {
      if (char === "\"" && text[at + 1] === "\"") {
        value += "\""
        at += 2
        continue
      }
      if (char === "\"") {
        quoted = false
        at += 1
        continue
      }
      value += char
      at += 1
      continue
    }
    if (char === "\"" && value === "") {
      quoted = true
      at += 1
      continue
    }
    if (char === ",") {
      push()
      at += 1
      continue
    }
    if (char === "\r" && text[at + 1] === "\n") {
      push()
      rows.push([])
      at += 2
      continue
    }
    value += char
    at += 1
  }
  push()
  return rows
}

/**
 * A cell, built out of the characters that make a table hard to write down.
 *
 * **`fc.string()` is not enough here**: its default alphabet is printable
 * ASCII, so it never produces a newline or a tab — which is exactly what the
 * two writers have to survive, and what a research title copied out of a
 * spreadsheet actually contains. Measured over 3,000 samples, the default
 * yielded 0 newlines and 0 tabs, so the laws below were passing without ever
 * reaching the code they are about.
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

describe("a table written as CSV", () => {
  it("reads back as the table it was written from", () => {
    fc.assert(fc.property(table, (written) => {
      // Values a spreadsheet would evaluate come back with the guard on them;
      // everything else survives unchanged.
      const expected = [written.headers, ...written.rows]
        .map((row) => row.map(spreadsheetSafe))
      expect(readCsv(toCsv(written))).toEqual(expected)
    }))
  })

  it("never leaves a value a spreadsheet would evaluate", () => {
    fc.assert(fc.property(table, (written) => {
      for (const row of readCsv(toCsv(written))) {
        for (const value of row) expect(/^[=+\-@\t\r]/.test(value)).toBe(false)
      }
    }))
  })
})

describe("a table written as TSV", () => {
  it("keeps one line per row, whatever the values hold", () => {
    fc.assert(fc.property(table, (written) => {
      expect(toTsv(written).split("\n")).toHaveLength(written.rows.length + 1)
    }))
  })

  it("keeps one column per value, whatever the values hold", () => {
    fc.assert(fc.property(table, (written) => {
      const width = written.headers.length
      for (const line of toTsv(written).split("\n")) {
        expect(line.split("\t")).toHaveLength(width)
      }
    }))
  })
})
