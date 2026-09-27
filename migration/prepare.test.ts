import { describe, expect, it } from "vitest"

import { datasetKey, type Dump, type EsDataset, type EsExperiment } from "./es"
import {
  applyKeyRules,
  assertExperimentEditsApplied,
  dropDatasets,
  dropResearch,
  keepExperiments,
  mergeDumps,
  restoreDatasets,
  splitArchiveAccessions,
  splitSharedExperiments,
  type ExperimentEdit,
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

describe("applyKeyRules", () => {
  it("keeps the value of the key merged into, whichever of the two the dump wrote first", () => {
    const e = experiment({ "MAG Construction": cell("MetaBAT2"), "Analysis Methods": cell("fastp") })
    applyKeyRules(e, new Map<string, KeyRule>([["MAG Construction", { action: "merge-into", to: "Analysis Methods" }]]))

    expect(e.data?.["Analysis Methods"]?.ja?.text).toBe("fastp\nMetaBAT2")
  })
})

describe("dropDatasets", () => {
  it("removes the datasets and every version's and publication's reference to them, keeping the latest version the same object", () => {
    const one = { humId: "hum0014", humVersionId: "hum0014-v1", version: "v1",
      datasets: [{ datasetId: "JGAD000460", version: "v1" }, { datasetId: "JGAD000461", version: "v1" }],
      relatedPublication: [{ title: { en: "P" }, datasetIds: ["JGAD000460", "JGAD000461"] }] }
    const held: Dump = {
      research: new Map([["hum0014", { humId: "hum0014", latestVersion: "v1" }]]),
      publishedVersions: [one],
      latestVersion: new Map([["hum0014", one]]),
      datasetsByKey: new Map([dataset("JGAD000460", [], "hum0014"), dataset("JGAD000461", [], "hum0014")].map((d) => [datasetKey(d.datasetId, d.version), d])),
      versions: [one],
    }
    const left = dropDatasets(held, ["JGAD000461"])

    expect([...left.datasetsByKey.keys()]).toEqual(["JGAD000460@v1"])
    expect(left.publishedVersions[0]?.datasets).toEqual([{ datasetId: "JGAD000460", version: "v1" }])
    expect(left.publishedVersions[0]?.relatedPublication?.[0]?.datasetIds).toEqual(["JGAD000460"])
    expect(left.latestVersion.get("hum0014")).toBe(left.publishedVersions[0])
    expect(left.versions[0]).toBe(left.publishedVersions[0])
  })

  it("leaves a dump without the datasets as it was", () => {
    const held = dump(["hum0001"], [dataset("JGAD000001", [])])

    expect(dropDatasets(held, ["JGAD999999"]).datasetsByKey).toEqual(held.datasetsByKey)
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

  it("appends to a value the target already holds, and reports the HTML no longer matches", () => {
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

  it("gives each archive only its own accessions when both keys have the same list", () => {
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

  it("leaves a copied value alone when it lists no accession of one archive, rather than emptying that key", () => {
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

  it("reports the HTML of a divided cell no longer matches, and keeps it where nothing changed", () => {
    const one = dataset("JGAD000001", [experiment({ "Total Data Volume": cell(volume), "Platform": cell("Illumina") })])
    const two = dataset("JGAD000002", [experiment({ "Total Data Volume": cell(volume), "Platform": cell("Illumina") })])
    splitSharedExperiments([{ label: "JGAD000001", doc: one }, { label: "JGAD000002", doc: two }], new Map())

    expect(one.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.rawHtml).toBeNull()
    expect(one.experiments?.[0]?.data?.Platform).toEqual(cell("Illumina"))
  })

  it("does not touch a block only one dataset has", () => {
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

describe("splitSharedExperiments with a block pinned by a link's address", () => {
  const FREQ = "hum0014.v1.freq.v1"
  const T2DM = "hum0014.v3.T2DM-1.v1"
  const accession = [
    `[${T2DM}](/files/hum0014/${T2DM}.xlsx)`,
    `[Dictionary file](/files/hum0014/${FREQ}_dictionary.xlsx)`,
  ].join("\n")
  const t2dm = () => experiment({ "NBDC Dataset Accession": cell(accession), "Platform": cell("Illumina HumanHap610") }, "Genotyping by array")
  const freq = () => experiment({ "NBDC Dataset Accession": cell(`[${FREQ}](/files/hum0014/hum0014_freq.xlsx)`) }, "Genotyping by array")

  it("takes the block from the dataset only the address names and leaves it whole on the one the words name", () => {
    const one = dataset(FREQ, [freq(), t2dm()], "hum0014")
    const two = dataset(T2DM, [t2dm()], "hum0014")
    const result = splitSharedExperiments([{ label: FREQ, doc: one }, { label: T2DM, doc: two }], new Map())

    expect(one.experiments).toEqual([freq()])
    expect(two.experiments).toEqual([t2dm()])
    expect(result.unpinned).toEqual([{ label: FREQ, heading: "Genotyping by array" }])
    expect(result.review).toEqual([])
  })

  it("keeps the block on a dataset that has no other", () => {
    const one = dataset(FREQ, [t2dm()], "hum0014")
    const two = dataset(T2DM, [t2dm()], "hum0014")
    const result = splitSharedExperiments([{ label: FREQ, doc: one }, { label: T2DM, doc: two }], new Map())

    expect(one.experiments).toHaveLength(1)
    expect(result.unpinned).toEqual([])
  })

  it("still divides the block among the datasets left", () => {
    const text = `JGAD000001: 88 GB\nJGAD000002: 32 GB\n[README](/files/hum0001/JGAD000003_readme.txt)`
    const shared = () => experiment({ "Total Data Volume": cell(text) })
    const own = experiment({ "Total Data Volume": cell("JGAD000003: 1 GB") }, "JGAS000002 (WGS)")
    const one = dataset("JGAD000001", [shared()])
    const two = dataset("JGAD000002", [shared()])
    const three = dataset("JGAD000003", [own, shared()])
    const result = splitSharedExperiments([{ label: "JGAD000001", doc: one }, { label: "JGAD000002", doc: two }, { label: "JGAD000003", doc: three }], new Map())

    expect(three.experiments).toEqual([own])
    expect(one.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.text).toBe("JGAD000001: 88 GB\n[README](/files/hum0001/JGAD000003_readme.txt)")
    expect(two.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.text).toBe("JGAD000002: 32 GB\n[README](/files/hum0001/JGAD000003_readme.txt)")
    expect(result.unpinned).toEqual([{ label: "JGAD000003", heading: "JGAS000001 (WGS)" }])
  })
})

describe("keepExperiments", () => {
  const block = (header: string, text: string) => experiment({ "Japanese Genotype-phenotype Archive Dataset Accession": cell(text) }, header)
  const bmi = () => block("Genotyping by array", "[hum0014.v6.158k.v1](/files/hum0014/hum0014.v6.158k.v1.zip)")
  const wgs = () => block("WGS", "[JGAD000220](https://example.org/JGAD000220)")
  const panel = () => block("WGS リファレンスパネル", "[JGAD000679](https://example.org/JGAD000679)")
  const keep = (experiments: { header: string, names?: string }[]): ExperimentEdit => ({ op: "keep", hum: "hum0014", dataset: "JGAD000679", experiments })

  it("leaves the dataset only the experiments named, and counts the others", () => {
    const doc = dataset("JGAD000679", [bmi(), wgs(), panel()], "hum0014")
    const edit = keep([{ header: "WGS リファレンスパネル" }])
    const applied = new Set<ExperimentEdit>()

    expect(keepExperiments([doc], [edit], applied)).toBe(2)
    expect(doc.experiments).toEqual([panel()])
    expect(applied.has(edit)).toBe(true)
  })

  it("tells two experiments of one heading apart by an ID the block writes", () => {
    const own = block("Metagenomics", "[JGAD000679](https://example.org/JGAD000679)（日本人集団：95名）")
    const other = block("Metagenomics", "DRA014186(JGAS000205)")
    const doc = dataset("JGAD000679", [own, other], "hum0014")

    keepExperiments([doc], [keep([{ header: "Metagenomics", names: "JGAD000679" }])], new Set())

    expect(doc.experiments).toEqual([own])
  })

  it("stops where a heading names two experiments", () => {
    const doc = dataset("JGAD000679", [wgs(), wgs()], "hum0014")

    expect(() => keepExperiments([doc], [keep([{ header: "WGS" }])], new Set())).toThrow(/2 experiments/)
  })

  it("leaves a document without the experiments named, another research and another dataset as they were", () => {
    const older = dataset("JGAD000679", [bmi()], "hum0014")
    const elsewhere = dataset("JGAD000679", [bmi(), panel()], "hum0015")
    const another = dataset("JGAD000690", [bmi(), panel()], "hum0014")
    const applied = new Set<ExperimentEdit>()

    expect(keepExperiments([older, elsewhere, another], [keep([{ header: "WGS リファレンスパネル" }])], applied)).toBe(0)
    expect(older.experiments).toEqual([bmi()])
    expect(elsewhere.experiments).toHaveLength(2)
    expect(another.experiments).toHaveLength(2)
    expect(applied.size).toBe(0)
  })

  it("stops the load on an edit that found nothing", () => {
    const edit = keep([{ header: "WGS" }])

    expect(() => {
      assertExperimentEditsApplied([edit], new Set())
    }).toThrow(/JGAD000679/)
    expect(() => {
      assertExperimentEditsApplied([edit], new Set([edit]))
    }).not.toThrow()
  })
})

describe("splitSharedExperiments with a dataset that keeps its blocks whole", () => {
  const volume = "hum0197.v12.MAG.v1: 153 GB\nDRA014186: 11.5 GB\nDRA014188: 11.9 GB"
  const shared = () => experiment({ "Total Data Volume": cell(volume) }, "Metagenomics")
  const whole: ExperimentEdit = { op: "whole", hum: "hum0197", dataset: "hum0197.v12.MAG.v1" }

  it("keeps the block whole for it, and the others get what the division gives them", () => {
    const mag = dataset("hum0197.v12.MAG.v1", [shared()], "hum0197")
    const one = dataset("DRA014186", [shared()], "hum0197")
    const two = dataset("DRA014188", [shared()], "hum0197")
    const applied = new Set<ExperimentEdit>()
    const result = splitSharedExperiments([{ label: "hum0197.v12.MAG.v1", doc: mag }, { label: "DRA014186", doc: one }, { label: "DRA014188", doc: two }], new Map(), new Map(), { edits: [whole], applied })

    expect(mag.experiments?.[0]?.data?.["Total Data Volume"]).toEqual(cell(volume))
    expect(one.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.text).toBe("DRA014186: 11.5 GB")
    expect(two.experiments?.[0]?.data?.["Total Data Volume"]?.ja?.text).toBe("DRA014188: 11.9 GB")
    expect(result.review.filter((one) => one.dataset === "hum0197.v12.MAG.v1")).toEqual([])
    expect(applied.has(whole)).toBe(true)
  })

  it("does not act for the same label in another research", () => {
    const mag = dataset("hum0197.v12.MAG.v1", [shared()], "hum0001")
    const one = dataset("DRA014186", [shared()], "hum0001")
    const applied = new Set<ExperimentEdit>()
    splitSharedExperiments([{ label: "hum0197.v12.MAG.v1", doc: mag }, { label: "DRA014186", doc: one }], new Map(), new Map(), { edits: [whole], applied })

    expect(applied.size).toBe(0)
  })
})

describe("restoreDatasets", () => {
  const version = (humId: string, n: number, datasets: { datasetId: string, version: string }[]) =>
    ({ humId, humVersionId: `${humId}-v${n}`, version: `v${n}`, datasets })
  const held = (): Dump => {
    const v2 = version("hum0009", 2, [{ datasetId: "JGAD000006", version: "v2" }])
    const v3 = version("hum0009", 3, [{ datasetId: "DRA003802", version: "v1" }])
    return {
      research: new Map(),
      publishedVersions: [v2, v3],
      latestVersion: new Map([["hum0009", v3]]),
      datasetsByKey: new Map([[datasetKey("JGAD000006", "v2"), { datasetId: "JGAD000006", version: "v2", humId: "hum0009" }]]),
      versions: [v2, v3],
    }
  }
  const cpg: EsDataset = { datasetId: "hum0009.v1.CpG.v1", version: "v1", humId: "hum0009" }

  it("adds the dataset and lists it in every version named, the latest included", () => {
    const out = restoreDatasets(held(), [cpg], [{ datasetId: "hum0009.v1.CpG.v1", version: "v1", listedBy: ["hum0009-v2", "hum0009-v3"] }])

    expect(out.datasetsByKey.get(datasetKey("hum0009.v1.CpG.v1", "v1"))).toBe(cpg)
    for (const versions of [out.publishedVersions, out.versions, [...out.latestVersion.values()]]) {
      for (const one of versions) expect(one.datasets).toContainEqual({ datasetId: "hum0009.v1.CpG.v1", version: "v1" })
    }
    expect(out.publishedVersions[0]?.datasets?.[0]).toEqual({ datasetId: "JGAD000006", version: "v2" })
  })

  it("gives every list the same copy of a version, so the latest is still told by identity", () => {
    const out = restoreDatasets(held(), [cpg], [{ datasetId: "hum0009.v1.CpG.v1", version: "v1", listedBy: ["hum0009-v3"] }])

    expect(out.latestVersion.get("hum0009")).toBe(out.publishedVersions[1])
    expect(out.versions[1]).toBe(out.publishedVersions[1])
  })

  it("leaves the input as it was", () => {
    const before = held()
    restoreDatasets(before, [cpg], [{ datasetId: "hum0009.v1.CpG.v1", version: "v1", listedBy: ["hum0009-v3"] }])

    expect(before.versions[1]?.datasets).toEqual([{ datasetId: "DRA003802", version: "v1" }])
    expect(before.datasetsByKey.size).toBe(1)
  })

  it("stops on a dataset already in the dump, one with no document, and a version not in the dump", () => {
    expect(() => restoreDatasets(held(), [{ datasetId: "JGAD000006", version: "v2", humId: "hum0009" }], [{ datasetId: "JGAD000006", version: "v2", listedBy: [] }]))
      .toThrow(/already/)
    expect(() => restoreDatasets(held(), [], [{ datasetId: "hum0009.v1.CpG.v1", version: "v1", listedBy: [] }])).toThrow(/no document/)
    expect(() => restoreDatasets(held(), [cpg], [{ datasetId: "hum0009.v1.CpG.v1", version: "v1", listedBy: ["hum0009-v9"] }])).toThrow(/not in the dump/)
  })
})
