import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { parseQuery, serializeQuery, type QueryNode } from "./dsl"
import { BUILT_IN_ONLY } from "./fields"

/**
 * Values a query can hold. Deliberately hostile: the characters the grammar
 * gives meaning to have to survive being written out and read back, because
 * that is the whole round trip the address depends on.
 */
const DATE_LOOKING = /^\d{4}-\d{2}-\d{2}$/

const value = fc.oneof(
  fc.constantFrom("cancer", "糖尿病", "NGS(Exome)", "AND", "OR", "NOT", "a b", "he said \"no\"", "[x TO y]", "a*b"),
  fc.string({ minLength: 1 }).filter((s) => s.trim() !== "" && !s.includes("\n")),
).filter((s) => !DATE_LOOKING.test(s))

const freeText = value.map((v): QueryNode => ({ op: "free_text", value: v }))

const date = fc.date({ min: new Date("1990-01-01"), max: new Date("2039-12-31"), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10))

const fieldClause = fc.oneof(
  fc.record({ field: fc.constantFrom("id", "title"), value }).map(({ field, value: v }): QueryNode => ({
    op: "field", field, valueKind: "term", value: v,
  })),
  fc.record({ field: fc.constantFrom("id", "title"), value: fc.constantFrom("hum0*", "JGAD00?", "ab.c-1*") })
    .map(({ field, value: v }): QueryNode => ({
      op: "field", field, valueKind: "wildcard", value: v,
    })),
  fc.record({ field: fc.constantFrom("date_published", "date_modified"), value: date })
    .map(({ field, value: v }): QueryNode => ({ op: "field", field, valueKind: "date", value: v })),
  fc.record({ field: fc.constantFrom("date_published", "date_modified"), from: date, to: date })
    .map(({ field, from, to }): QueryNode => ({
      op: "field", field, valueKind: "range", value: { from, to },
    })),
)

const leaf = fc.oneof(freeText, fieldClause)

/**
 * Only shapes the parser itself produces: a group holds at least two children
 * and never a group of the same operator, since both are folded away on the way
 * in. A tree that could not have been parsed is not one the round trip owes
 * anything to.
 */
const node: fc.Arbitrary<QueryNode> = fc.letrec<{ node: QueryNode }>((tie) => ({
  node: fc.oneof(
    { maxDepth: 3, depthSize: "small" },
    leaf,
    fc.array(tie("node"), { minLength: 2, maxLength: 3 })
      .map((rules): QueryNode => ({ op: "AND", rules: rules.flatMap((r) => (r.op === "AND" ? r.rules : [r])) })),
    fc.array(tie("node"), { minLength: 2, maxLength: 3 })
      .map((rules): QueryNode => ({ op: "OR", rules: rules.flatMap((r) => (r.op === "OR" ? r.rules : [r])) })),
    tie("node").map((only): QueryNode => ({ op: "NOT", rules: [only] })),
  ),
})).node

describe("a query and its written form", () => {
  it("is the same query after being written out and read back", () => {
    fc.assert(fc.property(node, (tree) => {
      const written = serializeQuery(tree)
      const parsed = parseQuery(written, BUILT_IN_ONLY)
      expect(parsed.ok, `${written} was refused`).toBe(true)
      if (parsed.ok) expect(parsed.ast).toEqual(tree)
    }))
  })

  it("writes the same form however many times it goes round", () => {
    fc.assert(fc.property(node, (tree) => {
      const once = serializeQuery(tree)
      const parsed = parseQuery(once, BUILT_IN_ONLY)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) expect(serializeQuery(parsed.ast)).toBe(once)
    }))
  })
})

describe("reading anything at all", () => {
  it("either gives a tree or says where it stopped, and never throws", () => {
    fc.assert(fc.property(fc.string(), (input) => {
      const parsed = parseQuery(input, BUILT_IN_ONLY)
      if (!parsed.ok) expect(parsed.error.column).toBeGreaterThanOrEqual(1)
    }))
  })
})
