/**
 * Export menu pages to JSON
 *
 * Reads raw menu page data from Joomla DB output, cleans HTML,
 * and exports to a structured JSON file.
 *
 * Usage:
 *   cd apps/backend/joomla
 *   bun run scripts/export-menu.ts
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"

import { cleanArticleHtml, extractPlainText } from "../lib/html-cleaner"
import type { LangType, MiscPageContent, MiscPagesOutput, RawMiscPageData } from "../lib/types"
import { RawMiscPageDataArraySchema } from "../lib/types"

// Constants

const BASE_URL_JA = "https://humandbs.dbcls.jp"
const BASE_URL_EN = "https://humandbs.dbcls.jp/en"

// Utility functions

const ensureDir = (path: string): void => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

const readJson = <T>(path: string): T | null => {
  if (!existsSync(path)) return null
  const content = readFileSync(path, "utf8")
  return JSON.parse(content) as T
}

const writeJson = <T>(path: string, data: T): void => {
  const dir = dirname(path)
  ensureDir(dir)
  const content = JSON.stringify(data, null, 2)
  writeFileSync(path, content, "utf8")
}

// Functions

/**
 * Get the joomla directory path
 */
const getJoomlaDir = (): string => {
  return join(import.meta.dir, "..")
}

/**
 * Build the original URL for a menu page
 */
const buildOriginalUrl = (path: string, lang: LangType): string => {
  const baseUrl = lang === "ja" ? BASE_URL_JA : BASE_URL_EN
  return `${baseUrl}/${path}`
}

/**
 * Parse date string to YYYY-MM-DD format
 * Returns null if date is invalid or empty
 */
const parseDate = (dateStr: string | null): string | null => {
  if (!dateStr || dateStr === "0000-00-00" || dateStr === "") {
    return null
  }
  return dateStr
}

/**
 * Process a single raw menu page into MiscPageContent
 */
const processRawPage = (raw: RawMiscPageData): MiscPageContent => {
  const lang = raw.lang as LangType

  // Combine introtext and fulltext
  const rawHtml = [raw.introtext, raw.fulltext]
    .filter(Boolean)
    .join("\n")

  const contentHtml = cleanArticleHtml(rawHtml)
  const contentText = extractPlainText(rawHtml)

  return {
    path: raw.path,
    lang,
    originalUrl: buildOriginalUrl(raw.path, lang),
    title: raw.title.trim(),
    releaseDate: parseDate(raw.publish_up),
    modifiedDate: parseDate(raw.modified),
    contentHtml,
    contentText,
  }
}

/**
 * Export menu pages to JSON
 */
const exportMenuPages = (): void => {
  const joomlaDir = getJoomlaDir()
  const inputPath = join(joomlaDir, "output", "menu-pages-raw.json")
  const outputPath = join(joomlaDir, "output", "menu-pages.json")

  console.log(`Reading raw menu pages from ${inputPath}`)

  const rawData = readJson<unknown>(inputPath)
  if (!rawData) {
    console.error(`File not found: ${inputPath}`)
    console.error("Run ./scripts/export-menu-json.sh first")
    process.exit(1)
  }

  // Validate with Zod
  const parseResult = RawMiscPageDataArraySchema.safeParse(rawData)
  if (!parseResult.success) {
    console.error("Invalid raw menu pages data:", parseResult.error)
    process.exit(1)
  }

  const rawPages = parseResult.data
  console.log(`Processing ${rawPages.length} raw pages...`)

  // Process each page
  const pages: MiscPageContent[] = []
  for (const raw of rawPages) {
    try {
      const processed = processRawPage(raw)
      pages.push(processed)
    } catch (error) {
      console.error(`Failed to process page: ${raw.path} (${raw.lang})`, error)
    }
  }

  // Sort by path, then by lang (ja before en)
  pages.sort((a, b) => {
    const pathCompare = a.path.localeCompare(b.path)
    if (pathCompare !== 0) return pathCompare
    return a.lang === "ja" ? -1 : 1
  })

  // Build output
  const output: MiscPagesOutput = {
    generatedAt: new Date().toISOString(),
    totalCount: pages.length,
    pages,
  }

  // Write output
  writeJson(outputPath, output)

  console.log(`Exported ${output.totalCount} menu pages to ${outputPath}`)
}

// Main
exportMenuPages()
