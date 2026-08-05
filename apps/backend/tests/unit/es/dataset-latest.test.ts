/**
 * Latest-version flag tests
 *
 * The flags decide which Dataset docs search and aggregation see, so the
 * invariants are checked with PBT on top of the boundary cases.
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { computeDatasetLatestFlags, groupByDatasetId, pickLatestVersions } from "@/es/dataset-latest"
import type { DatasetVersionRef } from "@/es/dataset-latest"

const HUM = "hum0001"

const docs = (...versions: number[]): DatasetVersionRef[] =>
  versions.map(n => ({ version: `v${n}`, humId: HUM, humVersionId: `${HUM}-v${n}` }))

/** `bornAt[i]` is the hum version that produced the i-th dataset version. */
const docsBornAt = (...bornAt: number[]): DatasetVersionRef[] =>
  bornAt.map((humVer, i) => ({
    version: `v${i + 1}`,
    humId: HUM,
    humVersionId: `${HUM}-v${humVer}`,
  }))

const ceiling = (latestVersion: string | null) => new Map([[HUM, latestVersion]])

const flagsOf = (refs: DatasetVersionRef[], latestVersion: string | null) =>
  Object.fromEntries(
    [...computeDatasetLatestFlags(refs, ceiling(latestVersion))]
      .map(([version, f]) => [version, [f.isLatest, f.isLatestPublished]]),
  )

describe("pickLatestVersions", () => {
  it("marks the only version as both latest and latest published once the parent is published", () => {
    expect(pickLatestVersions(docs(1), ceiling("v1")))
      .toEqual({ latestVersion: "v1", latestPublishedVersion: "v1" })
  })

  it("leaves latestPublished null while the parent Research has never been published", () => {
    expect(pickLatestVersions(docs(1), ceiling(null)))
      .toEqual({ latestVersion: "v1", latestPublishedVersion: null })
  })

  it("splits latest and latestPublished during a draft cycle that bumped the dataset", () => {
    // v1 born on hum-v1 (published), v2 born on hum-v2 (still a draft).
    expect(pickLatestVersions(docsBornAt(1, 2), ceiling("v1")))
      .toEqual({ latestVersion: "v2", latestPublishedVersion: "v1" })
  })

  it("moves latestPublished up to the newly published version after approve", () => {
    expect(pickLatestVersions(docsBornAt(1, 2), ceiling("v2")))
      .toEqual({ latestVersion: "v2", latestPublishedVersion: "v2" })
  })

  it("keeps latestPublished below an orphaned doc left above the published ceiling", () => {
    // v2 was bumped on hum-v5, which was never approved; the parent is at v3.
    expect(pickLatestVersions(docsBornAt(1, 5), ceiling("v3")))
      .toEqual({ latestVersion: "v2", latestPublishedVersion: "v1" })
  })

  it("orders by version number, not lexicographically", () => {
    expect(pickLatestVersions(docs(9, 10), ceiling("v10")))
      .toEqual({ latestVersion: "v10", latestPublishedVersion: "v10" })
  })

  it("returns nulls for an empty doc set", () => {
    expect(pickLatestVersions([], ceiling("v1")))
      .toEqual({ latestVersion: null, latestPublishedVersion: null })
  })

  it("skips versions that cannot be ordered instead of throwing", () => {
    const malformed: DatasetVersionRef[] = [
      { version: "draft", humId: HUM, humVersionId: `${HUM}-v1` },
      ...docs(1),
    ]
    expect(pickLatestVersions(malformed, ceiling("v1")))
      .toEqual({ latestVersion: "v1", latestPublishedVersion: "v1" })
  })

  it("reads the ceiling of each doc's own parent", () => {
    const refs: DatasetVersionRef[] = [
      { version: "v1", humId: "hum0001", humVersionId: "hum0001-v1" },
      { version: "v2", humId: "hum0002", humVersionId: "hum0002-v9" },
    ]
    const ceilings = new Map([["hum0001", "v1"], ["hum0002", "v1"]])
    expect(pickLatestVersions(refs, ceilings))
      .toEqual({ latestVersion: "v2", latestPublishedVersion: "v1" })
  })
})

