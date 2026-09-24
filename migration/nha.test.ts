import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { assignNhaIds, type NhaCandidate } from "./nha"

const candidate = (label: string, firstPublished: string | null): NhaCandidate => ({
  label,
  humId: label.split(".")[0] ?? "",
  firstPublished,
})

describe("assignNhaIds", () => {
  it("numbers what was published first by the day it was first published", () => {
    const ids = assignNhaIds([
      candidate("hum0014.v2.gwas.v1", "2015-03-01"),
      candidate("hum0014.v1.freq.v1", "2014-09-30"),
    ])

    expect(Object.fromEntries(ids)).toEqual({ "hum0014.v1.freq.v1": "NHA000001", "hum0014.v2.gwas.v1": "NHA000002" })
  })

  it("breaks a tie of days by research number, then by old name", () => {
    const ids = assignNhaIds([
      candidate("hum0197.v3.gwas.v1", "2020-01-01"),
      candidate("hum0035.v1.b.v1", "2020-01-01"),
      candidate("hum0035.v1.a.v1", "2020-01-01"),
    ])

    expect([...ids.keys()]).toEqual(["hum0035.v1.a.v1", "hum0035.v1.b.v1", "hum0197.v3.gwas.v1"])
  })

  it("puts what was never published after everything that was, whatever its research number", () => {
    const ids = assignNhaIds([
      candidate("hum0008.v2.ngs.v1", null),
      candidate("hum0600.v1.a.v1", "2026-07-31"),
    ])

    expect(Object.fromEntries(ids)).toEqual({ "hum0600.v1.a.v1": "NHA000001", "hum0008.v2.ngs.v1": "NHA000002" })
  })

  it("refuses a name given twice rather than numbering it twice", () => {
    expect(() => assignNhaIds([candidate("hum0001.v1.a.v1", null), candidate("hum0001.v1.a.v1", "2020-01-01")]))
      .toThrow(/twice/)
  })

  const candidates = fc.uniqueArray(
    fc.record({
      hum: fc.integer({ min: 1, max: 9999 }),
      token: fc.constantFrom("freq", "gwas", "ngs", "SV"),
      day: fc.option(fc.date({ min: new Date("2012-01-01"), max: new Date("2026-12-31"), noInvalidDate: true })),
    }).map(({ hum, token, day }) => {
      const humId = `hum${String(hum).padStart(4, "0")}`
      return { label: `${humId}.v1.${token}.v1`, humId, firstPublished: day === null ? null : day.toISOString().slice(0, 10) }
    }),
    { selector: (one) => one.label, maxLength: 30 },
  )

  it("numbers every candidate once, from 1 with no gap", () => {
    fc.assert(fc.property(candidates, (input) => {
      const numbers = [...assignNhaIds(input).values()].map((id) => Number(id.slice(3))).sort((a, b) => a - b)
      expect(numbers).toEqual(input.map((_one, i) => i + 1))
    }))
  })

  it("gives the same numbers whatever order the candidates arrive in", () => {
    fc.assert(fc.property(candidates.chain((input) => fc.tuple(fc.constant(input), fc.shuffledSubarray(input, { minLength: input.length }))), ([input, shuffled]) => {
      expect(assignNhaIds(shuffled)).toEqual(assignNhaIds(input))
    }))
  })

  it("never numbers an unpublished one before a published one, nor a later day before an earlier", () => {
    fc.assert(fc.property(candidates, (input) => {
      const ids = assignNhaIds(input)
      const ordered = input.toSorted((a, b) => (ids.get(a.label) ?? "") < (ids.get(b.label) ?? "") ? -1 : 1)
      for (let i = 1; i < ordered.length; i += 1) {
        const before = ordered[i - 1]
        const after = ordered[i]
        if (before === undefined || after === undefined) continue
        if (before.firstPublished === null) expect(after.firstPublished).toBeNull()
        else if (after.firstPublished !== null) expect(before.firstPublished <= after.firstPublished).toBe(true)
      }
    }))
  })
})
