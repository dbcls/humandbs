import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  icd10Code,
  icd10CodesIn,
  icd10InRange,
  icd10Parent,
  icd10Order,
  icd10Range,
  icd10Resolve,
  icd10Spans,
  mergeEntries,
  parseWhoMeta,
  type Icd10Entry,
} from "./codes"

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

/** A code as one of the distributions writes it. */
const code = fc
  .tuple(
    fc.constantFrom(...LETTERS),
    fc.integer({ min: 0, max: 99 }),
    fc.stringMatching(/^[0-9A-Z]{0,2}$/),
  )
  .map(([letter, digits, tail]) => `${letter}${String(digits).padStart(2, "0")}${tail}`)

describe("reading a code", () => {
  it("accepts what it itself produced, whatever the point and the case", () => {
    fc.assert(fc.property(code, (written) => {
      expect(icd10Code(written)).toBe(written)
      expect(icd10Code(written.toLowerCase())).toBe(written)
      const dotted = written.length > 3 ? `${written.slice(0, 3)}.${written.slice(3)}` : written
      expect(icd10Code(dotted)).toBe(written)
    }))
  })

  it("gives a parent that is itself a code, and roots that have none", () => {
    fc.assert(fc.property(code, (written) => {
      const parent = icd10Parent(written)
      if (written.length === 3) {
        expect(parent).toBeNull()
        return
      }
      expect(parent).not.toBeNull()
      expect(icd10Code(parent ?? "")).toBe(parent)
      expect(icd10Parent(parent ?? "")).toBeNull()
    }))
  })
})

describe("merging", () => {
  const entries = fc.array(fc.record({
    code,
    titleEn: fc.option(fc.string({ minLength: 1 }), { nil: null }),
    titleJa: fc.option(fc.string({ minLength: 1 }), { nil: null }),
  }))

  it("holds each code once, and only codes that were given", () => {
    fc.assert(fc.property(entries, entries, (a, b) => {
      const held = mergeEntries(a, b)
      const codes = held.map((entry) => entry.code)
      expect(new Set(codes).size).toBe(codes.length)
      const given = new Set([...a, ...b].map((entry) => entry.code))
      for (const one of codes) expect(given.has(one)).toBe(true)
    }))
  })

  it("never invents a title, and never drops one that was the only one", () => {
    fc.assert(fc.property(entries, entries, (a, b) => {
      const held = new Map(mergeEntries(a, b).map((entry) => [entry.code, entry]))
      const titlesOf = (all: Icd10Entry[], of: string, side: "titleEn" | "titleJa") =>
        all.filter((entry) => entry.code === of).map((entry) => entry[side])
      for (const [one, entry] of held) {
        for (const side of ["titleEn", "titleJa"] as const) {
          const given = [...titlesOf(a, one, side), ...titlesOf(b, one, side)]
          if (entry[side] === null) {
            expect(given.every((title) => title === null)).toBe(true)
          } else {
            expect(given).toContain(entry[side])
          }
        }
      }
    }))
  })
})

describe("reading WHO's distribution", () => {
  it("never reads a line whose eighth field is not a code", () => {
    const fields = fc.array(fc.string().filter((one) => !one.includes(";")), {
      minLength: 9,
      maxLength: 12,
    })
    fc.assert(fc.property(fc.array(fields), (lines) => {
      const text = lines.map((one) => one.join(";")).join("\n")
      for (const entry of parseWhoMeta(text)) {
        expect(icd10Code(entry.code)).toBe(entry.code)
        expect(entry.titleEn).not.toBe("")
      }
    }))
  })
})

describe("the codes an annotation names", () => {
  it("gives codes of the classification, each one once", () => {
    fc.assert(fc.property(fc.string(), (raw) => {
      const held = icd10CodesIn(raw)
      for (const one of held) expect(icd10Code(one)).toBe(one)
      expect(new Set(held).size).toBe(held.length)
    }))
  })

  it("expands a range into consecutive roots, or into nothing", () => {
    const range = fc.tuple(
      fc.constantFrom(...LETTERS),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
    )
    fc.assert(fc.property(range, ([letter, from, to]) => {
      const pad = (n: number) => String(n).padStart(2, "0")
      const held = icd10CodesIn(`${letter}${pad(from)}-${pad(to)}`)
      if (held.length === 0) return
      // Narrow enough to be a disease, and every step is there.
      expect(held.length).toBeLessThan(10)
      expect(held).toEqual(
        Array.from({ length: to - from + 1 }, (_, i) => `${letter}${pad(from + i)}`),
      )
    }))
  })
})

