import { describe, expect, it } from "vitest"

import { parseQuery, serializeQuery, type QueryNode } from "./dsl"
import { BUILT_IN_ONLY, queryFields } from "./fields"

function ast(input: string): QueryNode | null {
  const parsed = parseQuery(input, BUILT_IN_ONLY)
  if (!parsed.ok) throw new Error(`${parsed.error.code} at ${parsed.error.column}`)
  return parsed.ast
}

function errorOf(input: string) {
  const parsed = parseQuery(input, BUILT_IN_ONLY)
  if (parsed.ok) throw new Error("expected the query to be refused")
  return parsed.error
}

describe("reading a query", () => {
  it("treats an empty query as the whole published set rather than an error", () => {
    expect(ast("")).toBeNull()
    expect(ast("   ")).toBeNull()
  })

  it("reads words next to each other as all of them", () => {
    expect(ast("cancer tumor")).toEqual({
      op: "AND",
      rules: [{ op: "free_text", value: "cancer" }, { op: "free_text", value: "tumor" }],
    })
    expect(ast("cancer AND tumor")).toEqual(ast("cancer tumor"))
  })

  it("keeps a quoted run together as one value", () => {
    expect(ast("\"Homo sapiens\"")).toEqual({ op: "free_text", value: "Homo sapiens" })
    expect(ast("'Homo sapiens'")).toEqual({ op: "free_text", value: "Homo sapiens" })
  })

  it("gives AND precedence over OR", () => {
    expect(ast("a OR b c")).toEqual({
      op: "OR",
      rules: [
        { op: "free_text", value: "a" },
        { op: "AND", rules: [{ op: "free_text", value: "b" }, { op: "free_text", value: "c" }] },
      ],
    })
  })

  it("lets free text sit under OR and under NOT", () => {
    expect(ast("a OR NOT b")).toEqual({
      op: "OR",
      rules: [
        { op: "free_text", value: "a" },
        { op: "NOT", rules: [{ op: "free_text", value: "b" }] },
      ],
    })
  })

  it("flattens a group of the same operator so one tree has one written form", () => {
    expect(ast("a AND (b AND c)")).toEqual(ast("a b c"))
    expect(ast("(a OR b) OR c")).toEqual(ast("a OR b OR c"))
  })

  it("reads a field, a date and a range", () => {
    expect(ast("title:cancer")).toEqual({
      op: "field", field: "title", valueKind: "term", value: "cancer",
    })
    expect(ast("date_published:2020-01-01")).toEqual({
      op: "field", field: "date_published", valueKind: "date", value: "2020-01-01",
    })
    expect(ast("date_published:[2020-01-01 TO 2024-12-31]")).toEqual({
      op: "field",
      field: "date_published",
      valueKind: "range",
      value: { from: "2020-01-01", to: "2024-12-31" },
    })
  })

  it("refuses a field nobody has allowed, naming where it is", () => {
    expect(errorOf("cancer AND organism:human")).toEqual({
      code: "unknown-field", column: 12, token: "organism",
    })
  })

  it("refuses an operator the field has no meaning for", () => {
    expect(errorOf("date_published:cancer").code).toBe("invalid-operator-for-field")
    expect(errorOf("id:[a TO b]").code).toBe("invalid-operator-for-field")
  })

  it("refuses a date that does not exist", () => {
    expect(errorOf("date_published:2020-02-30").code).toBe("invalid-date-format")
    expect(errorOf("date_modified:[2020-13-01 TO 2020-12-31]").code).toBe("invalid-date-format")
  })

  it("refuses a wildcard with nothing to start from", () => {
    expect(errorOf("id:*0001").code).toBe("invalid-operator-for-field")
    expect(errorOf("id:h*").code).toBe("invalid-operator-for-field")
    expect(ast("id:hum0*")).toEqual({
      op: "field", field: "id", valueKind: "wildcard", value: "hum0*",
    })
  })

  it("refuses a bare wildcard, which would walk every term in the index", () => {
    expect(errorOf("hum0*").code).toBe("unexpected-token")
  })

  it("refuses an unbalanced group and an unterminated quote", () => {
    expect(errorOf("(a").code).toBe("unexpected-token")
    expect(errorOf("a)").code).toBe("unexpected-token")
    expect(errorOf("\"a").code).toBe("unexpected-token")
  })

  it("refuses a query nested past the depth it will answer", () => {
    expect(errorOf(`${"(".repeat(40)}a${")".repeat(40)}`).code).toBe("too-complex")
  })
})

