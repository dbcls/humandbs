import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs"
import { join, dirname } from "path"

import type { LangType } from "@/crawler/types"

export const DETAIL_PAGE_BASE_URL = "https://humandbs.dbcls.jp/"
const VERSION_RE = /https:\/\/humandbs\.dbcls\.jp\/(hum\d+)-v(\d+)(?:\/)?$/

/* ================================
 * Path utilities
 * ================================ */

export const getResultsDirPath = (): string => {
  let currentDir = __dirname
  while (!existsSync(join(currentDir, "package.json"))) {
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error("Failed to find package.json")
    }
    currentDir = parentDir
  }
  return join(currentDir, "crawler-results")
}

export const ensureDir = (p: string): void => {
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true })
  }
}

export const getHtmlDir = (): string => {
  const p = join(getResultsDirPath(), "html")
  ensureDir(p)
  return p
}

export const getDetailJsonDir = (): string => {
  const p = join(getResultsDirPath(), "detail-json")
  ensureDir(p)
  return p
}

export const detailJsonPath = (
  humVersionId: string,
  lang: LangType,
): string => {
  return join(getDetailJsonDir(), `${humVersionId}-${lang}.json`)
}

export const normalizedDetailJsonPath = (
  humVersionId: string,
  lang: LangType,
): string => {
  return join(getResultsDirPath(), "detail-json-normalized", `${humVersionId}-${lang}.json`)
}

/* ================================
 * URL generators
 * ================================ */

export const genDetailUrl = (
  humVersionId: string,
  lang: LangType,
): string => {
  return lang === "ja"
    ? `${DETAIL_PAGE_BASE_URL}${humVersionId}`
    : `${DETAIL_PAGE_BASE_URL}en/${humVersionId}`
}

export const genReleaseUrl = (
  humVersionId: string,
  lang: LangType,
): string => {
  let url = lang === "ja"
    ? `${DETAIL_PAGE_BASE_URL}${humVersionId}-release`
    : `${DETAIL_PAGE_BASE_URL}en/${humVersionId}-release`

  if (humVersionId === "hum0329-v1" && lang === "ja") {
    url = `${DETAIL_PAGE_BASE_URL}${humVersionId}-release-note`
  }

  return url
}

/* ================================
   * Fetch & cache
   * ================================ */

const fetchHtml = async (url: string): Promise<string> => {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok) {
    throw new Error(`Failed to fetch HTML: ${url} (${res.status})`)
  }
  return await res.text()
}

const fetchHtmlWithRetry = async (
  url: string,
  retries = 3,
  delayMs = 1000,
): Promise<string> => {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchHtml(url)
    } catch (e) {
      lastErr = e
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw lastErr
}

export const readHtml = async (
  url: string,
  cacheFileName: string,
  useCache = true,
): Promise<string> => {
  const filePath = join(getHtmlDir(), cacheFileName)
  if (!useCache || !existsSync(filePath)) {
    const html = await fetchHtmlWithRetry(url)
    writeFileSync(filePath, html, "utf8")
    return html
  }
  return readFileSync(filePath, "utf8")
}

/* ================================
   * Version resolution
   * ================================ */

const parseVersionFromUrl = (url: string): number => {
  const m = url.match(VERSION_RE)
  if (!m) throw new Error(`Cannot parse version from ${url}`)
  return Number(m[2])
}

export const headLatestVersionNum = async (
  humId: string,
  maxVersion = 50,
): Promise<number> => {
  const base = `${DETAIL_PAGE_BASE_URL}${humId}`
  try {
    const res = await fetch(base, { method: "HEAD", redirect: "follow" })
    if (res.ok) return parseVersionFromUrl(res.url)
  } catch {
    /* fallback */
  }

  for (let v = 1; v <= maxVersion; v++) {
    const res = await fetch(`${DETAIL_PAGE_BASE_URL}${humId}-v${v}`, {
      method: "HEAD",
      redirect: "follow",
    })
    if (res.ok) return v
  }
  throw new Error(`Cannot resolve latest version for ${humId}`)
}

export const findLatestVersionNum = async (
  humId: string,
  useCache = true,
): Promise<number> => {
  if (useCache) {
    const dir = getHtmlDir()
    const nums = readdirSync(dir)
      .map(f => f.match(new RegExp(`detail-${humId}-v(\\d+)-(ja|en)\\.html`)))
      .filter(Boolean)
      .map(m => Number(m![1]))
    if (nums.length > 0) return Math.max(...nums)
  }
  return headLatestVersionNum(humId)
}

/* ================================
   * Read helpers
   * ================================ */

export const listDetailJsonFiles = (opts: {
  humId?: string
  langs: LangType[]
}): { humVersionId: string; lang: LangType }[] => {
  const dir = join(getResultsDirPath(), "detail-json")
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const m = f.match(/^(hum\d+-v\d+)-(ja|en)\.json$/)
      if (!m) return null
      return {
        humVersionId: m[1],
        lang: m[2] as LangType,
      }
    })
    .filter(Boolean)
    .filter(e => opts.humId ? e!.humVersionId.startsWith(opts.humId) : true)
    .filter(e => opts.langs.includes(e!.lang)) as { humVersionId: string; lang: LangType }[]
}

export const readDetailJson = (
  humVersionId: string,
  lang: LangType,
): unknown | null => {
  const p = detailJsonPath(humVersionId, lang)
  if (!existsSync(p)) return null
  const content = readFileSync(p, "utf8")
  return JSON.parse(content)
}

export const readNormalizedDetailJson = (
  humVersionId: string,
  lang: LangType,
): unknown | null => {
  const p = normalizedDetailJsonPath(humVersionId, lang)
  if (!existsSync(p)) return null
  const content = readFileSync(p, "utf8")
  return JSON.parse(content)
}

/* ================================
   * Write helpers
   * ================================ */

export const writeDetailJson = (
  humVersionId: string,
  lang: LangType,
  data: unknown,
): void => {
  const dir = join(getResultsDirPath(), "detail-json")
  ensureDir(dir)

  writeFileSync(
    detailJsonPath(humVersionId, lang),
    JSON.stringify(data, null, 2),
    "utf8",
  )
}

export const writeNormalizedDetailJson = (
  humVersionId: string,
  lang: LangType,
  data: unknown,
): void => {
  const dir = join(getResultsDirPath(), "detail-json-normalized")
  ensureDir(dir)

  writeFileSync(
    normalizedDetailJsonPath(humVersionId, lang),
    JSON.stringify(data, null, 2),
    "utf8",
  )
}
