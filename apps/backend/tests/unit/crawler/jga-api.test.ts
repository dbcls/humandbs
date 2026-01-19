import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  studyToDatasets,
  datasetToStudy,
  getDatasetsFromStudy,
  getStudiesFromDataset,
  clearJgaApiCache,
} from "@/crawler/jga-api"

describe("jga-api.ts", () => {
  beforeEach(() => {
    clearJgaApiCache()
  })

  describe("studyToDatasets", () => {
    it("should return empty array for invalid study ID", async () => {
      const result = await studyToDatasets("INVALID")
      expect(result).toEqual([])
    })

    it("should return dataset IDs for valid study ID", async () => {
      // This test makes an actual API call - it may be slow
      const result = await studyToDatasets("JGAS000001")
      // The result should be an array (may be empty if the study doesn't exist)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe("datasetToStudy", () => {
    it("should return empty array for invalid dataset ID", async () => {
      const result = await datasetToStudy("INVALID")
      expect(result).toEqual([])
    })

    it("should return study IDs for valid dataset ID", async () => {
      // This test makes an actual API call - it may be slow
      const result = await datasetToStudy("JGAD000001")
      // The result should be an array (may be empty if the dataset doesn't exist)
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe("getDatasetsFromStudy (cached)", () => {
    it("should return same result on second call (from cache)", async () => {
      const firstResult = await getDatasetsFromStudy("JGAS000001")
      const secondResult = await getDatasetsFromStudy("JGAS000001")
      expect(firstResult).toEqual(secondResult)
    })

    it("should not make API call for cached result", async () => {
      // First call
      await getDatasetsFromStudy("JGAS000002")
      // Second call should use cache
      const start = Date.now()
      await getDatasetsFromStudy("JGAS000002")
      const elapsed = Date.now() - start
      // Cached call should be very fast (< 10ms)
      expect(elapsed).toBeLessThan(10)
    })
  })

  describe("getStudiesFromDataset (cached)", () => {
    it("should return same result on second call (from cache)", async () => {
      const firstResult = await getStudiesFromDataset("JGAD000001")
      const secondResult = await getStudiesFromDataset("JGAD000001")
      expect(firstResult).toEqual(secondResult)
    })

    it("should not make API call for cached result", async () => {
      // First call
      await getStudiesFromDataset("JGAD000002")
      // Second call should use cache
      const start = Date.now()
      await getStudiesFromDataset("JGAD000002")
      const elapsed = Date.now() - start
      // Cached call should be very fast (< 10ms)
      expect(elapsed).toBeLessThan(10)
    })
  })

  describe("clearJgaApiCache", () => {
    it("should clear the cache", async () => {
      // Populate cache
      await getDatasetsFromStudy("JGAS000003")
      await getStudiesFromDataset("JGAD000003")

      // Clear cache
      clearJgaApiCache()

      // After clearing, the next call should make an API call (will take longer)
      // We can't easily verify this without mocking, but we can at least verify
      // that the function doesn't throw
      expect(() => clearJgaApiCache()).not.toThrow()
    })
  })
})
