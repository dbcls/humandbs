import { describe, expect, it } from "vitest"

import { byNewest, datasetsAddedByVersion, findVersion, latestOf, type PublishedVersion } from "./versions"

function version(number: number, datasetIds: string[] = []): PublishedVersion {
  return { number, releaseDate: "2020-01-01", datasetIds }
}

describe("the published sequence", () => {
  it("reads newest first", () => {
    expect(byNewest([version(1), version(3), version(2)]).map((v) => v.number)).toEqual([3, 2, 1])
  })

  it("takes the highest number in the published set as the latest", () => {
    expect(latestOf([version(1), version(4), version(2)])?.number).toBe(4)
  })

  it("has no latest when nothing is published", () => {
    expect(latestOf([])).toBeNull()
  })

  it("addresses a version by number regardless of gaps in the numbering", () => {
    const versions = [version(1), version(5)]
    expect(findVersion(versions, 5)?.number).toBe(5)
    expect(findVersion(versions, 2)).toBeNull()
  })
})

describe("what a version added", () => {
  it("counts everything the oldest published version lists", () => {
    const added = datasetsAddedByVersion([version(1, ["a", "b"])])
    expect(added.get(1)).toEqual(["a", "b"])
  })

  it("counts only what the previous published version did not list", () => {
    const added = datasetsAddedByVersion([version(1, ["a"]), version(2, ["a", "b"])])
    expect(added.get(2)).toEqual(["b"])
  })

  it("counts nothing when the list did not change", () => {
    const added = datasetsAddedByVersion([version(1, ["a"]), version(2, ["a"])])
    expect(added.get(2)).toEqual([])
  })

  it("does not count a dataset that was dropped and listed again as newly added twice", () => {
    const added = datasetsAddedByVersion([
      version(1, ["a"]),
      version(2, []),
      version(3, ["a"]),
    ])
    expect(added.get(1)).toEqual(["a"])
    expect(added.get(2)).toEqual([])
    expect(added.get(3)).toEqual(["a"])
  })

  /**
   * A withdrawn version is not in the published set at all, so the comparison
   * skips over it. The reader is never shown a difference against a version
   * they cannot open.
   */
  it("compares against the previous published version, not the previous number", () => {
    const added = datasetsAddedByVersion([version(1, ["a"]), version(3, ["a", "b"])])
    expect(added.get(3)).toEqual(["b"])
  })

  it("keeps the order the version lists its datasets in", () => {
    const added = datasetsAddedByVersion([version(1, []), version(2, ["c", "a", "b"])])
    expect(added.get(2)).toEqual(["c", "a", "b"])
  })
})
