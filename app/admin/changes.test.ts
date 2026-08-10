import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"

import {
  changedDatasetFromPublished,
  changedFromPublished,
  describeAt,
  describeInput,
} from "./changes"
import { researchContentInput } from "./form"

function research(overrides: Partial<ResearchContent> = {}): ResearchContent {
  return { ...emptyResearchContent(), ...overrides }
}

function titled(ja: string): ResearchContent {
  return research({ title: { ja: filled(ja), en: filled("") } })
}

function dataset(overrides: Partial<DatasetContent> = {}): DatasetContent {
  return { ...emptyDatasetContent(), ...overrides }
}

describe("where a draft differs from the version that is out there", () => {
  it("reports the fields that moved and nothing else", () => {
    expect(changedFromPublished(titled("前"), titled("後"))).toEqual(["title"])
    expect(changedFromPublished(titled("同じ"), titled("同じ"))).toEqual([])
  })

  /** The memo is not published, so it cannot be a difference from a version. */
  it("never reports the memo, which is not part of what a version says", () => {
    expect(changedFromPublished(titled("同じ"), titled("同じ"))).not.toContain("note")
  })

  it("reports a list whose membership changed as the list itself", () => {
    const published = dataset({ experiments: [] })
    const draft = dataset({ experiments: [{ id: "e1", label: filled("Exome"), values: [] }] })
    expect(changedDatasetFromPublished(published, draft)).toEqual(["experiments"])
  })

  it("reports a field of an element by the element's identity", () => {
    const experiment = (label: string) => ({ id: "e1", label: filled(label), values: [] })
    expect(changedDatasetFromPublished(
      dataset({ experiments: [experiment("WGS")] }),
      dataset({ experiments: [experiment("Exome")] }),
    )).toEqual(["experiments.e1.label"])
  })
})

describe("showing what the published version says at a path", () => {
  const published = researchContentInput(research({
    title: { ja: filled("和名"), en: { state: "unknown" } },
    grants: [{
      id: "g1",
      title: { ja: filled("研究費"), en: filled("Grant") },
      agency: { name: { ja: filled(""), en: filled("") } },
      grantIds: ["JP1", "JP2"],
    }],
    summary: {
      ...emptyResearchContent().summary,
      url: {
        ja: filled([{ id: "l1", url: "https://example.jp/", text: "研究室" }]),
        en: { state: "not-applicable" },
      },
    },
  }))

  it("gives one line per language for a translated pair, with each language's state", () => {
    expect(describeAt(published, "title")).toEqual([
      { label: "ja", state: "value", text: "和名" },
      { label: "en", state: "unknown", text: "" },
    ])
  })

  it("gives the addresses of a link field and the members of a plain list", () => {
    expect(describeAt(published, "summary.url")).toEqual([
      { label: "ja", state: "value", text: "https://example.jp/" },
      { label: "en", state: "not-applicable", text: "" },
    ])
    expect(describeAt(published, "grants.g1.grantIds"))
      .toEqual([{ label: "", state: "value", text: "JP1, JP2" }])
  })

  it("gives a value slot's term ids for the screen to resolve", () => {
    const slot = { keyId: "k1", value: { kind: "vocabulary", state: "value", termIds: ["t1"] } }
    expect(describeInput(slot)).toEqual([{ label: "", state: "value", text: "", termIds: ["t1"] }])
  })

  /**
   * A list whose membership moved has no single value to show, so the mark
   * stands on its own rather than inventing one.
   */
  it("gives nothing for a list of elements, where the difference is the membership", () => {
    expect(describeAt(published, "grants")).toBe(null)
    expect(describeAt(published, "nowhere")).toBe(null)
  })
})