describe("computeDatasetLatestFlags", () => {
  it("flags the published version for public and the draft version as latest", () => {
    expect(flagsOf(docsBornAt(1, 2), "v1")).toEqual({
      v1: [false, true],
      v2: [true, false],
    })
  })

  it("flags no published version while the parent Research is unpublished", () => {
    expect(flagsOf(docsBornAt(1, 2), null)).toEqual({
      v1: [false, false],
      v2: [true, false],
    })
  })

  it("clears both flags on superseded versions after approve", () => {
    expect(flagsOf(docsBornAt(1, 2, 3), "v3")).toEqual({
      v1: [false, false],
      v2: [false, false],
      v3: [true, true],
    })
  })
})

describe("groupByDatasetId", () => {
  it("keeps every doc of a datasetId together", () => {
    const rows = [
      { datasetId: "JGAD1", version: "v1" },
      { datasetId: "JGAD2", version: "v1" },
      { datasetId: "JGAD1", version: "v2" },
    ]
    const groups = groupByDatasetId(rows)
    expect(groups.get("JGAD1")).toEqual([rows[0], rows[2]])
    expect(groups.get("JGAD2")).toEqual([rows[1]])
  })
})

describe("latest-version flag invariants", () => {
  /** Distinct dataset versions, each born on an arbitrary hum version. */
  const refsArb = fc.uniqueArray(
    fc.record({ version: fc.integer({ min: 1, max: 40 }), bornAt: fc.integer({ min: 1, max: 40 }) }),
    { minLength: 1, maxLength: 8, selector: r => r.version },
  ).map(rows => rows.map(r => ({
    version: `v${r.version}`,
    humId: HUM,
    humVersionId: `${HUM}-v${r.bornAt}`,
  })))

  const ceilingArb = fc.option(fc.integer({ min: 1, max: 40 }).map(n => `v${n}`), { nil: null })

  const num = (v: string) => parseInt(v.slice(1), 10)

  it("marks exactly one version as latest", () => {
    fc.assert(fc.property(refsArb, ceilingArb, (refs, latestVersion) => {
      const flags = [...computeDatasetLatestFlags(refs, ceiling(latestVersion)).values()]
      return flags.filter(f => f.isLatest).length === 1
    }))
  })

  it("marks at most one version as latest published", () => {
    fc.assert(fc.property(refsArb, ceilingArb, (refs, latestVersion) => {
      const flags = [...computeDatasetLatestFlags(refs, ceiling(latestVersion)).values()]
      return flags.filter(f => f.isLatestPublished).length <= 1
    }))
  })

  it("never marks a version born above the published ceiling as latest published", () => {
    fc.assert(fc.property(refsArb, ceilingArb, (refs, latestVersion) => {
      const { latestPublishedVersion } = pickLatestVersions(refs, ceiling(latestVersion))
      if (latestPublishedVersion === null) return true
      const bornAt = refs.find(r => r.version === latestPublishedVersion)!.humVersionId
      return latestVersion !== null && num(bornAt.split("-")[1]) <= num(latestVersion)
    }))
  })

  it("marks a latest published version whenever any version is at or below the ceiling", () => {
    fc.assert(fc.property(refsArb, ceilingArb, (refs, latestVersion) => {
      const anyPublished = latestVersion !== null &&
        refs.some(r => num(r.humVersionId.split("-")[1]) <= num(latestVersion))
      const { latestPublishedVersion } = pickLatestVersions(refs, ceiling(latestVersion))
      return anyPublished === (latestPublishedVersion !== null)
    }))
  })

  it("never puts the latest published version above the latest version", () => {
    fc.assert(fc.property(refsArb, ceilingArb, (refs, latestVersion) => {
      const { latestVersion: latest, latestPublishedVersion } = pickLatestVersions(refs, ceiling(latestVersion))
      if (latestPublishedVersion === null) return true
      return num(latestPublishedVersion) <= num(latest!)
    }))
  })

  it("marks no published version when the parent Research has none", () => {
    fc.assert(fc.property(refsArb, (refs) => {
      const flags = [...computeDatasetLatestFlags(refs, ceiling(null)).values()]
      return flags.every(f => !f.isLatestPublished)
    }))
  })
})