describe("resolving against a dictionary", () => {
  it("returns something the dictionary holds and the code begins with", () => {
    fc.assert(fc.property(code, fc.array(code), (written, dictionary) => {
      const known = (one: string) => dictionary.includes(one)
      const held = icd10Resolve(written, known)
      if (held === null) return
      expect(known(held)).toBe(true)
      expect(written.startsWith(held)).toBe(true)
      expect(held.length).toBeGreaterThanOrEqual(3)
    }))
  })

  it("returns the longest held prefix, never a shorter one", () => {
    fc.assert(fc.property(code, fc.array(code), (written, dictionary) => {
      const known = (one: string) => dictionary.includes(one)
      const held = icd10Resolve(written, known)
      const longest = [...Array(written.length - 2).keys()]
        .map((i) => written.slice(0, written.length - i))
        .find(known) ?? null
      expect(held).toBe(longest)
    }))
  })

  it("gives nothing when the dictionary is empty", () => {
    fc.assert(fc.property(code, (written) => {
      expect(icd10Resolve(written, () => false)).toBeNull()
    }))
  })
})

/** A three- or four-character code, the two lengths the classification is imported at. */
const termCode = fc
  .tuple(
    fc.constantFrom(...LETTERS.slice(0, 4)),
    fc.integer({ min: 0, max: 99 }),
    fc.stringMatching(/^[0-9]?$/),
  )
  .map(([letter, digits, tail]) => `${letter}${String(digits).padStart(2, "0")}${tail}`)

/** A classification, and some of its codes. */
const chosen = fc
  .uniqueArray(termCode, { minLength: 1, maxLength: 60 })
  .chain((classification) => fc.tuple(fc.constant(classification), fc.subarray(classification)))

/** The codes of the classification a chip's entry stands for. */
function expanded(span: string, classification: readonly string[]): string[] {
  const [lower, upper] = span.split("-")
  if (lower === undefined) return []
  if (upper === undefined) return [lower]
  return classification.filter((code) => icd10InRange(code, { lower, upper }))
}

describe("a range typed as two ends", () => {
  it("is a range for ends of one length in order, whichever order they are typed in", () => {
    fc.assert(fc.property(termCode, termCode, (a, b) => {
      const read = icd10Range(a, b)
      if (a.length !== b.length) {
        expect(read).toEqual({ state: "problem", problem: "lengths-differ" })
        return
      }
      if (a > b) {
        expect(read).toEqual({ state: "problem", problem: "reversed" })
        return
      }
      expect(read).toEqual({ state: "range", lower: a, upper: b })
      expect(icd10InRange(a, { lower: a, upper: b })).toBe(true)
      expect(icd10InRange(b, { lower: a, upper: b })).toBe(true)
    }))
  })
})

describe("codes as a disease's chip shows them", () => {
  it("stands for exactly the codes it was given", () => {
    fc.assert(fc.property(chosen, ([classification, codes]) => {
      const spans = icd10Spans(codes, icd10Order(classification))
      const shown = spans.flatMap((span) => expanded(span, classification))
      expect([...shown].sort()).toEqual([...codes].sort())
    }))
  })

  it("writes no range of fewer than three codes, and lists its entries in code order", () => {
    fc.assert(fc.property(chosen, ([classification, codes]) => {
      const spans = icd10Spans(codes, icd10Order(classification))
      for (const span of spans) {
        if (span.includes("-")) expect(expanded(span, classification).length).toBeGreaterThanOrEqual(3)
      }
      const firsts = spans.map((span) => span.split("-")[0] ?? "")
      expect(firsts).toEqual([...firsts].sort())
    }))
  })

  it("never leaves three consecutive codes outside one range", () => {
    fc.assert(fc.property(chosen, ([classification, codes]) => {
      const order = icd10Order(classification)
      const spans = icd10Spans(codes, order)
      const spanOf = (code: string) => spans.find((span) => expanded(span, classification).includes(code))
      const held = new Set(codes)
      const at = new Map([...order].map(([code, index]) => [`${code.length}:${index}`, code]))
      for (const code of codes) {
        const index = order.get(code) ?? 0
        const next = at.get(`${code.length}:${index + 1}`)
        const after = at.get(`${code.length}:${index + 2}`)
        if (next === undefined || after === undefined || !held.has(next) || !held.has(after)) continue
        expect(spanOf(next)).toBe(spanOf(code))
        expect(spanOf(after)).toBe(spanOf(code))
      }
    }))
  })
})
