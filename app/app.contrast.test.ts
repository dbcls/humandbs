import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * The palette has to be readable, and this is where that requirement lives.
 *
 * The values are read out of `app.css` rather than repeated here, so the test
 * cannot drift from the stylesheet: changing a colour changes what is measured.
 *
 * **A band only needs its two ends checked.** A linear gradient between two
 * colours passes through luminances between theirs, so text is at its least
 * readable at one end or the other.
 */

const STYLESHEET = readFileSync(fileURLToPath(new URL("./app.css", import.meta.url)), "utf8")

function palette(): Record<string, string> {
  const colours: Record<string, string> = {}
  for (const [, name, value] of STYLESHEET.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)) {
    if (name !== undefined && value !== undefined) colours[name] = value
  }
  return colours
}

/** Relative luminance, as WCAG 2.1 defines it. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
  const linear = channels.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
}

function contrast(one: string, other: string): number {
  const [high, low] = [luminance(one), luminance(other)].sort((a, b) => b - a)
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}

const WHITE = "#ffffff"

/** Normal-size text, and the edge of anything that can be pressed or typed into. */
const TEXT = 4.5
const NON_TEXT = 3

describe("the palette", () => {
  const colours = palette()

  it("defines every colour the parts draw with", () => {
    expect(Object.keys(colours).sort()).toEqual([
      "accent",
      "accent-light",
      "accent-lighter",
      "brand",
      "brand-dark",
      "brand-light",
      "brand-lighter",
      "danger",
      "deep",
      "focus",
      "ink",
      "ink-muted",
      "line",
      "line-strong",
      "surface",
      "surface-hover",
      "surface-input",
      "surface-light",
      "visited",
      "warning",
      "warning-surface",
    ])
  })

  describe("carries white text", () => {
    it.each([
      ["brand", TEXT],
      ["brand-dark", TEXT],
      ["brand-light", TEXT],
      ["deep", TEXT],
      ["ink-muted", TEXT],
      ["accent", TEXT],
      ["danger", TEXT],
      // Only ever the far end of the call-to-action band, whose label is large.
      ["accent-light", NON_TEXT],
      // The far end of the two ways in, whose one word is large and bold.
      ["accent-lighter", NON_TEXT],
      ["brand-lighter", NON_TEXT],
    ])("on %s", (name, least) => {
      expect(contrast(WHITE, colours[name] ?? "")).toBeGreaterThanOrEqual(least)
    })
  })

  describe("reads on white", () => {
    it.each([
      ["ink", TEXT],
      ["ink-muted", TEXT],
      ["brand", TEXT],
      ["accent", TEXT],
      ["warning", TEXT],
      ["danger", TEXT],
      ["visited", TEXT],
      // The edge of an input or a control, which is not text but has to be seen.
      ["line-strong", NON_TEXT],
    ])("%s", (name, least) => {
      expect(contrast(colours[name] ?? "", WHITE)).toBeGreaterThanOrEqual(least)
    })
  })

  it("keeps an input's edge visible against the field's own fill", () => {
    expect(contrast(colours["line-strong"] ?? "", colours["surface-input"] ?? ""))
      .toBeGreaterThanOrEqual(NON_TEXT)
  })

  /**
   * The focus ring sits on the edge of the control it marks, so it has both the
   * ground the control is on and the control's own fill on either side of it.
   * A refinement panel puts its boxes on the page's tint, which is the darkest
   * of the three and therefore the one that decides how light the ring can be.
   */
  it("keeps the focus ring visible wherever a control sits", () => {
    for (const ground of [WHITE, colours["surface-input"] ?? "", colours.surface ?? ""]) {
      expect(contrast(colours.focus ?? "", ground)).toBeGreaterThanOrEqual(NON_TEXT)
    }
  })

  it("reads body text on the tint the page sits on", () => {
    expect(contrast(colours.ink ?? "", colours.surface ?? "")).toBeGreaterThanOrEqual(TEXT)
    expect(contrast(colours["ink-muted"] ?? "", colours.surface ?? "")).toBeGreaterThanOrEqual(TEXT)
  })

  it("reads an announcement on its own ground", () => {
    const ground = colours["warning-surface"] ?? ""
    expect(contrast(colours.ink ?? "", ground)).toBeGreaterThanOrEqual(TEXT)
    // The glyph beside it and the rule around it, which are what mark the notice out.
    expect(contrast(colours.warning ?? "", ground)).toBeGreaterThanOrEqual(NON_TEXT)
  })
})

