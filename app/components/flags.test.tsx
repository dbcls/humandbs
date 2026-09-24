import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { stateMark } from "./contents"
import { FLAG, Flag, type FlagKind } from "./flags"

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

  it("wears the glyph the same state wears as a mark and a word in a listing", () => {
    expect(FLAG.live.icon).toBe(stateMark("published"))
    expect(FLAG.scheduled.icon).toBe(stateMark("scheduled"))
    expect(FLAG.hidden.icon).toBe(stateMark("unpublished"))
  })

  it("leaves what has passed without a colour", () => {
    expect(FLAG.resolved.tone).toBe("muted")
  })
})
