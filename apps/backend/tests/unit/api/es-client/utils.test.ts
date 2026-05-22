/**
 * Tests for es-client/utils helpers.
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { escapeEsWildcard } from "@/api/es-client/utils"

describe("escapeEsWildcard", () => {
  it("escapes `*`, `?`, and `\\`", () => {
    expect(escapeEsWildcard("*")).toBe("\\*")
    expect(escapeEsWildcard("?")).toBe("\\?")
    expect(escapeEsWildcard("\\")).toBe("\\\\")
    expect(escapeEsWildcard("a*b?c\\d")).toBe("a\\*b\\?c\\\\d")
  })

  it("leaves non-wildcard characters untouched", () => {
    expect(escapeEsWildcard("abc")).toBe("abc")
    expect(escapeEsWildcard("緑")).toBe("緑")
    expect(escapeEsWildcard("")).toBe("")
  })

  it("PBT: the escaped output contains no naked `*` or `?`", () => {
    fc.assert(
      fc.property(fc.string(), input => {
        const escaped = escapeEsWildcard(input)
        // Every `*` and `?` must be preceded by an odd number of `\` (i.e. escaped).
        for (let i = 0; i < escaped.length; i++) {
          const ch = escaped[i]
          if (ch !== "*" && ch !== "?") continue
          let backslashes = 0
          for (let j = i - 1; j >= 0 && escaped[j] === "\\"; j--) backslashes++
          if (backslashes % 2 === 0) return false
        }
        return true
      }),
      { numRuns: 200 },
    )
  })

  it("PBT: a value made of only wildcard chars expands 2x in escaped form", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("*", "?", "\\"), { minLength: 1, maxLength: 32 }).map(a => a.join("")),
        input => escapeEsWildcard(input).length === input.length * 2,
      ),
      { numRuns: 50 },
    )
  })

  // Reference matcher for ES wildcard semantics — used in the round-trip
  // property below. The matcher is intentionally simple (backtracking) to
  // stay obviously correct rather than fast.
  const matchWildcard = (pattern: string, text: string): boolean => {
    const helper = (pi: number, ti: number): boolean => {
      while (pi < pattern.length) {
        const ch = pattern[pi]
        if (ch === "\\") {
          const next = pattern[pi + 1]
          if (next === undefined) return false
          if (text[ti] !== next) return false
          pi += 2
          ti += 1
          continue
        }
        if (ch === "*") {
          for (let k = ti; k <= text.length; k++) {
            if (helper(pi + 1, k)) return true
          }
          return false
        }
        if (ch === "?") {
          if (ti >= text.length) return false
          pi += 1
          ti += 1
          continue
        }
        if (text[ti] !== ch) return false
        pi += 1
        ti += 1
      }
      return ti === text.length
    }
    return helper(0, 0)
  }

  it("reference matcher sanity: matches expected ES wildcard semantics", () => {
    expect(matchWildcard("a", "a")).toBe(true)
    expect(matchWildcard("a", "b")).toBe(false)
    expect(matchWildcard("*", "anything")).toBe(true)
    expect(matchWildcard("?", "a")).toBe(true)
    expect(matchWildcard("?", "ab")).toBe(false)
    expect(matchWildcard("\\*", "*")).toBe(true)
    expect(matchWildcard("\\*", "a")).toBe(false)
    expect(matchWildcard("\\\\", "\\")).toBe(true)
    expect(matchWildcard("a*b", "axxb")).toBe(true)
    expect(matchWildcard("a*b", "ab")).toBe(true)
    expect(matchWildcard("a*b", "ac")).toBe(false)
  })

  it("PBT: escape(s) interpreted as ES wildcard matches exactly s (and only s)", () => {
    // The defining round-trip property of the escape: an attacker-controlled
    // value `s` embedded as a literal in a wildcard pattern must not be able
    // to match any text other than `s` itself. We verify against a reference
    // wildcard matcher for a wide range of input pairs.
    fc.assert(
      fc.property(
        fc.string({ maxLength: 12 }),
        fc.string({ maxLength: 12 }),
        (s, t) => matchWildcard(escapeEsWildcard(s), t) === (s === t),
      ),
      { numRuns: 500 },
    )
  })
})
