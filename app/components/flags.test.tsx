import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { STATE_FLAG } from "./contents"
import { FLAG, Flag, type FlagKind, Stated } from "./flags"

const KINDS = Object.keys(FLAG) as FlagKind[]

const TONE_EDGE = {
  brand: "border-brand",
  accent: "border-accent",
  muted: "border-line-strong",
  warning: "border-warning",
  danger: "border-danger",
} as const

describe("Flag", () => {
  it("draws every kind in its tone's edge, with the words and a glyph kept from the reader", () => {
    fc.assert(fc.property(
      fc.constantFrom(...KINDS),
      fc.string({ minLength: 1 }).filter((text) => text.trim() !== "" && !/[<>&"']/.test(text)),
      (kind, words) => {
        const html = renderToStaticMarkup(<Flag kind={kind}>{words}</Flag>)
        expect(html).toContain(TONE_EDGE[FLAG[kind].tone])
        expect(html).toContain(words)
        expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
      },
    ))
  })

  it("gives no two kinds the same colour and glyph, so a look names one meaning", () => {
    const looks = KINDS.map((kind) => `${FLAG[kind].tone}/${FLAG[kind].icon}`)
    expect(new Set(looks).size).toBe(looks.length)
  })

  it("is shown with the glyph the same state is shown with as an indicator and a word in a listing", () => {
    expect(STATE_FLAG).toEqual({ published: "live", scheduled: "scheduled", unpublished: "hidden" })
  })

  it("leaves what has passed without a colour", () => {
    expect(FLAG.resolved.tone).toBe("muted")
  })
})

describe("Stated", () => {
  it("draws every kind with the glyph the same kind's badge is shown with, and no colour of its own", () => {
    for (const kind of KINDS) {
      const html = renderToStaticMarkup(<Stated kind={kind}>語</Stated>)
      const badge = renderToStaticMarkup(<Flag kind={kind}>語</Flag>)
      const glyph = (markup: string) => /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(markup)?.[1]
      expect(glyph(html)).toBeDefined()
      expect(glyph(html)).toBe(glyph(badge))
      // The colour is the badge's: a badge every row has is not something to pick out.
      expect(html).not.toMatch(/text-(accent|warning|danger|brand)\b/)
      expect(html).not.toMatch(/border-/)
    }
  })
})

describe("the indicators of sharing", () => {
  it("shows a draft is shared with the link's glyph in the colour of what moved, and unshared as unseen", () => {
    expect(FLAG.shared).toEqual({ tone: "accent", icon: "link" })
    expect(FLAG.hidden.icon).toBe("lock")
  })

  it("shows a save refused because another got there first in the colour of what is short, not of a difference", () => {
    expect(FLAG.conflicted.tone).toBe("warning")
    expect(FLAG.conflicted).not.toEqual(FLAG.differs)
  })
})
