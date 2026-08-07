import { describe, expect, it } from "vitest"

import { serializeQuery } from "./dsl"
import { joinKeyword, keywordToQuery, splitKeyword } from "./keyword"

const written = (input: string) => serializeQuery(keywordToQuery(input))

describe("what is typed into the box", () => {
  it("means all of them when the terms are separated by spaces", () => {
    expect(written("糖尿病 ゲノム")).toBe("糖尿病 ゲノム")
    expect(keywordToQuery("a b")).toEqual({
      op: "AND",
      rules: [{ op: "free_text", value: "a" }, { op: "free_text", value: "b" }],
    })
  })

  it("means any of them when the terms are separated by commas", () => {
    expect(written("cancer,tumor")).toBe("cancer OR tumor")
  })

  it("keeps a quoted run together, spaces and all", () => {
    expect(keywordToQuery("\"Homo sapiens\"")).toEqual({ op: "free_text", value: "Homo sapiens" })
    expect(written("\"Homo sapiens\"")).toBe("\"Homo sapiens\"")
  })

  it("holds a comma inside quotes as part of the term, not as either-or", () => {
    // The comma is a separator of the box, not of the query language, so the
    // written form needs no quotes around it.
    expect(keywordToQuery("\"a,b\"")).toEqual({ op: "free_text", value: "a,b" })
    expect(written("\"a,b\"")).toBe("a,b")
  })

  it("shows a term holding a comma back in quotes, so it is not read as either-or", () => {
    expect(splitKeyword(keywordToQuery("\"a,b\"")).keyword).toBe("\"a,b\"")
  })

  it("keeps punctuation as part of the term rather than as syntax", () => {
    expect(keywordToQuery("NGS(Exome)")).toEqual({ op: "free_text", value: "NGS(Exome)" })
    expect(written("NGS(Exome)")).toBe("\"NGS(Exome)\"")
  })

  it("stands for nothing when it holds nothing", () => {
    expect(keywordToQuery("")).toBeNull()
    expect(keywordToQuery("   ,  ")).toBeNull()
  })
})

describe("showing a query back in the box", () => {
  it("puts free text in the box and leaves the box empty of anything else", () => {
    const split = splitKeyword(keywordToQuery("糖尿病 ゲノム"))
    expect(split.keyword).toBe("糖尿病 ゲノム")
    expect(split.conditions).toEqual([])
  })

  it("shows a condition the box cannot hold beside it instead of dropping it", () => {
    const split = splitKeyword(joinKeyword("糖尿病", [
      { op: "field", field: "title", valueKind: "term", value: "ゲノム" },
    ]))
    expect(split.keyword).toBe("糖尿病")
    expect(split.conditions).toEqual([
      { op: "field", field: "title", valueKind: "term", value: "ゲノム" },
    ])
  })

  it("keeps an either-or in the box even when a condition sits beside it", () => {
    const split = splitKeyword(joinKeyword("a,b", [
      { op: "field", field: "id", valueKind: "wildcard", value: "hum0*" },
    ]))
    expect(split.keyword).toBe("a,b")
    expect(split.conditions).toHaveLength(1)
  })

  it("falls back to showing everything as conditions rather than losing a shape", () => {
    const nested = keywordToQuery("a b")
    const split = splitKeyword({ op: "NOT", rules: [nested ?? { op: "free_text", value: "a" }] })
    expect(split.keyword).toBe("")
    expect(split.conditions).toHaveLength(1)
  })
})
