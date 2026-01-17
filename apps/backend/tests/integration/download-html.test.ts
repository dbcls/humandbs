/**
 * Integration tests for download-html CLI
 *
 * These tests actually execute the CLI and verify the results.
 * They require network access and take longer than unit tests.
 *
 * Run with: bun test tests/integration/
 */
import { $ } from "bun"
import { describe, expect, it, beforeAll, afterAll } from "bun:test"
import { existsSync, mkdirSync, rmSync, readdirSync } from "fs"

const TEST_TMP_DIR = "/tmp/humandbs-test-integration"

describe("download-html CLI (integration)", () => {
  beforeAll(() => {
    // Clean up and create test directory
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true })
    }
    mkdirSync(TEST_TMP_DIR, { recursive: true })
  })

  afterAll(() => {
    // Clean up test directory
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true })
    }
  })

  it("should show help with --help flag", async () => {
    const result = await $`bun run src/crawler/download-html.ts --help`.text()

    expect(result).toContain("--hum-id")
    expect(result).toContain("--lang")
    expect(result).toContain("--force")
    expect(result).toContain("--concurrency")
  })

  it("should download HTML for a single humId", async () => {
    // This test actually downloads from the network
    const result = await $`bun run src/crawler/download-html.ts --hum-id hum0001`.text()

    expect(result).toContain("Downloading HTML")
    expect(result).toContain("Progress:")
    expect(result).toContain("Done:")
  })

  it("should create HTML files in crawler-results/html/", async () => {
    // Check that files were created (from previous test)
    const htmlDir = "crawler-results/html"
    expect(existsSync(htmlDir)).toBe(true)

    const files = readdirSync(htmlDir)
    const hum0001Files = files.filter(f => f.includes("hum0001"))

    expect(hum0001Files.length).toBeGreaterThan(0)
    expect(hum0001Files.some(f => f.startsWith("detail-hum0001"))).toBe(true)
  })

  it("should download both ja and en versions", async () => {
    const htmlDir = "crawler-results/html"
    const files = readdirSync(htmlDir)

    const jaFiles = files.filter(f => f.includes("hum0001") && f.includes("-ja.html"))
    const enFiles = files.filter(f => f.includes("hum0001") && f.includes("-en.html"))

    expect(jaFiles.length).toBeGreaterThan(0)
    expect(enFiles.length).toBeGreaterThan(0)
  })

  it("should respect --lang option", async () => {
    // Download only Japanese version for hum0001 (already cached, should be fast)
    const result = await $`bun run src/crawler/download-html.ts --hum-id hum0001 --lang ja`.text()

    expect(result).toContain("langs: ja")
  }, 30000)

  it("should skip pages defined in SKIP_PAGES", async () => {
    // hum0003-v1 en should be skipped
    await $`bun run src/crawler/download-html.ts --hum-id hum0003`.text()

    const htmlDir = "crawler-results/html"
    const files = readdirSync(htmlDir)

    // Should have ja version
    const hum0003JaFiles = files.filter(f => f.includes("hum0003") && f.includes("-ja.html"))
    expect(hum0003JaFiles.length).toBeGreaterThan(0)

    // Should NOT have en version for v1 (it's in SKIP_PAGES)
    const hum0003v1EnFiles = files.filter(f => f === "detail-hum0003-v1-en.html")
    expect(hum0003v1EnFiles.length).toBe(0)
  })

  it("should use cache by default", async () => {
    // First download (warm up cache)
    await $`bun run src/crawler/download-html.ts --hum-id hum0001`.text()

    // Second download (should use cache)
    const result2 = await $`bun run src/crawler/download-html.ts --hum-id hum0001`.text()

    expect(result2).toContain("Cache: enabled")
  })

  it("should re-download with --force flag", async () => {
    const result = await $`bun run src/crawler/download-html.ts --hum-id hum0001 --force`.text()

    expect(result).toContain("Cache: disabled")
  })
})
