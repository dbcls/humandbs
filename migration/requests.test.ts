import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { RichText, Slot } from "~/content/types"

import { isRequest, requestComments, settleRequests } from "./requests"

const text = (value: string): Slot<string> => ({ state: "value", value })
const prose = (...lines: string[]): Slot<RichText> => ({ state: "value", value: lines.map((line) => [{ text: line }]) })
const pair = (ja: string, en = ja) => ({ ja: text(ja), en: text(en) })

describe("isRequest", () => {
  it("recognises each phrasing curators asked in", () => {
    for (const words of [
      "ご教示ください", "ご教示下さい。", "HeLa の情報をお知らせください", "ご確認ください",
      "36検体でしょうか", "101症例になりますか？", "合計になりますか?", "ご記入をお願いします",
    ]) expect(isRequest(words), words).toBe(true)
  })

  it("leaves data values alone, including reader-facing instructions", () => {
    for (const words of [
      "", "NA", "Illumina HiSeq 2500", "ダウンロードは上記 Dataset ID をクリックしてください",
      "無", "none", "ご不明な点は窓口まで",
    ]) expect(isRequest(words), words).toBe(false)
  })
})

describe("settleRequests", () => {
  it("unsettles only the language that asked, and records the field", () => {
    const { content, asked } = settleRequests({ title: pair("膵臓がんの研究", "ご教示ください(英語タイトル)") })

    expect(content.title).toEqual({ ja: text("膵臓がんの研究"), en: { state: "unknown" } })
    expect(asked).toEqual([{ path: "title", en: "ご教示ください(英語タイトル)" }])
  })

  it("addresses a list element by its identity rather than its position", () => {
    const { asked } = settleRequests({
      grants: [
        { id: "grant-1", title: pair("科研費"), agency: { name: pair("JSPS") } },
        { id: "grant-2", title: pair("ご教示ください"), agency: { name: pair("AMED", "ご教示ください(英語名)") } },
      ],
    })

    expect(asked.map((one) => one.path)).toEqual(["grants.grant-2.title", "grants.grant-2.agency.name"])
  })

  it("anchors a question in a value slot to the slot, as the editor does", () => {
    const content = {
      experiments: [{
        id: "experiment-1",
        label: text("WES"),
        values: [{ keyId: "k1", value: { kind: "text", text: { ja: prose("HeLa （購入情報をご教示ください）"), en: prose("HeLa") } } }],
      }],
    }
    const settledContent = settleRequests(content)

    expect(settledContent.asked).toEqual([{ path: "experiments.experiment-1.values.k1", ja: "HeLa （購入情報をご教示ください）" }])
    expect(settledContent.content.experiments[0]?.values[0]?.value.text).toEqual({ ja: { state: "unknown" }, en: prose("HeLa") })
  })

  it("reads a question spread over several lines of prose", () => {
    const { asked } = settleRequests({ values: [{ keyId: "k1", value: { kind: "text", text: { ja: prose("CYP11B2：in house", "CYP11B1：ご教示下さい"), en: prose("x") } } }] })

    expect(asked).toEqual([{ path: "values.k1", ja: "CYP11B2：in house\nCYP11B1：ご教示下さい" }])
  })

  it("unsettles a single-valued slot as a whole", () => {
    const { content, asked } = settleRequests({ relatedPublications: [{ id: "p1", title: text("論文"), doi: text("公開されましたらご教示ください"), datasetIds: [] }] })

    expect(content.relatedPublications[0]?.doi).toEqual({ state: "unknown" })
    expect(asked).toEqual([{ path: "relatedPublications.p1.doi", text: "公開されましたらご教示ください" }])
  })

  it("takes a question out of a list of plain strings, keeping the rest", () => {
    const { content, asked } = settleRequests({ grants: [{ id: "g1", grantIds: ["JP21ck0106", "ご教示ください"] }] })

    expect(content.grants[0]?.grantIds).toEqual(["JP21ck0106"])
    expect(asked).toEqual([{ path: "grants.g1.grantIds", text: "ご教示ください", unmarked: true }])
  })

  it("leaves slots that are not sentences, and states other than a value, as they are", () => {
    const content = {
      title: { ja: { state: "not-applicable" }, en: { state: "unknown" } },
      values: [{ keyId: "n", value: { kind: "number", values: { state: "unknown" } } }],
      datasetIds: ["JGAD000001"],
    }

    expect(settleRequests(content)).toEqual({ content, asked: [] })
  })

  it("changes nothing in content that holds no question", () => {
    const words = fc.string({ maxLength: 20 }).filter((s) => !isRequest(s))
    fc.assert(fc.property(fc.array(fc.tuple(words, words), { maxLength: 5 }), (pairs) => {
      const content = { grants: pairs.map(([ja, en], i) => ({ id: `g${i}`, title: pair(ja, en) })) }
      expect(settleRequests(content)).toEqual({ content, asked: [] })
    }))
  })

  it("leaves no question in place as a value", () => {
    const words = fc.oneof(fc.string({ maxLength: 10 }), fc.constantFrom("ご教示ください", "情報をお知らせください"))
    fc.assert(fc.property(fc.array(fc.tuple(words, words), { maxLength: 5 }), (pairs) => {
      const { content, asked } = settleRequests({ grants: pairs.map(([ja, en], i) => ({ id: `g${i}`, title: pair(ja, en) })) })
      for (const grant of content.grants) {
        for (const slot of [grant.title.ja, grant.title.en]) {
          if (slot.state === "value") expect(isRequest(slot.value)).toBe(false)
        }
      }
      const asking = pairs.filter(([ja, en]) => isRequest(ja) || isRequest(en)).length
      expect(asked).toHaveLength(asking)
    }))
  })
})

describe("requestComments", () => {
  it("drops a bare request, which the unsettled badge already shows", () => {
    expect(requestComments({ kind: "research" }, [
      { path: "title", ja: "ご教示ください", en: "ご教示下さい。" },
      { path: "doi", text: "ご教示ください" },
    ])).toEqual([])
  })

  it("keeps a comment even for a bare request taken out of a list, which leaves no indicator behind", () => {
    expect(requestComments({ kind: "research" }, [{ path: "grants.g1.grantIds", text: "ご教示ください", unmarked: true }]))
      .toEqual([{ anchor: { kind: "research-field", path: "grants.g1.grantIds" }, body: "ご教示ください" }])
  })

  it("keeps a question that states what is asked, once when both languages agree", () => {
    expect(requestComments({ kind: "research" }, [
      { path: "researchProjects.p1.name", ja: "プロジェクト名等ありましたらご教示ください", en: "プロジェクト名等ありましたらご教示ください" },
    ])).toEqual([{ anchor: { kind: "research-field", path: "researchProjects.p1.name" }, body: "プロジェクト名等ありましたらご教示ください" }])
  })

  it("names the language when the two asked differently", () => {
    expect(requestComments({ kind: "dataset", datasetId: "d1" }, [
      { path: "values.k1", ja: "ご教示ください", en: "ご教示ください(英語名)" },
    ])).toEqual([{
      anchor: { kind: "dataset-field", datasetId: "d1", path: "values.k1" },
      body: "日本語: ご教示ください\n英語: ご教示ください(英語名)",
    }])
  })
})