/**
 * **A colour a screen writes has to be one the palette defines.**
 *
 * There are two ways past that, and both had been taken. Tailwind still ships
 * its own ramp, so `text-green-700` draws a green nothing here chose and the
 * page ends up with two systems for the same job (`docs/ui.md` の「色」). And a
 * name the theme does not hold — `border-border`, which is what another design
 * system calls the same idea — produces no utility at all: the border stays,
 * takes `currentColor`, and comes out the colour of the words rather than the
 * quiet grey it was meant to be. Neither is visible in a diff.
 *
 * The allowed spellings are read from `app.css`, so a colour added there is
 * usable the moment it exists. What is listed below is the other half: the
 * utilities that share these prefixes without naming a colour. It is written
 * out rather than guessed at, which means a new one fails this test until
 * somebody has looked at it — which is the point.
 */
const COLOUR_PREFIX = [
  "bg", "text", "border", "ring", "fill", "stroke", "outline", "decoration",
  "caret", "from", "via", "to", "divide", "shadow", "placeholder",
]

/** What these prefixes also spell, none of which names a colour. */
const NOT_A_COLOUR = new Set([
  "white", "black", "transparent", "current", "inherit",
  // edges: which ones, how thick, how they are drawn
  "0", "2", "4", "b", "l", "r", "t", "x", "y", "b-0", "b-2", "l-2", "l-4",
  "dashed", "dotted", "solid", "separate", "collapse", "spacing-0",
  // sizes and alignment
  "none", "auto", "base", "xs", "sm", "md", "lg", "xl", "2xl", "3xl",
  "center", "left", "right", "justify", "nowrap", "top", "bottom",
  // fills that are pictures rather than colours
  "no-repeat", "blend-multiply", "linear-to-b", "linear-to-l", "linear-to-r",
  "linear-to-t", "offset-1",
])

/**
 * The strings in a source file that are lists of classes.
 *
 * **Told apart by what they are made of**, rather than by where they sit: the
 * faces are held in constants (`BUTTON_VARIANT`, `CONTROL`, `FILE_FACE` …) as
 * often as they are written on an element, so reading only `className=` would
 * miss the places a face is actually decided. A class list is lower case and
 * punctuation; anything a reader would see — a sentence, a name, a heading —
 * has capitals or Japanese in it and is left alone.
 */
const CLASS_LIST = /^[a-z0-9 :_\-[\]/.%#]+$/

function classStrings(source: string): string[] {
  const found: string[] = []
  for (const [, double, back] of source.matchAll(/"([^"\n]*)"|`([^`\n$]*)`/g)) {
    const text = double ?? back
    if (text !== undefined && text.includes("-") && CLASS_LIST.test(text)) found.push(text)
  }
  return found
}

describe("the palette is the only one", () => {
  const defined = new Set(Object.keys(palette()))

  it("has no colour a screen spells for itself", async () => {
    const { readdir, readFile } = await import("node:fs/promises")
    const path = await import("node:path")
    const root = fileURLToPath(new URL(".", import.meta.url))
    const offenders: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const at = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(at)
          continue
        }
        if (!/\.tsx?$/.test(entry.name) || entry.name.includes(".test.")) continue
        const source = await readFile(at, "utf8")
        for (const text of classStrings(source)) {
          for (const raw of text.split(/\s+/)) {
            const token = raw.replace(/^-/, "").split(":").pop() ?? ""
            const at_ = token.indexOf("-")
            if (at_ < 0) continue
            const prefix = token.slice(0, at_)
            const name = token.slice(at_ + 1).split("/")[0] ?? ""
            if (!COLOUR_PREFIX.includes(prefix)) continue
            if (name === "" || name.startsWith("[")) continue
            if (defined.has(name) || NOT_A_COLOUR.has(name)) continue
            offenders.push(`${path.relative(root, at)}: ${token}`)
          }
        }
      }
    }
    await walk(root)
    expect([...new Set(offenders)].sort()).toEqual([])
  })
})
