import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { buildDatasetContent, buildResearchContent, citedLabel, isAccessionShaped, ownLines } from "./build"
import type { EsResearchVersion, PublishedDataset } from "./es"

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

describe("a cell of groups under headings alone on their lines", () => {
  const word = fc.stringMatching(/^[a-z]{1,8}$/)
  const cell = fc.integer({ min: 2, max: 4 }).chain((count) => fc.record({
    count: fc.constant(count),
    prefix: fc.array(word, { maxLength: 2 }),
    groups: fc.array(fc.record({ study: fc.integer({ min: 1, max: count }), lines: fc.array(word, { minLength: 1, maxLength: 3 }) }), { minLength: 1, maxLength: 5 }),
  }))
  const labelOf = (n: number) => `JGAD00000${String(n)}`
  const studyOf = (n: number) => `JGAS00000${String(n)}`

  const divide = ({ count, prefix, groups }: { count: number, prefix: string[], groups: { study: number, lines: string[] }[] }) => {
    const text = [...prefix, ...groups.flatMap((group) => [`【${studyOf(group.study)}】`, ...group.lines])].join("\n")
    const labels = Array.from({ length: count }, (_, i) => labelOf(i + 1))
    const studies = new Map(labels.map((label, i) => [studyOf(i + 1), [label]]))
    const all: PublishedDataset[] = labels.map((label) => ({
      label,
      humId: "hum0001",
      firstListedOn: null,
      doc: { datasetId: label, version: "v1", humId: "hum0001", experiments: [{ data: { "Materials and Participants": { ja: { text }, en: { text } } } }] },
    }))
    const owned = ownLines(all, undefined, undefined, studies)
    return new Map(all.map((one) => {
      const content = buildDatasetContent({
        dataset: one,
        keyIdByCode: new Map([["materials-and-participants", "key-materials"]]),
        codeBySourceKey: new Map([["Materials and Participants", "materials-and-participants"]]),
        termIdBySetAndCode: new Map(),
        knownCode: () => false,
        accessCriteriaKeyCode: "access-criteria",
        typeOfDataKeyCode: "type-of-data",
        datasetLabels: new Set(labels),
        ownLines: owned,
        studies,
        unread: [],
        byHand: new Map(),
      })
      const held = content.experiments[0]?.values[0]?.value
      const lines = held?.kind === "text" && held.text.ja.state === "value" ? held.text.ja.value.map((line) => line.map((span) => span.text).join("")) : []
      return [one.label, lines] as const
    }))
  }

  it("gives each dataset the lines above the first heading and every group under its own heading, in order", () => {
    fc.assert(fc.property(cell, (input) => {
      const divided = divide(input)
      for (const [label, lines] of divided) {
        const own = input.groups.filter((group) => labelOf(group.study) === label)
        const expected = own.length === 0
          ? [...input.prefix, ...input.groups.flatMap((group) => [`【${studyOf(group.study)}】`, ...group.lines])]
          : [...input.prefix, ...input.groups.flatMap((group) => (labelOf(group.study) === label ? [`【${studyOf(group.study)}】`, ...group.lines] : []))]
        expect(lines).toEqual(expected)
      }
    }))
  })

  it("loses no group: each stays with the dataset its heading names", () => {
    fc.assert(fc.property(cell, (input) => {
      const divided = divide(input)
      for (const group of input.groups) {
        const block = [`【${studyOf(group.study)}】`, ...group.lines].join("\n")
        expect(divided.get(labelOf(group.study))?.join("\n")).toContain(block)
      }
    }))
  })
})
