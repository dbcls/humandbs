import { describe, expect, it } from "vitest"

import { selectDrafts } from "./drafts"
import { datasetKey, type EsDataset, type EsResearch, type EsResearchVersion } from "./es"

const research = (humId: string, latestVersion: string | null): EsResearch => ({ humId, latestVersion })

const version = (
  humId: string,
  number: number,
  datasets: { datasetId: string, version: string }[] = [],
): EsResearchVersion => ({
  humId,
  humVersionId: `${humId}-v${number}`,
  version: `v${number}`,
  datasets,
})

const doc = (datasetId: string, version: string, humId: string): EsDataset => ({ datasetId, version, humId })

const index = (docs: EsDataset[]) => new Map(docs.map((d) => [datasetKey(d.datasetId, d.version), d]))

describe("selectDrafts", () => {
  it("takes the versions above the latest published one as drafts", () => {
    const selection = selectDrafts(
      new Map([["hum0001", research("hum0001", "v2")]]),
      [version("hum0001", 1), version("hum0001", 2), version("hum0001", 3)],
      new Map(),
    )

    expect(selection.drafts.map((d) => d.version.humVersionId)).toEqual(["hum0001-v3"])
    expect(selection.drafts[0]?.updatesPublished).toBe(true)
  })

  it("takes every version of a research that was never published, and reports it updates nothing", () => {
    const selection = selectDrafts(
      new Map([["hum0002", research("hum0002", null)]]),
      [version("hum0002", 1)],
      new Map(),
    )

    expect(selection.drafts.map((d) => d.version.humVersionId)).toEqual(["hum0002-v1"])
    expect(selection.drafts[0]?.updatesPublished).toBe(false)
  })

  it("leaves out a version whose research the dump does not hold", () => {
    const selection = selectDrafts(new Map(), [version("hum0003", 1)], new Map())

    expect(selection.drafts).toEqual([])
    expect(selection.orphanVersions).toEqual(["hum0003-v1"])
  })

  it("leaves out a version whose number cannot be read rather than guessing its place", () => {
    const odd = { ...version("hum0004", 1), version: "v1.1" }
    const selection = selectDrafts(new Map([["hum0004", research("hum0004", null)]]), [odd], new Map())

    expect(selection.drafts).toEqual([])
    expect(selection.unreadableVersions).toEqual(["hum0004-v1"])
  })

  it("describes each listed dataset with the document the draft pins", () => {
    const selection = selectDrafts(
      new Map([["hum0005", research("hum0005", "v1")]]),
      [version("hum0005", 2, [{ datasetId: "JGAD000001", version: "v2" }])],
      index([doc("JGAD000001", "v1", "hum0005"), doc("JGAD000001", "v2", "hum0005")]),
    )

    expect(selection.drafts[0]?.datasets).toEqual([
      { label: "JGAD000001", doc: doc("JGAD000001", "v2", "hum0005") },
    ])
  })

  it("keeps the order in which the draft lists its datasets", () => {
    const selection = selectDrafts(
      new Map([["hum0006", research("hum0006", null)]]),
      [version("hum0006", 1, [
        { datasetId: "JGAD000009", version: "v1" },
        { datasetId: "JGAD000002", version: "v1" },
      ])],
      index([doc("JGAD000009", "v1", "hum0006"), doc("JGAD000002", "v1", "hum0006")]),
    )

    expect(selection.drafts[0]?.datasets.map((d) => d.label)).toEqual(["JGAD000009", "JGAD000002"])
  })

  it("names a pinned dataset that has no document instead of dropping it silently", () => {
    const selection = selectDrafts(
      new Map([["hum0007", research("hum0007", null)]]),
      [version("hum0007", 1, [{ datasetId: "JGAD000404", version: "v1" }])],
      new Map(),
    )

    expect(selection.drafts[0]?.datasets).toEqual([])
    expect(selection.missingDocuments).toEqual([{ humVersionId: "hum0007-v1", label: "JGAD000404" }])
  })

  it("keeps only the highest when a research holds more than one version above the published one", () => {
    const selection = selectDrafts(
      new Map([["hum0008", research("hum0008", "v1")]]),
      [version("hum0008", 3), version("hum0008", 2)],
      new Map(),
    )

    expect(selection.drafts.map((d) => d.version.humVersionId)).toEqual(["hum0008-v3"])
    expect(selection.supersededDrafts).toEqual(["hum0008-v2"])
  })
})
