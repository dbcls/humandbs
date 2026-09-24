import { describe, expect, it } from "vitest"

import { datasetKey, type Dump, type EsDataset, type EsExperiment } from "./es"
import {
  applyKeyRules,
  dropResearch,
  mergeDumps,
  splitArchiveAccessions,
  splitSharedExperiments,
  type KeyRule,
} from "./prepare"

const cell = (ja: string, en = ja) => ({ ja: { text: ja, rawHtml: `<p>${ja}</p>` }, en: { text: en, rawHtml: `<p>${en}</p>` } })

const experiment = (data: EsExperiment["data"], header = "JGAS000001 (WGS)"): EsExperiment => ({
  header: { ja: { text: header }, en: { text: header } },
  data,
})

const dataset = (datasetId: string, experiments: EsExperiment[], humId = "hum0001"): EsDataset => ({
  datasetId,
  version: "v1",
  humId,
  experiments,
})

const dump = (humIds: string[], datasets: EsDataset[] = []): Dump => ({
  research: new Map(humIds.map((humId) => [humId, { humId, latestVersion: "v1" }])),
  publishedVersions: humIds.map((humId) => ({ humId, humVersionId: `${humId}-v1`, version: "v1" })),
  latestVersion: new Map(humIds.map((humId) => [humId, { humId, humVersionId: `${humId}-v1`, version: "v1" }])),
  datasetsByKey: new Map(datasets.map((d) => [datasetKey(d.datasetId, d.version), d])),
  versions: humIds.map((humId) => ({ humId, humVersionId: `${humId}-v1`, version: "v1" })),
})

describe("mergeDumps", () => {
  it("adds the research, versions and datasets the extra dump holds", () => {
    const merged = mergeDumps(dump(["hum0001"]), dump(["hum0296"], [dataset("JGAD000466", [], "hum0296")]))

    expect([...merged.research.keys()]).toEqual(["hum0001", "hum0296"])
    expect(merged.publishedVersions.map((v) => v.humVersionId)).toEqual(["hum0001-v1", "hum0296-v1"])
    expect(merged.latestVersion.get("hum0296")?.humVersionId).toBe("hum0296-v1")
    expect(merged.datasetsByKey.has("JGAD000466@v1")).toBe(true)
    expect(merged.versions.map((v) => v.humVersionId)).toEqual(["hum0001-v1", "hum0296-v1"])
  })

  it("refuses a research both dumps hold rather than choosing one", () => {
    expect(() => mergeDumps(dump(["hum0001"]), dump(["hum0001"]))).toThrow(/hum0001/)
  })
})

describe("dropResearch", () => {
  it("removes a research with its versions and its datasets", () => {
    const held = dump(["hum0001", "hum9999"], [dataset("JGAD000001", []), dataset("JGAD999999", [], "hum9999")])
    const left = dropResearch(held, ["hum9999"])

    expect([...left.research.keys()]).toEqual(["hum0001"])
    expect(left.publishedVersions.map((v) => v.humId)).toEqual(["hum0001"])
    expect(left.latestVersion.has("hum9999")).toBe(false)
    expect(left.versions.map((v) => v.humId)).toEqual(["hum0001"])
    expect([...left.datasetsByKey.keys()]).toEqual(["JGAD000001@v1"])
  })
})

describe("applyKeyRules", () => {
  const rules = new Map<string, KeyRule>([
    ["データ容量", { action: "merge-into", to: "Total Data Volume" }],
    ["遺伝子型決定機関", { action: "merge-into", to: "Analysis Methods", labelled: true }],
    ["Types of Clinical Data", { action: "drop" }],
  ])

  it("renames a key to the one it is merged into and keeps its HTML", () => {
    const one = experiment({ データ容量: cell("1 MB") })
    applyKeyRules(one, rules)

    expect(one.data).toEqual({ "Total Data Volume": cell("1 MB") })
  })

  it("appends to a value the target already holds, and says the HTML no longer matches", () => {
    const one = experiment({ "Total Data Volume": cell("4 GB"), "データ容量": cell("1 MB") })
    applyKeyRules(one, rules)

    expect(one.data?.["Total Data Volume"]).toEqual({
      ja: { text: "4 GB\n1 MB", rawHtml: null },
      en: { text: "4 GB\n1 MB", rawHtml: null },
    })
  })

  it("keeps the old label in front of a value whose key said something the target does not", () => {
    const one = experiment({ 遺伝子型決定機関: cell("日本赤十字血液センター", "") })
    applyKeyRules(one, rules)

    expect(one.data?.["Analysis Methods"]).toEqual({
      ja: { text: "遺伝子型決定機関: 日本赤十字血液センター", rawHtml: null },
      en: { text: "", rawHtml: null },
    })
  })

  it("drops a key the rules drop", () => {
    const one = experiment({ "Types of Clinical Data": cell("ご教示ください"), "Platform": cell("Illumina") })
    applyKeyRules(one, rules)

    expect(Object.keys(one.data ?? {})).toEqual(["Platform"])
  })

  it("leaves a key the rules do not name", () => {
    const one = experiment({ Platform: cell("Illumina") })
    applyKeyRules(one, rules)

    expect(one.data).toEqual({ Platform: cell("Illumina") })
  })
})

