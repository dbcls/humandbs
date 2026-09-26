import { describe, expect, it } from "vitest"

import type { Grant, Link, LocalizedLinks, RelatedPublication, ResearchProject, Slot, TranslatedText } from "~/content/types"

import { settleEmptyCells } from "./empty-cells"

const text = (value: string): Slot<string> => ({ state: "value", value })
const pair = (ja: string, en: string): TranslatedText => ({ ja: text(ja), en: text(en) })
const links = (ja: Link[], en: Link[]): LocalizedLinks => ({ ja: { state: "value", value: ja }, en: { state: "value", value: en } })
const link: Link = { id: "l-1", url: "https://example.org", text: "lab" }
const NA = { state: "not-applicable" }

const grant = (title: TranslatedText, agency: TranslatedText, grantIds: string[] = []): Grant =>
  ({ id: "g-1", title, agency: { name: agency }, grantIds: { state: "value", value: grantIds } })
const publication = (title: string, doi: string, datasetIds: string[] = ["d-1"], externalIds: string[] = []): RelatedPublication =>
  ({ id: "p-1", title: text(title), doi: text(doi), datasetIds: { state: "value", value: datasetIds }, externalIds })
const project = (name: TranslatedText, url: LocalizedLinks): ResearchProject => ({ id: "r-1", name, url })

const content = (over: Partial<{ grants: Grant[], relatedPublications: RelatedPublication[], researchProjects: ResearchProject[], url: LocalizedLinks }>) => ({
  title: pair("研究", "Research"),
  summary: { url: over.url ?? links([link], [link]) },
  grants: over.grants ?? [],
  relatedPublications: over.relatedPublications ?? [],
  researchProjects: over.researchProjects ?? [],
})

describe("settleEmptyCells", () => {
  it("makes a grant's title not-applicable when neither language has one and the row has an agency", () => {
    const { content: out, settled } = settleEmptyCells(content({ grants: [grant(pair("", ""), pair("JSPS", "JSPS"), ["JP123"])] }))

    expect(out.grants[0]?.title).toEqual({ ja: NA, en: NA })
    expect(out.grants[0]?.agency.name).toEqual(pair("JSPS", "JSPS"))
    expect(settled).toBe(2)
  })

  it("makes a grant's numbers not-applicable when the row is written and has none", () => {
    const { content: out } = settleEmptyCells(content({ grants: [grant(pair("課題", "Title"), pair("JSPS", "JSPS")), grant(pair("課題", "Title"), pair("JSPS", "JSPS"), ["JP1"])] }))

    expect(out.grants.map((one) => one.grantIds)).toEqual([NA, { state: "value", value: ["JP1"] }])
  })

  it("makes a paper's datasets not-applicable when it names none, chosen or typed", () => {
    const { content: out } = settleEmptyCells(content({
      relatedPublications: [publication("A", "10.1/a", []), publication("B", "10.1/b", [], ["JGAD000001"]), publication("C", "10.1/c")],
    }))

    expect(out.relatedPublications.map((one) => one.datasetIds)).toEqual([NA, { state: "value", value: [] }, { state: "value", value: ["d-1"] }])
    expect(out.relatedPublications.map((one) => one.externalIds)).toEqual([[], ["JGAD000001"], []])
  })

  it("leaves a title written in one language to be shown in the other", () => {
    const one = grant(pair("科研費の課題", ""), pair("JSPS", "JSPS"), ["JP1"])
    expect(settleEmptyCells(content({ grants: [one] })).content.grants[0]).toEqual(one)
  })

  it("leaves a row with nothing written at all", () => {
    const empty = grant(pair("", ""), pair("", ""))
    expect(settleEmptyCells(content({ grants: [empty] })).content.grants[0]).toEqual(empty)
  })

  it("makes a paper's missing DOI not-applicable", () => {
    const { content: out } = settleEmptyCells(content({ relatedPublications: [publication("A paper", ""), publication("Another", "10.1/x")] }))

    expect(out.relatedPublications.map((one) => one.doi)).toEqual([NA, text("10.1/x")])
  })

  it("settles each language of a URL on its own", () => {
    const { content: out } = settleEmptyCells(content({
      url: links([], []),
      researchProjects: [project(pair("プロジェクト", "Project"), links([link], []))],
    }))

    expect(out.summary.url).toEqual({ ja: NA, en: NA })
    expect(out.researchProjects[0]?.url).toEqual({ ja: { state: "value", value: [link] }, en: NA })
  })

  it("leaves a value already settled or asked about as it is", () => {
    const asked = { ja: { state: "unknown" as const }, en: { state: "unknown" as const } }
    const one = grant(asked, pair("JSPS", "JSPS"), ["JP1"])
    expect(settleEmptyCells(content({ grants: [one] })).content.grants[0]).toEqual(one)
  })

  it("keeps whatever else the content has", () => {
    const whole = { ...content({}), datasets: [{ datasetId: "d-1" }] }
    expect(settleEmptyCells(whole).content.datasets).toBe(whole.datasets)
  })
})
