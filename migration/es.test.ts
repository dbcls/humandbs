import { describe, expect, it } from "vitest"

import {
  datasetKey,
  selectPublishedDatasets,
  selectPublishedVersions,
  type Dump,
  type EsDataset,
  type EsResearch,
  type EsResearchVersion,
} from "./es"

function research(humId: string, latestVersion: string | null, status = "published"): EsResearch {
  return { humId, status, latestVersion }
}

function version(
  humId: string,
  version: string,
  datasets: { datasetId: string, version: string }[] = [],
  versionReleaseDate = "2020-01-01",
): EsResearchVersion {
  return { humId, humVersionId: `${humId}-${version}`, version, versionReleaseDate, datasets }
}

function datasetDoc(datasetId: string, docVersion: string, humId: string): EsDataset {
  return { datasetId, version: docVersion, humId }
}

function dump(
  researches: EsResearch[],
  versions: EsResearchVersion[],
  datasets: EsDataset[],
): Dump {
  const byHum = new Map(researches.map((r) => [r.humId, r]))
  return {
    research: byHum,
    ...selectPublishedVersions(byHum, versions),
    datasetsByKey: new Map(datasets.map((d) => [datasetKey(d.datasetId, d.version), d])),
  }
}

describe("selectPublishedVersions", () => {
  it("keeps versions up to and including latestVersion", () => {
    const { publishedVersions } = selectPublishedVersions(
      new Map([["hum0001", research("hum0001", "v2")]]),
      [version("hum0001", "v1"), version("hum0001", "v2"), version("hum0001", "v3")],
    )
    expect(publishedVersions.map((v) => v.version)).toEqual(["v1", "v2"])
  })

  it("publishes versions of a research whose status is draft", () => {
    const { publishedVersions } = selectPublishedVersions(
      new Map([["hum0001", research("hum0001", "v1", "draft")]]),
      [version("hum0001", "v1"), version("hum0001", "v2")],
    )
    expect(publishedVersions.map((v) => v.version)).toEqual(["v1"])
  })

  it("publishes nothing for a research that has no latest version", () => {
    const { publishedVersions } = selectPublishedVersions(
      new Map([["hum0001", research("hum0001", null)]]),
      [version("hum0001", "v1")],
    )
    expect(publishedVersions).toEqual([])
  })

  it("publishes nothing for a version whose research is absent from the dump", () => {
    const { publishedVersions } = selectPublishedVersions(new Map(), [version("hum0001", "v1")])
    expect(publishedVersions).toEqual([])
  })

  it("takes the highest published version as the latest, not the highest of all", () => {
    const { latestVersion } = selectPublishedVersions(
      new Map([["hum0001", research("hum0001", "v2")]]),
      [version("hum0001", "v10"), version("hum0001", "v2"), version("hum0001", "v1")],
    )
    expect(latestVersion.get("hum0001")?.version).toBe("v2")
  })

  it("orders versions numerically rather than by their string form", () => {
    const { publishedVersions } = selectPublishedVersions(
      new Map([["hum0001", research("hum0001", "v10")]]),
      [version("hum0001", "v10"), version("hum0001", "v9"), version("hum0001", "v1")],
    )
    expect(publishedVersions.map((v) => v.version)).toEqual(["v1", "v9", "v10"])
  })
})

describe("selectPublishedDatasets", () => {
  it("takes the version the latest published research version pins, not the highest", () => {
    const selection = selectPublishedDatasets(dump(
      [research("hum0001", "v2")],
      [
        version("hum0001", "v1", [{ datasetId: "JGAD1", version: "v9" }]),
        version("hum0001", "v2", [{ datasetId: "JGAD1", version: "v2" }]),
      ],
      [datasetDoc("JGAD1", "v9", "hum0001"), datasetDoc("JGAD1", "v2", "hum0001")],
    ))
    expect(selection.datasets.map((d) => d.doc.version)).toEqual(["v2"])
  })

  it("keeps a dataset only an older published version lists", () => {
    const selection = selectPublishedDatasets(dump(
      [research("hum0001", "v2")],
      [
        version("hum0001", "v1", [{ datasetId: "JGAD1", version: "v1" }]),
        version("hum0001", "v2", []),
      ],
      [datasetDoc("JGAD1", "v1", "hum0001")],
    ))
    expect(selection.datasets.map((d) => d.label)).toEqual(["JGAD1"])
  })

  it("ignores a dataset that only an unpublished version lists", () => {
    const selection = selectPublishedDatasets(dump(
      [research("hum0001", "v1")],
      [
        version("hum0001", "v1", []),
        version("hum0001", "v2", [{ datasetId: "JGAD1", version: "v1" }]),
      ],
      [datasetDoc("JGAD1", "v1", "hum0001")],
    ))
    expect(selection.datasets).toEqual([])
  })

  it("dates a dataset by the earliest published version that listed it", () => {
    const selection = selectPublishedDatasets(dump(
      [research("hum0001", "v2")],
      [
        version("hum0001", "v1", [{ datasetId: "JGAD1", version: "v1" }], "2015-03-01"),
        version("hum0001", "v2", [{ datasetId: "JGAD1", version: "v1" }], "2020-07-01"),
      ],
      [datasetDoc("JGAD1", "v1", "hum0001")],
    ))
    expect(selection.datasets[0]?.firstListedOn).toBe("2015-03-01")
  })

  it("falls back to the highest pinned version that has a document", () => {
    const selection = selectPublishedDatasets(dump(
      [research("hum0001", "v2")],
      [
        version("hum0001", "v1", [{ datasetId: "JGAD1", version: "v1" }]),
        version("hum0001", "v2", [{ datasetId: "JGAD1", version: "v3" }]),
      ],
      [datasetDoc("JGAD1", "v1", "hum0001")],
    ))
    expect(selection.datasets.map((d) => d.doc.version)).toEqual(["v1"])
    expect(selection.missingDocuments).toEqual([])
  })

  it("reports a pinned dataset that has no document at all", () => {
    const selection = selectPublishedDatasets(dump(
      [research("hum0001", "v1")],
      [version("hum0001", "v1", [{ datasetId: "JGAD1", version: "v1" }])],
      [],
    ))
    expect(selection.datasets).toEqual([])
    expect(selection.missingDocuments).toEqual(["JGAD1"])
  })

  it("reports a dataset listed by versions of two different research", () => {
    const selection = selectPublishedDatasets(dump(
      [research("hum0001", "v1"), research("hum0002", "v1")],
      [
        version("hum0001", "v1", [{ datasetId: "JGAD1", version: "v1" }]),
        version("hum0002", "v1", [{ datasetId: "JGAD1", version: "v1" }]),
      ],
      [datasetDoc("JGAD1", "v1", "hum0001")],
    ))
    expect(selection.sharedAcrossResearch).toEqual([
      { label: "JGAD1", humIds: ["hum0001", "hum0002"] },
    ])
    // Still assigned to exactly one research, because a dataset belongs to one.
    expect(selection.datasets.map((d) => d.humId)).toEqual(["hum0001"])
  })
})