describe("splitArchiveAccessions", () => {
  const JGA = "Japanese Genotype-phenotype Archive Dataset Accession"
  const SRA = "Sequence Read Archive Accession"

  it("gives each archive only its own accessions when both keys carry the same list", () => {
    const one = experiment({ [JGA]: cell("① JGAD000261 ② DRA008482"), [SRA]: cell("① JGAD000261 ② DRA008482") })
    splitArchiveAccessions(one)

    expect(one.data?.[JGA]?.ja?.text).toBe("JGAD000261")
    expect(one.data?.[SRA]?.ja?.text).toBe("DRA008482")
  })

  it("leaves the two keys alone when they say different things", () => {
    const one = experiment({ [JGA]: cell("JGAD000261"), [SRA]: cell("DRA008482") })
    splitArchiveAccessions(one)

    expect(one.data?.[JGA]).toEqual(cell("JGAD000261"))
    expect(one.data?.[SRA]).toEqual(cell("DRA008482"))
  })

  it("leaves a copied value alone when it names no accession of one archive, rather than emptying that key", () => {
    const one = experiment({ [JGA]: cell("JGAD000261"), [SRA]: cell("JGAD000261") })
    splitArchiveAccessions(one)

    expect(one.data?.[JGA]).toEqual(cell("JGAD000261"))
    expect(one.data?.[SRA]).toEqual(cell("JGAD000261"))
  })
})

describe("splitSharedExperiments", () => {
  const volume = "JGAD000001: 88 GB\nJGAD000002: 32 GB"
  const shared = () => experiment({ "Total Data Volume": cell(volume) })

  it("gives each dataset its own lines of a block the datasets share", () => {
    const one = dataset("JGAD000001", [shared()])
    const two = dataset("JGAD000002", [shared()])
    const result = splitSharedExperiments([{ label: "JGAD000001", doc: one }, { label: "JGAD000002", doc: two }], new Map())

    expect(one.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.text).toBe("JGAD000001: 88 GB")
    expect(two.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.text).toBe("JGAD000002: 32 GB")
    expect(result.stats.split).toBeGreaterThan(0)
  })

  it("says the HTML of a divided cell no longer matches, and keeps it where nothing changed", () => {
    const one = dataset("JGAD000001", [experiment({ "Total Data Volume": cell(volume), "Platform": cell("Illumina") })])
    const two = dataset("JGAD000002", [experiment({ "Total Data Volume": cell(volume), "Platform": cell("Illumina") })])
    splitSharedExperiments([{ label: "JGAD000001", doc: one }, { label: "JGAD000002", doc: two }], new Map())

    expect(one.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.rawHtml).toBeNull()
    expect(one.experiments?.[0]?.data?.Platform).toEqual(cell("Illumina"))
  })

  it("does not touch a block only one dataset carries", () => {
    const one = dataset("JGAD000001", [shared()])
    splitSharedExperiments([{ label: "JGAD000001", doc: one }], new Map())

    expect(one.experiments?.[0]?.data?.["Total Data Volume"]).toEqual(cell(volume))
  })

  it("leaves a cell it cannot settle whole and lists it", () => {
    const both = "JGAD000001 and JGAD000002: 120 GB"
    const one = dataset("JGAD000001", [experiment({ "Total Data Volume": cell(both) })])
    const two = dataset("JGAD000002", [experiment({ "Total Data Volume": cell(both) })])
    const result = splitSharedExperiments([{ label: "JGAD000001", doc: one }, { label: "JGAD000002", doc: two }], new Map())

    expect(one.experiments?.[0]?.data?.["Total Data Volume"]).toEqual(cell(both))
    expect(result.review.length).toBeGreaterThan(0)
  })

  it("treats blocks with different headings as different blocks", () => {
    const one = dataset("JGAD000001", [experiment({ "Total Data Volume": cell(volume) }, "JGAS000001 (WGS)")])
    const two = dataset("JGAD000002", [experiment({ "Total Data Volume": cell(volume) }, "JGAS000002 (WGS)")])
    splitSharedExperiments([{ label: "JGAD000001", doc: one }, { label: "JGAD000002", doc: two }], new Map())

    expect(one.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.text).toBe(volume)
  })
})
