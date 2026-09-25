import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { splitSharedBlock } from "./inversion"

const LABELS = ["JGAD000001", "JGAD000002", "JGAD000003", "JGAD000004"]

/** A value with nothing that could be read as a marker of its own. */
const safeValue = fc.string({ minLength: 0, maxLength: 8 })
  .filter((s) => !/JGA[DS]\d{6}/.test(s) && !s.includes("\n") && !s.includes(":") && !s.includes("："))

const sharedLine = fc.constantFrom("共通の説明", "note", "備考: 特になし")

/**
 * A block guaranteed to resolve cleanly, whatever it draws: one line per
 * dataset naming that dataset and nothing else, in dataset order, followed by
 * any number of lines naming no dataset at all. Order is fixed rather than
 * shuffled because the algorithm reads a line's owner from its content, not
 * its position, so a fixed layout already exercises that.
 */
const cleanBlockArb = fc.uniqueArray(fc.constantFrom(...LABELS), { minLength: 1, maxLength: LABELS.length })
  .chain((datasets) => fc.record({
    datasets: fc.constant(datasets),
    values: fc.array(safeValue, { minLength: datasets.length, maxLength: datasets.length }),
    shared: fc.array(sharedLine, { maxLength: 3 }),
  }))
  .map(({ datasets, values, shared }) => {
    const owned = datasets.map((label, i) => `${label}: ${values[i] ?? ""}`)
    return { datasets, key: "Total Data Volume", text: [...owned, ...shared].join("\n") }
  })

function ownCell(result: ReturnType<typeof splitSharedBlock>, label: string, key: string): string[] {
  return (result.perDataset.get(label)?.[key]?.ja ?? "").split("\n")
}

describe("splitting a block with one line per dataset plus shared lines", () => {
  it("never drops a dataset's own line or a line naming nobody", () => {
    fc.assert(fc.property(cleanBlockArb, ({ datasets, key, text }) => {
      const result = splitSharedBlock({ [key]: { ja: text, en: text } }, datasets, new Map())
      const union = new Set(datasets.flatMap((label) => ownCell(result, label, key)))
      for (const line of text.split("\n")) {
        if (line.trim() === "") continue
        expect(union.has(line)).toBe(true)
      }
    }))
  })

  it("keeps a dataset's own line for that dataset alone", () => {
    fc.assert(fc.property(cleanBlockArb, ({ datasets, key, text }) => {
      const result = splitSharedBlock({ [key]: { ja: text, en: text } }, datasets, new Map())
      const lines = text.split("\n")
      datasets.forEach((label, i) => {
        const own = lines[i]
        if (own === undefined) return
        for (const other of datasets) {
          expect(ownCell(result, other, key).includes(own)).toBe(other === label)
        }
      })
    }))
  })

  it("keeps a shared line for every dataset", () => {
    fc.assert(fc.property(cleanBlockArb, ({ datasets, key, text }) => {
      const result = splitSharedBlock({ [key]: { ja: text, en: text } }, datasets, new Map())
      const lines = text.split("\n")
      for (const line of lines.slice(datasets.length)) {
        for (const label of datasets) expect(ownCell(result, label, key).includes(line)).toBe(true)
      }
    }))
  })

  /**
   * A dataset's own copy already has only its own lines, so splitting it
   * again — alone, as if it were the whole block — must return exactly what
   * went in.
   */
  it("is a fixed point on a dataset's own copy", () => {
    fc.assert(fc.property(cleanBlockArb, ({ datasets, key, text }) => {
      const result = splitSharedBlock({ [key]: { ja: text, en: text } }, datasets, new Map())
      for (const label of datasets) {
        const own = result.perDataset.get(label)
        if (own === undefined) throw new Error(`expected a copy for ${label}`)
        const again = splitSharedBlock(own, [label], new Map())
        expect(again.perDataset.get(label)).toEqual(own)
      }
    }))
  })

  it("never reports a clean block for review", () => {
    fc.assert(fc.property(cleanBlockArb, ({ datasets, key, text }) => {
      const result = splitSharedBlock({ [key]: { ja: text, en: text } }, datasets, new Map())
      expect(result.stats.review).toBe(0)
      expect(result.review).toEqual([])
    }))
  })
})
