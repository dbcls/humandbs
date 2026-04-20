/**
 * Export news articles to JSON
 *
 * Reads raw news article data from Joomla DB output, cleans HTML,
 * and exports to a structured JSON file aligned with the frontend
 * newsItemCreateSchema (lang + title + publishedAt + content).
 *
 * Usage:
 *   cd apps/backend/joomla
 *   bun run scripts/export-news.ts
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"

import { cleanArticleHtml, extractPlainText } from "../lib/html-cleaner"
import type { LangType, NewsPageContent, NewsPagesOutput, RawNewsPageData } from "../lib/types"
import { RawNewsPageDataArraySchema } from "../lib/types"

const CATID_JA = 19
const CATID_EN = 21

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

const getJoomlaDir = (): string => {
  return join(import.meta.dir, "..")
}

const langFromCatid = (catid: number): LangType => {
  if (catid === CATID_JA) return "ja"
  if (catid === CATID_EN) return "en"
  throw new Error(`Unknown catid for news: ${catid}`)
}

const parseDate = (dateStr: string | null): string | null => {
  if (!dateStr || dateStr === "0000-00-00" || dateStr === "") {
    return null
  }
  return dateStr
}

const processRawPage = (raw: RawNewsPageData): NewsPageContent => {
  const lang = langFromCatid(raw.catid)

  const rawHtml = [raw.introtext, raw.fulltext]
    .filter(Boolean)
    .join("\n")

  const contentHtml = cleanArticleHtml(rawHtml)
  const contentText = extractPlainText(rawHtml)

  return {
    lang,
    title: raw.title.trim(),
    publishedAt: parseDate(raw.publish_up),
    modifiedDate: parseDate(raw.modified),
    contentHtml,
    contentText,
  }
}

const exportNewsPages = (): void => {
  const joomlaDir = getJoomlaDir()
  const inputPath = join(joomlaDir, "output", "news-pages-raw.json")
  const outputPath = join(joomlaDir, "output", "news-pages.json")

  console.log(`Reading raw news articles from ${inputPath}`)

  const rawData = readJson<unknown>(inputPath)
  if (!rawData) {
    console.error(`File not found: ${inputPath}`)
    console.error("Run ./scripts/export-news-json.sh first")
    process.exit(1)
  }

  const parseResult = RawNewsPageDataArraySchema.safeParse(rawData)
  if (!parseResult.success) {
    console.error("Invalid raw news articles data:", parseResult.error)
    process.exit(1)
  }

  const rawPages = parseResult.data
  console.log(`Processing ${rawPages.length} raw articles...`)

  const pages: NewsPageContent[] = []
  for (const raw of rawPages) {
    try {
      pages.push(processRawPage(raw))
    } catch (error) {
      console.error(`Failed to process article (catid=${raw.catid}, title=${raw.title})`, error)
    }
  }

  // Sort: newest first, tie-break by title to keep output deterministic
  pages.sort((a, b) => {
    const dateA = a.publishedAt ?? ""
    const dateB = b.publishedAt ?? ""
    if (dateA !== dateB) return dateA < dateB ? 1 : -1
    return a.title.localeCompare(b.title)
  })

  const output: NewsPagesOutput = {
    generatedAt: new Date().toISOString(),
    totalCount: pages.length,
    pages,
  }

  writeJson(outputPath, output)

  const jaCount = pages.filter((p) => p.lang === "ja").length
  const enCount = pages.filter((p) => p.lang === "en").length
  console.log(`Exported ${output.totalCount} news articles (ja=${jaCount}, en=${enCount}) to ${outputPath}`)
}

exportNewsPages()
