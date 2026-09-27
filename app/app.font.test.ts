import { readdir, readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Every page is set in one typeface that the site serves itself, so that a
 * reader on a Mac, on Windows and on Linux sees the same glyphs.
 *
 * The family is read out of `app.css` and the font rules out of the package
 * it imports, rather than either being repeated here: a family name that the
 * package does not declare fails nothing in the browser — the page falls back
 * to whatever the system has, without a warning — so this is the only place
 * that mismatch is caught.
 */

const ROOT = import.meta.dirname
const STYLESHEET_PATH = path.join(ROOT, "app.css")

interface FontRule {
  family: string
  weights: [number, number]
  urls: string[]
}

/** The packages `app.css` imports besides Tailwind itself. */
function importedPackages(stylesheet: string): string[] {
  return [...stylesheet.matchAll(/^@import\s+"([^"]+)";/gm)]
    .map((match) => match[1] ?? "")
    .filter((specifier) => specifier !== "tailwindcss")
}

/** The families `--font-sans` lists, in order, without their quotes. */
function sansFamilies(stylesheet: string): string[] {
  const value = /--font-sans:\s*([^;]+);/.exec(stylesheet)?.[1] ?? ""
  return value.split(",").map((family) => family.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
}

function fontRules(css: string): FontRule[] {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => {
    const body = match[1] ?? ""
    const family = /font-family:\s*['"]?([^'";]+)['"]?;/.exec(body)?.[1] ?? ""
    const weight = /font-weight:\s*(\d+)(?:\s+(\d+))?;/.exec(body)
    const low = Number(weight?.[1] ?? Number.NaN)
    const high = Number(weight?.[2] ?? low)
    const urls = [...body.matchAll(/url\(([^)]+)\)/g)].map((url) => (url[1] ?? "").replace(/^["']|["']$/g, ""))
    return { family, weights: [low, high], urls }
  })
}

async function packageRules(stylesheet: string): Promise<FontRule[]> {
  const require = createRequire(STYLESHEET_PATH)
  const sheets = await Promise.all(importedPackages(stylesheet).map((specifier) => readFile(require.resolve(specifier), "utf8")))
  return sheets.flatMap(fontRules)
}

async function sourceFiles(dir: string): Promise<{ name: string, text: string }[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const wanted = entries.filter((entry) => entry.isFile()
    && /\.(ts|tsx|css)$/.test(entry.name)
    && !entry.name.includes(".test."))
  return Promise.all(wanted.map(async (entry) => {
    const file = path.join(entry.parentPath, entry.name)
    return { name: path.relative(ROOT, file), text: await readFile(file, "utf8") }
  }))
}

const WEIGHT_CLASSES: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
}

/**
 * The weights the parts set, by class and by style. `<strong>` and `<b>` are
 * drawn one step bolder than the text around them, which is 700 on body text.
 */
function weightsSet(files: { text: string }[]): number[] {
  const weights = new Set([400, 700])
  for (const { text } of files) {
    for (const match of text.matchAll(/(?<![\w-])font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?![\w-])/g)) {
      weights.add(WEIGHT_CLASSES[match[1] ?? ""] ?? Number.NaN)
    }
    for (const match of text.matchAll(/font-?[wW]eight:\s*["']?(\d+)/g)) weights.add(Number(match[1]))
  }
  return [...weights].sort((a, b) => a - b)
}

describe("the typeface", async () => {
  const stylesheet = await readFile(STYLESHEET_PATH, "utf8")
  const rules = await packageRules(stylesheet)
  const families = sansFamilies(stylesheet)
  const sources = await sourceFiles(ROOT)

  it("is imported from a package the stylesheet names", () => {
    expect(importedPackages(stylesheet)).toEqual(["@fontsource-variable/noto-sans-jp"])
    expect(rules.length).toBeGreaterThan(0)
  })

  it("is first in the sans stack, under the family name its package declares", () => {
    expect(families[0]).toBe("Noto Sans JP Variable")
    expect(new Set(rules.map((rule) => rule.family))).toEqual(new Set([families[0]]))
  })

  it("falls back to the system's sans-serif while the file is on its way", () => {
    expect(families.slice(1)).toContain("system-ui")
    expect(families).toContain("sans-serif")
  })

  it("covers every weight the parts set, in every range it is split into", () => {
    const weights = weightsSet(sources)
    for (const rule of rules) {
      const [low, high] = rule.weights
      expect(weights.filter((weight) => weight < low || weight > high), `${rule.urls.join(", ")} covers ${low}-${high}`).toEqual([])
    }
  })

  it("is served from the site's own origin, with no file fetched from anywhere else", () => {
    const urls = rules.flatMap((rule) => rule.urls)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.filter((url) => !url.startsWith("./"))).toEqual([])
  })

  it("is the only typeface a part can choose besides the monospace one", () => {
    const naming = sources.flatMap(({ name, text }) => [
      ...[...text.matchAll(/font-family:[^;]*/g)].map((match) => `${name}: ${match[0]}`),
      ...[...text.matchAll(/fontFamily:\s*("[^"]*"|'[^']*'|`[^`]*`)/g)]
        .filter((match) => !/^["'`]var\(--font-(sans|mono)\)["'`]$/.test(match[1] ?? ""))
        .map((match) => `${name}: ${match[0]}`),
      ...[...text.matchAll(/(?<![\w-])font-(serif|\[[^\]]*\])/g)].map((match) => `${name}: ${match[0]}`),
      ...[...text.matchAll(/fonts\.(googleapis|gstatic)\.com|@import\s+url\(/g)].map((match) => `${name}: ${match[0]}`),
    ])
    expect(naming).toEqual([])
  })
})
