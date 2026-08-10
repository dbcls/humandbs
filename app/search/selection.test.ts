import { describe, expect, it } from "vitest"

import { parseQuery, serializeQuery, type QueryNode } from "./dsl"
import { queryFields } from "./fields"
import { readSelection, toggleTerm, withoutFacet, withRange } from "./selection"

const fields = queryFields([
  { code: "platform", keyId: "key-platform", kind: "vocabulary", setId: "set-platform" },
  { code: "tissue", keyId: "key-tissue", kind: "vocabulary", setId: "set-tissue" },
  { code: "read-length", keyId: "key-read-length", kind: "number", setId: null },
])

function ast(input: string): QueryNode | null {
  const parsed = parseQuery(input, fields)
  if (!parsed.ok) throw new Error(`${parsed.error.code} at ${parsed.error.column}`)
  return parsed.ast
}

function written(node: QueryNode | null): string {
  return serializeQuery(node)
}

describe("reading what the panel has chosen", () => {
  it("reads one value of a facet, and several as alternatives under it", () => {
    const selection = readSelection(ast("(platform:a OR platform:b) tissue:liver"), fields)

    expect(selection.terms.get("platform")).toEqual(["a", "b"])
    expect(selection.terms.get("tissue")).toEqual(["liver"])
  })

  it("reads a range on a numeric facet", () => {
    const selection = readSelection(ast("read-length:[100 TO *]"), fields)

    expect(selection.ranges.get("read-length")).toEqual({ from: "100", to: "*" })
  })

  it("does not read a condition it could not put back", () => {
    // A negation and a group of two different facets are both things the panel
    // has no control for, so it does not claim them as chosen values.
    const selection = readSelection(ast("NOT platform:a (platform:b OR tissue:liver)"), fields)

    expect(selection.terms.size).toBe(0)
  })

  it("leaves the keywords alone", () => {
    const selection = readSelection(ast("cancer platform:a"), fields)

    expect(selection.terms.get("platform")).toEqual(["a"])
  })
})

describe("choosing and unchoosing a value", () => {
  it("comes back to the search it started from when a value is toggled twice", () => {
    const start = ast("cancer tissue:liver")
    const once = toggleTerm(start, fields, "platform", "a")
    const back = toggleTerm(once, fields, "platform", "a")

    expect(written(once)).toBe("cancer AND tissue:liver AND platform:a")
    expect(written(back)).toBe(written(start))
  })

  it("joins the values of one facet with OR and different facets with AND", () => {
    const both = toggleTerm(toggleTerm(ast("platform:a"), fields, "platform", "b"), fields, "tissue", "liver")

    expect(written(both)).toBe("(platform:a OR platform:b) AND tissue:liver")
  })

  it("takes off one value of a facet without touching the others", () => {
    const rest = toggleTerm(ast("(platform:a OR platform:b) tissue:liver"), fields, "platform", "a")

    // The facets keep the order they were first written in, so taking a value
    // off does not move the rest of the address about.
    expect(written(rest)).toBe("platform:b AND tissue:liver")
  })

  it("leaves a condition inside a negation exactly where it was", () => {
    const start = ast("NOT platform:a")
    const next = toggleTerm(start, fields, "platform", "b")

    expect(written(next)).toBe("NOT platform:a AND platform:b")
  })
})

describe("lifting a facet's own condition", () => {
  it("takes away every value of that facet and nothing else", () => {
    const lifted = withoutFacet(ast("cancer (platform:a OR platform:b) tissue:liver"), fields, "platform")

    expect(written(lifted)).toBe("cancer AND tissue:liver")
  })

  it("gives back an empty search when the facet was the whole of it", () => {
    expect(withoutFacet(ast("platform:a"), fields, "platform")).toBeNull()
  })
})

describe("setting a range", () => {
  it("replaces the range rather than adding a second one", () => {
    const next = withRange(ast("read-length:[100 TO 150]"), fields, "read-length", {
      from: "200",
      to: "*",
    })

    expect(written(next)).toBe("read-length:[200 TO *]")
  })

  it("takes the condition away when both ends are open, rather than matching everything", () => {
    const next = withRange(ast("cancer read-length:[100 TO 150]"), fields, "read-length", {
      from: "*",
      to: "*",
    })

    expect(written(next)).toBe("cancer")
  })
})
