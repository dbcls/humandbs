import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { buildResearchContent } from "./build"
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
