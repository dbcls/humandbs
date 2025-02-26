import { existsSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"

export const getCacheDirPath = (): string => {
  let currentDir = __dirname
  while (!existsSync(join(currentDir, "package.json"))) {
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      throw new Error("Failed to find package.json")
    }
    currentDir = parentDir
  }

  return join(currentDir, "tests", "html-cache")
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

export const fetchHtmlUsingCache = async (url: string, cacheDir: string, fileName: string): Promise<string> => {
  const filePath = join(cacheDir, fileName)
  if (existsSync(filePath)) {
    return readFileSync(filePath, "utf8")
  }

  const html = await fetchHtml(url)
  writeFileSync(filePath, html, "utf8")
  return html
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
