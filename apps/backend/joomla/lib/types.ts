/**
 * Misc page type definitions
 */
import { z } from "zod"

/** Language type */
export type LangType = "ja" | "en"

/** Content of a single misc page */
export interface MiscPageContent {
  path: string
  lang: LangType
  originalUrl: string
  title: string
  releaseDate: string | null
  modifiedDate: string | null
  contentHtml: string
  contentText: string
}

/** Output format for misc pages JSON */
export interface MiscPagesOutput {
  generatedAt: string
  totalCount: number
  pages: MiscPageContent[]
}

/** Raw data from DB query (before processing) */
export interface RawMiscPageData {
  path: string
  lang: string
  title: string
  introtext: string
  fulltext: string
  publish_up: string | null
  modified: string | null
}

// Zod schemas for validation

export const RawMiscPageDataSchema = z.object({
  path: z.string(),
  lang: z.string(),
  title: z.string(),
  introtext: z.string(),
  fulltext: z.string(),
  publish_up: z.string().nullable(),
  modified: z.string().nullable(),
})

export const RawMiscPageDataArraySchema = z.array(RawMiscPageDataSchema)

/** Content of a single news page */
export interface NewsPageContent {
  lang: LangType
  title: string
  publishedAt: string | null
  modifiedDate: string | null
  contentHtml: string
  contentText: string
}

/** Output format for news pages JSON */
export interface NewsPagesOutput {
  generatedAt: string
  totalCount: number
  pages: NewsPageContent[]
}

/** Raw data from DB query (before processing) */
export interface RawNewsPageData {
  catid: number
  title: string
  introtext: string
  fulltext: string
  publish_up: string | null
  modified: string | null
}

export const RawNewsPageDataSchema = z.object({
  catid: z.number(),
  title: z.string(),
  introtext: z.string(),
  fulltext: z.string(),
  publish_up: z.string().nullable(),
  modified: z.string().nullable(),
})

export const RawNewsPageDataArraySchema = z.array(RawNewsPageDataSchema)