describe("writing a query out", () => {
  it("writes an AND of plain words the way it was typed", () => {
    expect(serializeQuery(ast("cancer tumor"))).toBe("cancer tumor")
  })

  it("quotes a value the grammar would otherwise read as syntax", () => {
    const node: QueryNode = { op: "free_text", value: "NGS(Exome)" }
    expect(serializeQuery(node)).toBe("\"NGS(Exome)\"")
    expect(ast(serializeQuery(node))).toEqual(node)
  })

  it("quotes a value that would be read as an operator", () => {
    expect(serializeQuery({ op: "free_text", value: "AND" })).toBe("\"AND\"")
  })

  it("parenthesises only where precedence would change the meaning", () => {
    expect(serializeQuery(ast("(a OR b) c"))).toBe("(a OR b) AND c")
    expect(serializeQuery(ast("a OR b c"))).toBe("a OR b c")
    expect(serializeQuery(ast("NOT (a OR b)"))).toBe("NOT (a OR b)")
  })

  it("writes nothing for the empty query", () => {
    expect(serializeQuery(null)).toBe("")
  })
})

describe("the fields the catalog adds", () => {
  const withFacets = queryFields([
    { code: "platform", keyId: "key-platform", kind: "vocabulary", setId: "set-platform" },
    { code: "read-length", keyId: "key-read-length", kind: "number", setId: null },
  ])

  function refused(input: string) {
    const parsed = parseQuery(input, withFacets)
    if (parsed.ok) throw new Error("expected the query to be refused")
    return parsed.error
  }

  it("accepts a facet only while the catalog names it", () => {
    const named = parseQuery("platform:hiseq-2500", withFacets)
    expect(named.ok).toBe(true)
    // The same query against the built-in fields alone is not a query at all.
    const unnamed = parseQuery("platform:hiseq-2500", BUILT_IN_ONLY)
    expect(unnamed.ok).toBe(false)
    expect(refused("tissue:liver").code).toBe("unknown-field")
  })

  it("holds a numeric range open at either end", () => {
    const parsed = parseQuery("read-length:[100 TO *]", withFacets)
    expect(parsed.ok && parsed.ast).toEqual({
      op: "field",
      field: "read-length",
      valueKind: "range",
      value: { from: "100", to: "*" },
    })
    expect(refused("read-length:[a TO 10]").code).toBe("invalid-number-format")
  })

  it("holds a date range open at either end, and still refuses a day that is not one", () => {
    expect(parseQuery("date_published:[2020-01-01 TO *]", withFacets).ok).toBe(true)
    expect(parseQuery("date_published:[* TO 2020-01-01]", withFacets).ok).toBe(true)
    expect(refused("date_published:[2020-02-30 TO *]").code).toBe("invalid-date-format")
    expect(refused("date_published:[* TO tomorrow]").code).toBe("invalid-date-format")
  })

  it("writes an open date range back the way it was read", () => {
    const parsed = parseQuery("date_published:[2020-01-01 TO *]", withFacets)
    expect(parsed.ok && serializeQuery(parsed.ast)).toBe("date_published:[2020-01-01 TO *]")
  })

  it("refuses a range or a wildcard on a vocabulary, whose values are a closed set", () => {
    expect(refused("platform:[a TO b]").code).toBe("invalid-operator-for-field")
    expect(refused("platform:hiseq*").code).toBe("invalid-operator-for-field")
  })
})
