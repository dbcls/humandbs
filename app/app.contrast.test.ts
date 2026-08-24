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
      "visited",
      "warning",
      "warning-surface",
    ])
  })

  describe("carries white text", () => {
    it.each([
      ["brand", TEXT],
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
