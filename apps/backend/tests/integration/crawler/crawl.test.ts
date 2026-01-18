/**
 * Integration tests for crawl (HTML parsing)
 *
 * Tests that all downloaded HTML files can be parsed without errors.
 * Requires HTML files to be present in crawler-results/html/ (run download-html first).
 *
 * Run with: bun test tests/integration/crawl.test.ts
 */
import { describe, it, expect } from "bun:test"
import { readdirSync, readFileSync, existsSync } from "fs"
import { join } from "path"

import { shouldSkipPage } from "@/crawler/config"
import { parseDetailPage } from "@/crawler/detail"
import { getHtmlDir } from "@/crawler/io"
import { parseReleasePage } from "@/crawler/release"

const CONCURRENCY = 32

const htmlDir = getHtmlDir()

interface ParseTask {
  file: string
  type: "detail" | "release"
}

const parseOne = (task: ParseTask): { file: string; error?: string; skipped?: boolean } => {
  const { file, type } = task
  try {
    if (type === "detail") {
      const match = file.match(/detail-(hum\d+-v\d+)-(ja|en)\.html/)
      if (!match) throw new Error(`Invalid filename: ${file}`)
      const [, humVersionId, lang] = match

      // Skip pages defined in SKIP_PAGES
      if (shouldSkipPage(humVersionId, lang as "ja" | "en")) {
        return { file, skipped: true }
      }

      const html = readFileSync(join(htmlDir, file), "utf8")
      parseDetailPage(html, humVersionId, lang as "ja" | "en")
    } else {
      const match = file.match(/release-(hum\d+-v\d+)-(ja|en)-release\.html/)
      if (!match) throw new Error(`Invalid filename: ${file}`)
      const [, humVersionId, lang] = match

      // Skip pages defined in SKIP_PAGES
      if (shouldSkipPage(humVersionId, lang as "ja" | "en")) {
        return { file, skipped: true }
      }

      const html = readFileSync(join(htmlDir, file), "utf8")
      parseReleasePage(html, humVersionId, lang as "ja" | "en")
    }

    return { file }
  } catch (e) {
    return { file, error: e instanceof Error ? e.message : String(e) }
  }
}

const runBatch = async (tasks: ParseTask[]): Promise<{ file: string; error?: string; skipped?: boolean }[]> => {
  const results: { file: string; error?: string; skipped?: boolean }[] = []

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(task => Promise.resolve(parseOne(task))),
    )
    results.push(...batchResults)
  }

  return results
}

describe("Parse all HTML files", () => {
  const htmlExists = existsSync(htmlDir)
  const files = htmlExists ? readdirSync(htmlDir) : []

  if (!htmlExists || files.length === 0) {
    it.skip("HTML files not found - run 'bun run crawler:download' first", () => { /* skip */ })
    return
  }

  const detailFiles = files.filter(f => f.startsWith("detail-") && f.endsWith(".html"))
  const releaseFiles = files.filter(f => f.startsWith("release-") && f.endsWith(".html"))

  it(`should parse all ${detailFiles.length} detail pages`, async () => {
    const tasks: ParseTask[] = detailFiles.map(file => ({ file, type: "detail" }))
    const results = await runBatch(tasks)
    const errors = results.filter(r => r.error && !r.skipped)
    const skipped = results.filter(r => r.skipped)

    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.file}: ${e.error}`).join("\n")
      throw new Error(`Failed to parse ${errors.length} detail pages:\n${errorMessages}`)
    }

    console.log(`Parsed ${results.length - skipped.length} detail pages, skipped ${skipped.length}`)
    expect(errors.length).toBe(0)
  })

  it(`should parse all ${releaseFiles.length} release pages`, async () => {
    const tasks: ParseTask[] = releaseFiles.map(file => ({ file, type: "release" }))
    const results = await runBatch(tasks)
    const errors = results.filter(r => r.error && !r.skipped)
    const skipped = results.filter(r => r.skipped)

    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.file}: ${e.error}`).join("\n")
      throw new Error(`Failed to parse ${errors.length} release pages:\n${errorMessages}`)
    }

    console.log(`Parsed ${results.length - skipped.length} release pages, skipped ${skipped.length}`)
    expect(errors.length).toBe(0)
  })
})
