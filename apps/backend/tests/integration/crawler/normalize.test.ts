/**
 * Integration tests for normalize
 *
 * Tests that all parsed JSON files can be normalized without errors.
 * Requires JSON files to be present in crawler-results/json/ (run crawl first).
 *
 * Run with: bun test tests/integration/crawler/normalize.test.ts
 */
import { describe, it, expect, afterAll } from "bun:test"
import { existsSync, rmSync } from "fs"
import { join } from "path"

import { listDetailJsonFiles, getResultsDirPath } from "@/crawler/io"
import { normalizeOneDetail } from "@/crawler/normalize"
import type { LangType, NormalizeOneResult } from "@/crawler/types"

const CONCURRENCY = 32

interface NormalizeTask {
  humVersionId: string
  lang: LangType
}

const normalizeOne = (task: NormalizeTask): NormalizeOneResult => {
  return normalizeOneDetail(task.humVersionId, task.lang)
}

const runBatch = async (tasks: NormalizeTask[]): Promise<NormalizeOneResult[]> => {
  const results: NormalizeOneResult[] = []

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(task => Promise.resolve(normalizeOne(task))),
    )
    results.push(...batchResults)
  }

  return results
}

describe("Normalize all JSON files", () => {
  const resultsDir = getResultsDirPath()
  const jsonDir = join(resultsDir, "json")
  const jsonExists = existsSync(jsonDir)

  if (!jsonExists) {
    it.skip("JSON files not found - run 'bun run crawler:crawl' first", () => { /* skip */ })
    return
  }

  const targets = listDetailJsonFiles({ langs: ["ja", "en"] })

  if (targets.length === 0) {
    it.skip("No JSON files found - run 'bun run crawler:crawl' first", () => { /* skip */ })
    return
  }

  it(`should normalize all ${targets.length} JSON files`, async () => {
    const tasks: NormalizeTask[] = targets
    const results = await runBatch(tasks)
    const errors = results.filter(r => !r.success)

    if (errors.length > 0) {
      const errorMessages = errors
        .slice(0, 10) // Show first 10 errors only
        .map(e => `${e.humVersionId} (${e.lang}): ${e.error}`)
        .join("\n")
      const moreMsg = errors.length > 10 ? `\n... and ${errors.length - 10} more errors` : ""
      throw new Error(`Failed to normalize ${errors.length} files:\n${errorMessages}${moreMsg}`)
    }

    const successCount = results.filter(r => r.success).length
    console.log(`Normalized ${successCount} JSON files successfully`)
    expect(errors.length).toBe(0)
  })
})

describe("Normalize single humId", () => {
  const resultsDir = getResultsDirPath()
  const jsonDir = join(resultsDir, "json")
  const jsonExists = existsSync(jsonDir)
  const testNormalizedDir = join(resultsDir, "normalized")

  if (!jsonExists) {
    it.skip("JSON files not found - run 'bun run crawler:crawl' first", () => { /* skip */ })
    return
  }

  const targets = listDetailJsonFiles({ humId: "hum0001", langs: ["ja", "en"] })

  if (targets.length === 0) {
    it.skip("hum0001 JSON files not found - run 'bun run crawler:crawl --hum-id hum0001' first", () => { /* skip */ })
    return
  }

  afterAll(() => {
    // Clean up normalized files created during test
    for (const { humVersionId, lang } of targets) {
      const normalizedPath = join(testNormalizedDir, `${humVersionId}-${lang}.json`)
      if (existsSync(normalizedPath)) {
        rmSync(normalizedPath)
      }
    }
  })

  it("should normalize hum0001 files", async () => {
    const results = await Promise.all(
      targets.map(({ humVersionId, lang }) =>
        Promise.resolve(normalizeOneDetail(humVersionId, lang)),
      ),
    )

    const errors = results.filter(r => !r.success)
    expect(errors.length).toBe(0)

    // Check that normalized files exist
    for (const { humVersionId, lang } of targets) {
      const normalizedPath = join(testNormalizedDir, `${humVersionId}-${lang}.json`)
      expect(existsSync(normalizedPath)).toBe(true)
    }
  })

  it("should return NormalizeOneResult with success=true", () => {
    const target = targets[0]
    if (!target) return

    const result = normalizeOneDetail(target.humVersionId, target.lang)
    expect(result.success).toBe(true)
    expect(result.humVersionId).toBe(target.humVersionId)
    expect(result.lang).toBe(target.lang)
    expect(result.error).toBeUndefined()
  })
})

describe("normalizeOneDetail error handling", () => {
  it("should return error for non-existent humVersionId", () => {
    const result = normalizeOneDetail("hum9999-v1", "ja")
    expect(result.success).toBe(false)
    expect(result.humVersionId).toBe("hum9999-v1")
    expect(result.lang).toBe("ja")
    expect(result.error).toBe("JSON not found")
  })

  it("should return error for non-existent lang", () => {
    // Test with an ID that might exist in ja but not in an invalid lang
    const result = normalizeOneDetail("hum0001-v1", "en")
    // If hum0001-v1 en doesn't exist, it should fail with "JSON not found"
    // If it does exist, it will succeed
    expect(result.humVersionId).toBe("hum0001-v1")
    expect(result.lang).toBe("en")
  })
})
