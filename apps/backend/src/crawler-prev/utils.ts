import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs"
import { join, dirname } from "path"

import { DETAIL_PAGE_BASE_URL } from "@/crawler/const"

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

export const fetchHtml = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Failed to fetch HTML from ${url}: ${response.status}`)
    }

    return await response.text()
  } catch (error) {
    throw new Error(`Failed to fetch HTML from ${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const fetchHtmlWithRetry = async (url: string, retries = 3, delay = 1000): Promise<string> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetchHtml(url)
    } catch (error) {
      if (attempt < retries - 1) {
        console.warn(`Attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  throw new Error(`Failed to fetch HTML from ${url} after ${retries} attempts`)
}

export const readHtml = async (url: string, fileName: string, useCache = true): Promise<string> => {
  const filePath = join(getResultsDirPath(), "html", fileName)
  const fileExists = existsSync(filePath)

  const shouldFetch = !useCache || !fileExists

  if (shouldFetch) {
    const dirPath = dirname(filePath)
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true })
    }

    const html = await fetchHtmlWithRetry(url)
    writeFileSync(filePath, html, "utf8")
    return html
  }

  return readFileSync(filePath, "utf8")
}

export const headLatestVersionNum = async (humId: string): Promise<number> => {
  const url = `${DETAIL_PAGE_BASE_URL}${humId}`
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
    })
    const redirectedUrl = response.url
    const match = redirectedUrl.match(/https:\/\/humandbs\.dbcls\.jp\/(hum\d+)-v(\d+)/)
    if (match === null) {
      throw new Error(`Failed to parse hum id and version from ${redirectedUrl}`)
    }

    const versionStr = match[2]
    const versionNum = Number(versionStr)
    if (Number.isNaN(versionNum)) {
      throw new Error(`Invalid version number: ${versionStr}`)
    }

    return versionNum
  } catch (error) {
    throw new Error(`Failed to HEAD ${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const findLatestVersionNum = async (humId: string, useCache = true): Promise<number> => {
  const htmlDir = join(getResultsDirPath(), "html")
  const v1Ja = join(htmlDir, `detail-${humId}-v1-ja.html`)
  const v1En = join(htmlDir, `detail-${humId}-v1-en.html`)
  const hasCache = existsSync(v1Ja) || existsSync(v1En)

  if (useCache && hasCache) {
    const files = readdirSync(htmlDir)
    const versionNums = files
      .filter(file => file.startsWith(`detail-${humId}-`) && file.endsWith(".html"))
      .map(file => {
        const match = file.match(/-v(\d+)-(ja|en)\.html/)
        return match ? Number(match[1]) : null
      })
      .filter((num): num is number => num !== null && !Number.isNaN(num))

    if (versionNums.length > 0) {
      return Math.max(...versionNums)
    }
  }

  return await headLatestVersionNum(humId)
}

export const extractTagsFromElement = (element: Element): string[] => {
  return Array.from(element.children).map(child => child.tagName)
}

export const sameArray = <T>(a: T[], b: T[]): boolean => {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }

  return true
}

export const cleanJapaneseText = (text: string): string => {
  return text
    .replace(/\s+/g, " ") // Replace consecutive spaces with a single space
    .replace(/([。！？])\s+/g, "$1") // Remove spaces after punctuation marks (。, !, ?, ！)
    .replace(/(\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han})\s+(\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han})/gu, "$1$2") // Remove spaces between Japanese characters (Hiragana, Katakana, Kanji)
    .trim()
}

export const insertAt = <T>(array: T[], index: number, element: T): T[] => {
  return [...array.slice(0, index), element, ...array.slice(index)]
}
