/**
 * CLI type definitions
 */
import type { LangType } from "./common"

/** CLI arguments for crawler commands */
export interface CrawlArgs {
  humId?: string
  lang?: LangType
  force?: boolean
  concurrency?: number
  noCache?: boolean
  verbose?: boolean
  quiet?: boolean
}

/** Result of parsing one humVersionId + lang */
export interface CrawlOneResult {
  success: boolean
  hasRelease: boolean
  error?: string
}

/** Result of normalizing one humVersionId + lang */
export interface NormalizeOneResult {
  success: boolean
  humVersionId: string
  lang: LangType
  error?: string
}

/** Result of parsing all versions for one humId */
export interface CrawlHumIdResult {
  parsed: number
  errors: number
  noRelease: number
}
