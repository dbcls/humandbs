import fc from "fast-check"
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

  it("takes out a row with no value, leaving an empty table", () => {
    const { content: out, settled, dropped } = settleEmptyCells(content({
      grants: [grant(pair("", ""), pair("", ""))],
      relatedPublications: [publication("", "", [])],
      researchProjects: [project({ ja: { state: "not-applicable" }, en: { state: "not-applicable" } }, links([], []))],
    }))

    expect(out.grants).toEqual([])
    expect(out.relatedPublications).toEqual([])
    expect(out.researchProjects).toEqual([])
    expect(dropped).toBe(3)
    expect(settled).toBe(0)
  })

  it("counts a curator's request as no value, in a cell or in a list of numbers", () => {
    const asking = grant(pair("", ""), pair("ご教示ください", "ご教示ください"), ["ご教示ください"])
    const named = project(pair("プロジェクト名等ありましたらご教示ください", "プロジェクト名等ありましたらご教示ください(英語名)"), links([], []))
    const { content: out } = settleEmptyCells(content({ grants: [asking, grant(pair("課題", "Title"), pair("JSPS", "JSPS"), ["JP1"])], researchProjects: [named] }))

    expect(out.grants.map((one) => one.grantIds)).toEqual([{ state: "value", value: ["JP1"] }])
    expect(out.researchProjects).toEqual([])
  })

  it("keeps a row whose only value is a dataset typed for a paper, or a number", () => {
    const typed = publication("ご教示ください", "", [], ["JGAD000001"])
    const numbered = grant(pair("", ""), pair("", ""), ["JP1"])
    const { content: out } = settleEmptyCells(content({ relatedPublications: [typed], grants: [numbered] }))

    expect(out.relatedPublications.map((one) => one.externalIds)).toEqual([["JGAD000001"]])
    expect(out.grants.map((one) => one.title)).toEqual([{ ja: NA, en: NA }])
  })

  it("leaves a request in a row with a value for the request to be settled", () => {
    const one = grant(pair("課題", "Title"), pair("JSPS", "ご教示ください (英語名)"), ["JP1"])
    expect(settleEmptyCells(content({ grants: [one] })).content.grants).toEqual([one])
  })

  it("keeps every row with a value, in order, and only those", () => {
    const cellArb = fc.constantFrom<Slot<string>>(text(""), text(" "), text("ご教示ください"), text("JSPS"), text("課題"), { state: "not-applicable" }, { state: "unknown" })
    const holds = (slot: Slot<string>) => slot.state === "value" && ["JSPS", "課題"].includes(slot.value)
    const rowArb = fc.record({ ja: cellArb, en: cellArb, agencyJa: cellArb, agencyEn: cellArb, ids: fc.constantFrom<string[]>([], ["JP1"], ["ご教示ください"]) })
    fc.assert(fc.property(fc.array(rowArb, { maxLength: 6 }), (rows) => {
      const grants = rows.map((row, at): Grant => ({
        id: `g-${at}`,
        title: { ja: row.ja, en: row.en },
        agency: { name: { ja: row.agencyJa, en: row.agencyEn } },
        grantIds: { state: "value", value: row.ids },
      }))
      const out = settleEmptyCells(content({ grants }))

      const kept = rows.flatMap((row, at) => [row.ja, row.en, row.agencyJa, row.agencyEn].some(holds) || row.ids.includes("JP1") ? [`g-${at}`] : [])
      expect(out.content.grants.map((one) => one.id)).toEqual(kept)
      expect(out.dropped).toBe(rows.length - kept.length)
    }))
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
