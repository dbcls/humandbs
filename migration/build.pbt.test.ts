import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { buildResearchContent, citedLabel, isAccessionShaped } from "./build"
import type { EsResearchVersion } from "./es"

function build(overrides: Partial<EsResearchVersion>) {
  return buildResearchContent({
    version: {
      humId: "hum0001",
      humVersionId: "hum0001-v1",
      version: "v1",
      versionReleaseDate: "2020-01-01",
      ...overrides,
    },
    listingSummary: null,
    datasetIdByLabel: new Map<string, string>(),
  })
}

describe("buildResearchContent", () => {
  it("never emits an unsettled slot, whatever the input looks like", () => {
    const text = fc.option(fc.string(), { nil: undefined })
    const rich = fc.record({ ja: fc.record({ text }), en: fc.record({ text }) })
    fc.assert(fc.property(
      fc.record({
        title: fc.record({ ja: text, en: text }),
        releaseNote: rich,
        grant: fc.array(fc.record({ title: fc.record({ ja: text }), id: fc.array(fc.string()) })),
        relatedPublication: fc.array(fc.record({ title: fc.record({ en: text }) })),
        dataProvider: fc.array(fc.record({ name: rich })),
      }),
      (overrides) => {
        const content = build(overrides)
        const states = new Set<string>()
        const walk = (node: unknown): void => {
          if (Array.isArray(node)) {
            node.forEach(walk)
            return
          }
          if (node === null || typeof node !== "object") return
          const record = node as Record<string, unknown>
          if (typeof record.state === "string") states.add(record.state)
          Object.values(record).forEach(walk)
        }
        walk(content)
        expect([...states]).toEqual(["value"])
      },
    ))
  })
})

describe("a cited ID", () => {
  const letters = fc.stringMatching(/^[A-Z]{2,5}$/)

  it("is folded once and stays folded", () => {
    fc.assert(fc.property(fc.string(), (label) => {
      expect(citedLabel(citedLabel(label))).toBe(citedLabel(label))
    }))
  })

  it("reads JGA's long and short forms as one ID", () => {
    fc.assert(fc.property(fc.constantFrom("JGAD", "JGAS"), fc.stringMatching(/^\d{6}$/), (prefix, digits) => {
      expect(citedLabel(`${prefix}00000${digits}`)).toBe(`${prefix}${digits}`)
    }))
  })

  it("is a placeholder when its digits are all zero, whatever their number", () => {
    fc.assert(fc.property(letters, fc.integer({ min: 1, max: 14 }), (prefix, length) => {
      expect(isAccessionShaped(`${prefix}${"0".repeat(length)}`)).toBe(false)
    }))
  })

  it("is shaped as an accession when letters are followed by digits that are not all zero", () => {
    fc.assert(fc.property(letters, fc.stringMatching(/^\d{0,5}[1-9]\d{0,5}$/), (prefix, digits) => {
      expect(isAccessionShaped(`${prefix}${digits}`)).toBe(true)
      expect(isAccessionShaped(`E-GEAD-${digits}`)).toBe(true)
    }))
    for (const junk of ["", "JGAD", "000123", "jgad000001", "JGAD 000001", "JGAD000001x"]) {
      expect(isAccessionShaped(junk)).toBe(false)
    }
  })
})
