import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The shape `docs/` has to keep so that a newcomer can read all of it.
 *
 * The docs hold invariants, boundaries, contracts, procedures and non-goals.
 * What the code can say for itself — sizes, lists of screens, how a thing came
 * to be — grows with every change, and a set of files nobody can read end to
 * end tells nobody anything. These limits are what stop that growth.
 */

const ROOT = join(import.meta.dirname, "..")
const DOCS = join(ROOT, "docs")

const MAX_LINES_PER_FILE = 300
const MAX_LINES_TOTAL = 2000

/**
 * Words that mark something the docs do not hold: a measurement or a pixel
 * size (the code and the rule tests own those), history, and what is not
 * decided yet.
 */
const FORBIDDEN: readonly [string, RegExp][] = [
  ["px の値", /\d(?:\.\d+)?\s*px\b/],
  ["以前は", /以前は/],
  ["実測", /実測/],
  ["TODO", /TODO/],
  ["未定", /未定/],
  ["暫定", /暫定/],
]

function docFiles(): string[] {
  return readdirSync(DOCS).filter((name) => name.endsWith(".md")).sort()
}

function read(name: string): string {
  return readFileSync(join(DOCS, name), "utf8")
}

function lineCount(text: string): number {
  return text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length
}

describe("docs", () => {
  it("どのファイルも 300 行に収まる", () => {
    const over = docFiles()
      .map((name) => [name, lineCount(read(name))] as const)
      .filter(([, lines]) => lines > MAX_LINES_PER_FILE)
    expect(over).toEqual([])
  })

  it("全部で 2,000 行に収まる", () => {
    const total = docFiles().reduce((sum, name) => sum + lineCount(read(name)), 0)
    expect(total).toBeLessThanOrEqual(MAX_LINES_TOTAL)
  })

  it("README の索引と docs のファイルが 1 対 1 に対応する", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8")
    const indexed = [...readme.matchAll(/\]\(docs\/([^)#]+\.md)\)/g)].map((match) => match[1]).sort()
    expect([...new Set(indexed)]).toEqual(docFiles())
  })

  it("px の値・経緯・未決の語を含まない", () => {
    const hits = docFiles().flatMap((name) =>
      read(name).split("\n").flatMap((line, index) =>
        FORBIDDEN
          .filter(([, pattern]) => pattern.test(line))
          .map(([what]) => `${name}:${index + 1} ${what}`),
      ),
    )
    expect(hits).toEqual([])
  })
})
