import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { Slot } from "~/content/types"
import type { FileLabel } from "~/files/labels"
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
  }
  const later = { ...key, id: "key-2", code: "read-length", labelJa: "", labelEn: "Read length", position: 2 }
  return {
    keyById: new Map([[key.id, key], [later.id, later]]),
    keyByCode: new Map([[key.code, key], [later.code, later]]),
    termById: new Map([["term-1", {
      code: "hiseq-2500", labelJa: "HiSeq 2500", labelEn: "HiSeq 2500", maker: null, position: 0, documentSlug: null,
    }]]),
  }
}

const context: ApiContext = { origin: ORIGIN, catalog: catalogOf() }

function dataset(content = emptyDatasetContent(), fileLabels: ReadonlyMap<string, FileLabel> = new Map()) {
  return apiDataset({
    label: "JGAD000001",
    humLabel: "hum0001",
    datePublished: "2020-01-01",
    dateModified: null,
    content,
    files: [{ name: "a.zip", size: 12 }],
    fileLabels,
  }, context)
}

function research(content = emptyResearchContent(), fileLabels: ReadonlyMap<string, FileLabel> = new Map()) {
  return apiResearch({
    humLabel: "hum0001",
    versionNumber: 3,
    releaseDate: "2020-01-01",
    versions: [{ number: 3, releaseDate: "2020-01-01" }, { number: 1, releaseDate: "2016-01-01" }],
    content,
    datasetLabelById: new Map([["d-1", "JGAD000001"]]),
    cau: [],
    files: [{ name: "a.zip", size: 12 }],
    fileLabels,
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

  it("responds with the canonical number and unit, not with what was typed", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [{
        keyId: "key-2",
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{ label: null, value: 100, unit: "bp", inputValue: 0.1, inputUnit: "kbp", note: null }],
          },
        },
      }],
    })
    expect(answer.values).toEqual([{
      key: "read-length",
      label: { en: "Read length" },
      type: "number",
      numbers: [{ value: 100, unit: "bp", high: null }],
    }])
  })

  it("reports a number's label and note as a value per language", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [{
        keyId: "key-2",
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{
              label: { ja: "常染色体", en: "" },
              value: 100,
              unit: "bp",
              inputValue: 0.1,
              inputUnit: "kbp",
              note: { ja: "", en: "average" },
            }],
          },
        },
      }],
    })
    expect(answer.values[0]).toMatchObject({
      numbers: [{ label: { ja: "常染色体" }, note: { en: "average" } }],
    })
  })

  it("leaves out a number's label and note where neither language was given one", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [{
        keyId: "key-2",
        value: {
          kind: "number",
          values: { state: "value", value: [{ label: null, value: 100, unit: "bp", inputValue: 0.1, inputUnit: "kbp", note: null }] },
        },
      }],
    })
    const value = answer.values[0]
    const [one] = value?.type === "number" ? value.numbers ?? [] : []
    expect(one).not.toHaveProperty("label")
    expect(one).not.toHaveProperty("note")
  })

  it("has the upper end of a width, and null on a number that is not one", () => {
    const answer = dataset({
      ...emptyDatasetContent(),
      values: [{
        keyId: "key-2",
        value: {
          kind: "number",
          values: {
            state: "value",
            value: [{ label: null, value: 900, unit: "GB", inputValue: 0.9, inputUnit: "TB", high: 1300, inputHigh: 1.3, note: null }],
          },
        },
      }],
    })
    expect(answer.values[0]).toMatchObject({ numbers: [{ value: 900, unit: "GB", high: 1300 }] })
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

describe("a list of IDs in an answer", () => {
  const grant = (grantIds: Slot<string[]>) => ({
    id: "g1",
    title: { ja: filled("課題"), en: filled("Project") },
    agency: { name: { ja: filled("JSPS"), en: filled("JSPS") } },
    grantIds,
  })
  const publication = (datasetIds: Slot<string[]>, externalIds: string[] = []) => ({
    id: "p1", title: filled("A paper"), doi: filled(""), datasetIds, externalIds,
  })

  it("gives the IDs, null where the list does not apply, and nothing where it is empty or unsettled", () => {
    const answer = research({
      ...emptyResearchContent(),
      grants: [grant(filled(["JP1"])), grant({ state: "not-applicable" }), grant(filled([])), grant({ state: "unknown" })],
    })
    expect(answer.grants.map((one) => one.grantIds)).toEqual([["JP1"], null, undefined, undefined])
  })

  it("names a publication's datasets by label and typed ID only while the column holds a value", () => {
    const answer = research({
      ...emptyResearchContent(),
      relatedPublications: [publication(filled(["d-1"]), ["DRA000001"]), publication({ state: "not-applicable" }, ["DRA000001"])],
    })
    expect(answer.relatedPublications.map((one) => one.datasets)).toEqual([["JGAD000001", "DRA000001"], null])
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

  it("keeps only a file selection the prefix actually lists", () => {
    const answer = dataset({ ...emptyDatasetContent(), fileSelection: ["a.zip", "gone.zip"] })
    expect(answer.files).toEqual([
      { name: "a.zip", size: 12, url: `${ORIGIN}/files/hum0001/a.zip` },
    ])
  })
})

describe("a file's label", () => {
  const selected = { ...emptyDatasetContent(), fileSelection: ["a.zip"] }

  it("gives both languages as they were written, on a research's files and a dataset's", () => {
    const labels = new Map([["a.zip", { ja: "辞書ファイル", en: "Dictionary file" }]])
    expect(research(emptyResearchContent(), labels).files[0]?.label).toEqual({ ja: "辞書ファイル", en: "Dictionary file" })
    expect(dataset(selected, labels).files[0]?.label).toEqual({ ja: "辞書ファイル", en: "Dictionary file" })
  })

  it("leaves out a language that was not written rather than giving it the other's words", () => {
    const labels = new Map([["a.zip", { ja: "", en: "Paper" }]])
    expect(research(emptyResearchContent(), labels).files[0]?.label).toEqual({ en: "Paper" })
    expect(dataset(selected, new Map([["a.zip", { ja: "論文", en: "" }]])).files[0]?.label).toEqual({ ja: "論文" })
  })

  it("is not a key of a file that has none", () => {
    expect(research().files[0]).not.toHaveProperty("label")
    expect(dataset(selected, new Map([["other.zip", { ja: "他", en: "other" }]])).files[0]).not.toHaveProperty("label")
  })
})
