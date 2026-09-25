import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * A comment states the constraint it cares about itself and is self-contained —
 * it does not send the reader to a doc for the meaning. A pointer into the
 * doc tree breaks the moment that tree is reorganized, silently, since
 * nothing ties the comment to the section it named.
 */

const ROOT = join(import.meta.dirname, "..")

const SCAN_DIRS = ["app", "scripts", "tests", "docker", "migration", "assistant-api/src"]
const SKIP_DIR_NAMES = new Set(["node_modules", "__pycache__", "dist", "build", "input"])
const SOURCE_EXTENSION = /\.(ts|tsx|js|jsx|py|sh|yml|yaml|conf|css)$/

function isRootConfigFile(name: string): boolean {
  return SOURCE_EXTENSION.test(name) || name === "Dockerfile" || name.startsWith("env.")
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || SKIP_DIR_NAMES.has(entry.name)) return []
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return SOURCE_EXTENSION.test(entry.name) ? [full] : []
  })
}

function filesToScan(): string[] {
  const nested = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
  const rootLevel = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isRootConfigFile(entry.name))
    .map((entry) => join(ROOT, entry.name))
  return [...nested, ...rootLevel]
}

/** What a doc-file citation looks like, wherever it sits in a line. */
const DOC_CITATION = /docs\/[a-z][a-z-]*\.md/

/** `file:line` pairs allowed to keep a citation. None are needed today. */
const ALLOWED = new Set<string>([])

describe("comments", () => {
  it("docs を参照しない", () => {
    const hits = filesToScan().flatMap((full) => {
      const rel = relative(ROOT, full)
      return readFileSync(full, "utf8")
        .split("\n")
        .flatMap((line, index) => {
          if (!DOC_CITATION.test(line)) return []
          const at = `${rel}:${index + 1}`
          return ALLOWED.has(at) ? [] : [`${at}: ${line.trim()}`]
        })
    })
    expect(hits).toEqual([])
  })
})
