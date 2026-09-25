import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { likeEscaped } from "~/db/like"

/** How `LIKE ... ESCAPE '\'` reads a pattern: a backslash takes the next character literally. */
function readPattern(pattern: string): { literal: string, wildcards: number } {
  let literal = ""
  let wildcards = 0
  for (let at = 0; at < pattern.length; at += 1) {
    const char = pattern.charAt(at)
    if (char === "\\") {
      at += 1
      literal += pattern.charAt(at)
    } else if (char === "%" || char === "_") {
      wildcards += 1
    } else {
      literal += char
    }
  }
  return { literal, wildcards }
}

describe("likeEscaped", () => {
  it("どの文字列も、LIKE が読むと元の文字列そのもので、ワイルドカードを含まない", () => {
    fc.assert(fc.property(fc.string({ unit: fc.constantFrom("%", "_", "\\", "a", "あ", " ") }), (value) => {
      expect(readPattern(likeEscaped(value))).toEqual({ literal: value, wildcards: 0 })
    }))
  })

  it("% と _ と \\ だけを前に \\ を付けて書き、他は変えない", () => {
    expect(likeEscaped("50%_a\\b")).toBe("50\\%\\_a\\\\b")
    expect(likeEscaped("がん")).toBe("がん")
    expect(likeEscaped("")).toBe("")
  })
})
