import { describe, expect, it } from "vitest"

import type { Dump } from "./es"
import { applyListingEdits } from "./listing-edits"

const rich = (ja: string, en: string) => ({ ja: { text: ja, rawHtml: null }, en: { text: en, rawHtml: null } })
const held = (): Dump => ({
  research: new Map([["hum0574", {
    humId: "hum0574",
    summaryShort: { methods: rich("配列決定、発現", "Sequencing, Expression profiling"), targets: rich("直腸癌:2症例", "rectal cancer: 2 cases"), typeOfData: rich("NGS", "NGS") },
  }]]),
  publishedVersions: [],
  latestVersion: new Map(),
  datasetsByKey: new Map(),
  versions: [],
})

describe("applyListingEdits", () => {
  it("replaces the words in the column and language the edit names, leaving the rest", () => {
    const before = held()
    const out = applyListingEdits(before, [{ hum: "hum0574", field: "methods", lang: "ja", before: "配列決定、発現", after: "配列決定\n発現" }])

    expect(out.research.get("hum0574")?.summaryShort?.methods).toEqual({ ja: { text: "配列決定\n発現", rawHtml: null }, en: { text: "Sequencing, Expression profiling", rawHtml: null } })
    expect(out.research.get("hum0574")?.summaryShort?.targets?.ja?.text).toBe("直腸癌:2症例")
    expect(before.research.get("hum0574")?.summaryShort?.methods?.ja?.text).toBe("配列決定、発現")
  })

  it("stops when the words are not there, or the research is not", () => {
    expect(() => applyListingEdits(held(), [{ hum: "hum0574", field: "targets", lang: "ja", before: "胃腺癌", after: "x" }])).toThrow(/found nothing/)
    expect(() => applyListingEdits(held(), [{ hum: "hum9999", field: "targets", lang: "ja", before: "a", after: "b" }])).toThrow(/found nothing/)
  })
})
