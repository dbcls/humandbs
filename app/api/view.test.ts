import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import type { CatalogView } from "~/public/view.server"

import { apiDataset, apiResearch, type ApiContext } from "./view"

const ORIGIN = "https://humandbs.dbcls.jp"

function catalogOf(): CatalogView {
  const key = {
    id: "key-1",
    code: "platform",
    labelJa: "プラットフォーム",
    labelEn: "Platform",
    position: 1,
    showOnPublicPage: true,
  }
  const later = { ...key, id: "key-2", code: "read-length", labelJa: "", labelEn: "Read length", position: 2 }
  return {
    keyById: new Map([[key.id, key], [later.id, later]]),
    keyByCode: new Map([[key.code, key], [later.code, later]]),
    termById: new Map([["term-1", { code: "hiseq-2500", labelJa: "HiSeq 2500", labelEn: "HiSeq 2500" }]]),
  }
}

const context: ApiContext = { origin: ORIGIN, catalog: catalogOf() }

function dataset(content = emptyDatasetContent()) {
  return apiDataset({
    label: "JGAD000001",
    humLabel: "hum0001",
    datePublished: "2020-01-01",
    dateModified: null,
    content,
    files: [{ name: "a.zip", size: 12 }],
  }, context)
}

function research(content = emptyResearchContent()) {
  return apiResearch({
    humLabel: "hum0001",
    versionNumber: 3,
    releaseDate: "2020-01-01",
    versions: [{ number: 3, releaseDate: "2020-01-01" }, { number: 1, releaseDate: "2016-01-01" }],
    content,
    datasetLabelById: new Map([["d-1", "JGAD000001"]]),
    cau: [],
    files: [{ name: "a.zip", size: 12 }],
  }, context)
}

describe("prose in an answer", () => {
  it("comes out as plain text, one line per line", () => {
    const answer = research({
      ...emptyResearchContent(),
      summary: {
        ...emptyResearchContent().summary,
        aims: {
          ja: { state: "value", value: [[{ text: "一行目" }], [{ text: "二行目" }]] },
          en: { state: "value", value: [] },
        },
      },
    })
    expect(answer.summary.aims).toEqual({ ja: "一行目\n二行目" })
  })

  it("loses the destination of a link inside a sentence but keeps its words", () => {
    const answer = research({
      ...emptyResearchContent(),
      releaseNote: {
        ja: {
          state: "value",
          value: [[{ text: "see " }, { text: "JGAD000001", href: "https://ddbj.nig.ac.jp/x" }]],
        },
        en: { state: "value", value: [] },
      },
    })
    expect(answer.releaseNote).toEqual({ ja: "see JGAD000001" })
    expect(JSON.stringify(answer)).not.toContain("ddbj.nig.ac.jp/x")
  })

  it("keeps the destination of a link that is a value of its own", () => {
    const answer = research({
      ...emptyResearchContent(),
      summary: {
        ...emptyResearchContent().summary,
        url: {
          ja: { state: "value", value: [{ id: "l-1", url: "https://lab.example/", text: "研究室" }] },
          en: { state: "value", value: [] },
        },
      },
    })
    expect(answer.summary.url).toEqual({ ja: [{ url: "https://lab.example/", text: "研究室" }] })
  })
})

describe("a value under a catalog key", () => {
  it("names the key by its code and a vocabulary value by the term's code", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [{ keyId: "key-1", value: { kind: "vocabulary", termIds: { state: "value", value: ["term-1"] } } }],
    })
    expect(answer.values).toEqual([{
      key: "platform",
      label: { ja: "プラットフォーム", en: "Platform" },
      type: "vocabulary",
      terms: [{ code: "hiseq-2500", label: { ja: "HiSeq 2500", en: "HiSeq 2500" } }],
    }])
  })

  it("answers with the canonical number and unit, not with what was typed", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [{
        keyId: "key-2",
        value: {
          kind: "number",
          value: { state: "value", value: { value: 100, unit: "bp", inputValue: 0.1, inputUnit: "kbp" } },
        },
      }],
    })
    expect(answer.values).toEqual([{
      key: "read-length",
      label: { en: "Read length" },
      type: "number",
      number: { value: 100, unit: "bp" },
    }])
  })

  it("comes out in the catalog's display order rather than the content's", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [
        { keyId: "key-2", value: { kind: "single", value: { state: "value", value: "later" } } },
        { keyId: "key-1", value: { kind: "single", value: { state: "value", value: "first" } } },
      ],
    })
    expect(answer.values.map((value) => value.key)).toEqual(["platform", "read-length"])
  })

  it("drops a key the catalog does not know", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [{ keyId: "key-9", value: { kind: "single", value: { state: "value", value: "x" } } }],
    })
    expect(answer.values).toEqual([])
  })

  it("keeps a value that is known not to exist, as null", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [{ keyId: "key-1", value: { kind: "vocabulary", termIds: { state: "not-applicable" } } }],
    })
    expect(answer.values).toEqual([{
      key: "platform",
      label: { ja: "プラットフォーム", en: "Platform" },
      type: "vocabulary",
      terms: null,
    }])
  })
})

describe("what an answer names", () => {
  it("gives a dataset the label a reader addresses it by, never its identity", () => {
    const answer = research({ ...emptyResearchContent(), datasetIds: ["d-1", "d-2"] })
    expect(answer.datasets).toEqual(["JGAD000001"])
  })

  it("builds every URL on the site's own origin", () => {
    const answer = research()
    expect(answer.url).toBe(`${ORIGIN}/research/hum0001/v3`)
    expect(answer.files).toEqual([
      { name: "a.zip", size: 12, url: `${ORIGIN}/files/hum0001/a.zip` },
    ])
    expect(dataset().url).toBe(`${ORIGIN}/dataset/JGAD000001`)
  })

  it("lists the published versions oldest first, whatever order they arrived in", () => {
    expect(research().versions).toEqual([
      { version: 1, datePublished: "2016-01-01" },
      { version: 3, datePublished: "2020-01-01" },
    ])
  })

  it("keeps only a file selection the box actually lists", () => {
    const answer = dataset({ ...emptyDatasetContent(), fileSelection: ["a.zip", "gone.zip"] })
    expect(answer.files).toEqual([
      { name: "a.zip", size: 12, url: `${ORIGIN}/files/hum0001/a.zip` },
    ])
  })
})
