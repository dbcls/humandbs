import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { parseQuery, serializeQuery, truncatedWord } from "./dsl"
import { BUILT_IN_ONLY } from "./fields"
import { keywordToQuery, splitKeyword } from "./keyword"

/**
 * A term as somebody types it: no separator of the box's own inside it, and not
 * ending in the star the box drops (the property below covers that case).
 */
const term = fc
  .string({ minLength: 1 })
  .filter((s) => s.trim() === s && s !== "" && !/[\s,"']/.test(s) && truncatedWord(s) === null)

const arm = fc.array(term, { minLength: 1, maxLength: 3 }).map((terms) => terms.join(" "))
const typed = fc.array(arm, { minLength: 1, maxLength: 3 }).map((arms) => arms.join(","))

describe("the box and the address", () => {
  it("drops a star after a term, and finds what the term without it finds", () => {
    fc.assert(fc.property(term, fc.integer({ min: 1, max: 3 }), (typed, stars) => {
      fc.pre(!/[*?]/.test(typed))
      const starred = keywordToQuery(`${typed}${"*".repeat(stars)}`)
      expect(serializeQuery(starred)).toBe(serializeQuery(keywordToQuery(typed)))
    }))
  })

  it("shows back what was typed, once the address has been round-tripped", () => {
    fc.assert(fc.property(typed, (input) => {
      const written = serializeQuery(keywordToQuery(input))
      const parsed = parseQuery(written, BUILT_IN_ONLY)
      expect(parsed.ok, `${written} was refused`).toBe(true)
      if (parsed.ok) expect(splitKeyword(parsed.ast).keyword).toBe(input)
    }))
  })

  it("never leaves a condition unshown: what the box drops becomes a chip", () => {
    fc.assert(fc.property(typed, (input) => {
      const split = splitKeyword(keywordToQuery(input))
      const shown = keywordToQuery(split.keyword)
      expect(serializeQuery(shown)).toBe(serializeQuery(keywordToQuery(input)))
      expect(split.conditions).toEqual([])
    }))
  })
})
