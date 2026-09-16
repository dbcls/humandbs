import { describe, expect, it } from "vitest"

import {
  codeProblem,
  filterKeyRows,
  moved,
  termCodeFrom,
  termCodeProblem,
  type KeyFilter,
  type KeyFilterRow,
} from "./catalog"

describe("the code of a catalog entry", () => {
  it("takes lower-case words joined by hyphens and nothing else", () => {
    expect(codeProblem("read-length")).toBeNull()
    expect(codeProblem("icd10")).toBeNull()
    expect(codeProblem("Read Length")).toBe("malformed")
    expect(codeProblem("read_length")).toBe("malformed")
    expect(codeProblem("-leading")).toBe("malformed")
    expect(codeProblem("trailing-")).toBe("malformed")
    expect(codeProblem("")).toBe("malformed")
  })

  it("refuses the name of a field the search already owns", () => {
    // `title:x` would otherwise mean both the research's title and this key.
    expect(codeProblem("title")).toBe("reserved")
    expect(codeProblem("id")).toBe("reserved")
    expect(codeProblem("date_published")).toBe("malformed")
  })
})

describe("the code of a term", () => {
  it("takes the shape an external standard writes, which a key's code does not", () => {
    // ICD10 writes C34 and H18.51; neither is ours to lower-case or reshape.
    expect(termCodeProblem("C34")).toBeNull()
    expect(termCodeProblem("H18.51")).toBeNull()
    expect(termCodeProblem("rna-seq")).toBeNull()
  })

  it("refuses one that could not be written in a query without quoting", () => {
    expect(termCodeProblem("NGS (Exome)")).toBe("malformed")
    expect(termCodeProblem("a:b")).toBe("malformed")
    expect(termCodeProblem("a*")).toBe("malformed")
    expect(termCodeProblem("")).toBe("malformed")
  })
})

describe("the code a new term is stored under", () => {
  /* The codes already in the vocabulary were written by hand, and the labels
     they were written from are still there — so a generated one has to come out
     the same, or every value added from now on reads differently in an address
     than the ones beside it. */
  it("comes out as the ones written by hand already are", () => {
    expect(termCodeFrom("ATAC-seq")).toBe("atac-seq")
    expect(termCodeFrom("16S rRNA Sequencing")).toBe("16s-rrna-sequencing")
    expect(termCodeFrom("Genotyping by array")).toBe("genotyping-by-array")
    expect(termCodeFrom("CUT&RUN-seq")).toBe("cut-run-seq")
  })

  it("puts one hyphen where a run of anything else was", () => {
    expect(termCodeFrom("Whole  —  genome")).toBe("whole-genome")
    expect(termCodeFrom("a / b (c)")).toBe("a-b-c")
  })

  it("leaves no hyphen at either end", () => {
    expect(termCodeFrom("  ATAC-seq  ")).toBe("atac-seq")
    expect(termCodeFrom("(WGS)")).toBe("wgs")
  })

  /* A label with nothing a code can hold leaves an empty one, and an empty code
     is what `termCodeProblem` already refuses — so the screen answers with the
     same problem it would for a code typed by hand. */
  it("leaves nothing to refuse when the label holds no letters or digits", () => {
    expect(termCodeFrom("―")).toBe("")
    expect(termCodeProblem(termCodeFrom("―"))).toBe("malformed")
    expect(termCodeProblem(termCodeFrom("メチル化アレイ"))).toBe("malformed")
  })

  /* Whatever the label holds, what comes out is a code a query can carry
     unquoted — that is the one thing the generated side must not get wrong. */
  it("never makes a code the query language would refuse", () => {
    for (const label of ["ATAC-seq", "a:b", "x (y) [z]", "q?w*e", "back\\slash", "'quoted'"]) {
      const code = termCodeFrom(label)
      if (code !== "") expect(termCodeProblem(code)).toBeNull()
    }
  })
})

describe("moving an entry one place", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }]

  it("swaps it with its neighbour", () => {
    expect(moved(items, "b", "up").map((one) => one.id)).toEqual(["b", "a", "c"])
    expect(moved(items, "b", "down").map((one) => one.id)).toEqual(["a", "c", "b"])
  })

  it("leaves the order alone at either end", () => {
    expect(moved(items, "a", "up").map((one) => one.id)).toEqual(["a", "b", "c"])
    expect(moved(items, "c", "down").map((one) => one.id)).toEqual(["a", "b", "c"])
  })

  it("leaves the order alone when asked about something that is not there", () => {
    expect(moved(items, "z", "up").map((one) => one.id)).toEqual(["a", "b", "c"])
  })
})

describe("narrowing the fields listing", () => {
  function field(code: string, over: Partial<KeyFilterRow> = {}): KeyFilterRow {
    return {
      code,
      labelJa: code,
      labelEn: code,
      valueType: "text",
      ...over,
    }
  }

  const platform = field("platform", {
    labelJa: "プラットフォーム",
    labelEn: "Platform",
    valueType: "vocabulary",
  })
  const readLength = field("read-length", {
    labelJa: "リード長",
    labelEn: "Read length",
    valueType: "number",
  })
  const targets = field("targets", { labelJa: "ターゲット", labelEn: "Targets" })
  const rows = [platform, readLength, targets]

  function found(filter: Partial<KeyFilter>): string[] {
    return filterKeyRows(rows, { keyword: "", types: [], ...filter })
      .map((row) => row.code)
  }

  it("hands every field back in the order it was given, with nothing in force", () => {
    expect(found({})).toEqual(["platform", "read-length", "targets"])
  })

  it("matches the code and either label", () => {
    expect(found({ keyword: "read-l" })).toEqual(["read-length"])
    expect(found({ keyword: "リード" })).toEqual(["read-length"])
    expect(found({ keyword: "Read length" })).toEqual(["read-length"])
  })

  it("does not match a word that runs from the code into a label", () => {
    expect(found({ keyword: "targets ターゲット" })).toEqual([])
  })

  it("asks the same whatever the case and the surrounding space", () => {
    expect(found({ keyword: "  PLATFORM  " })).toEqual(["platform"])
  })

  it("keeps the types that are ticked and nothing else", () => {
    expect(found({ types: ["number"] })).toEqual(["read-length"])
    expect(found({ types: ["vocabulary", "number"] })).toEqual(["platform", "read-length"])
  })

  it("combines the keyword and the type as an AND", () => {
    expect(found({ keyword: "read", types: ["number"] })).toEqual(["read-length"])
    expect(found({ keyword: "platform", types: ["number"] })).toEqual([])
  })

  it("narrows nothing when every value of the axis is ticked", () => {
    expect(found({ types: ["text", "vocabulary", "number", "disease"] }))
      .toEqual(["platform", "read-length", "targets"])
  })
})
