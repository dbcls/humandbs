import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { byNewest, datasetsAddedByVersion, latestOf, type PublishedVersion } from "./versions"

const datasetId = fc.constantFrom("a", "b", "c", "d", "e")

/** A published set: distinct numbers, arbitrary gaps, arbitrary order. */
const publishedSet = fc
  .uniqueArray(fc.integer({ min: 1, max: 40 }), { minLength: 1, maxLength: 8 })
  .chain((numbers) => fc.tuple(...numbers.map((number) =>
    fc.uniqueArray(datasetId, { maxLength: 5 })
      .map((datasetIds): PublishedVersion => ({ number, releaseDate: "2020-01-01", datasetIds })),
  )))

describe("what a version added", () => {
  it("is a subset of what that version lists", () => {
    fc.assert(fc.property(publishedSet, (versions) => {
      const added = datasetsAddedByVersion(versions)
      for (const version of versions) {
        const listed = new Set(version.datasetIds)
        expect((added.get(version.number) ?? []).every((id) => listed.has(id))).toBe(true)
      }
    }))
  })

  it("never contains anything the previous published version already listed", () => {
    fc.assert(fc.property(publishedSet, (versions) => {
      const ordered = byNewest(versions)
      const added = datasetsAddedByVersion(versions)
      ordered.forEach((version, index) => {
        const previous = new Set(ordered[index + 1]?.datasetIds ?? [])
        expect((added.get(version.number) ?? []).some((id) => previous.has(id))).toBe(false)
      })
    }))
  })

  it("does not depend on the order the published set arrives in", () => {
    fc.assert(fc.property(publishedSet, (versions) => {
      const forwards = datasetsAddedByVersion(versions)
      const backwards = datasetsAddedByVersion([...versions].reverse())
      expect([...backwards.entries()].sort()).toEqual([...forwards.entries()].sort())
    }))
  })

  it("names every published version and nothing else", () => {
    fc.assert(fc.property(publishedSet, (versions) => {
      const added = datasetsAddedByVersion(versions)
      expect([...added.keys()].sort()).toEqual(versions.map((v) => v.number).sort())
    }))
  })
})

describe("the latest published version", () => {
  it("is in the published set and no version in it is higher", () => {
    fc.assert(fc.property(publishedSet, (versions) => {
      const latest = latestOf(versions)
      expect(latest).not.toBeNull()
      expect(versions).toContain(latest)
      expect(versions.every((version) => version.number <= (latest?.number ?? 0))).toBe(true)
    }))
  })
})
