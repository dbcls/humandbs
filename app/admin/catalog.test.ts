import { describe, expect, it } from "vitest"

import {
  codeProblem,
  filterKeyRows,
  moved,
  NO_BOX,
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
      categoryCode: null,
      showOnPublicPage: true,
      ...over,
    }
  }

  const platform = field("platform", {
    labelJa: "プラットフォーム",
    labelEn: "Platform",
    valueType: "vocabulary",
    categoryCode: "experiment",
  })
  const readLength = field("read-length", {
    labelJa: "リード長",
    labelEn: "Read length",
    valueType: "number",
    categoryCode: "experiment",
    showOnPublicPage: false,
  })
  const targets = field("targets", { labelJa: "ターゲット", labelEn: "Targets" })
  const rows = [platform, readLength, targets]

  function found(filter: Partial<KeyFilter>): string[] {
    return filterKeyRows(rows, { keyword: "", types: [], boxes: [], showing: [], ...filter })
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

  it("reads a field standing in no box as a value of the box axis", () => {
    expect(found({ boxes: [NO_BOX] })).toEqual(["targets"])
    expect(found({ boxes: ["experiment"] })).toEqual(["platform", "read-length"])
  })

  it("reads whether a field is drawn as an axis of its own", () => {
    expect(found({ showing: ["hidden"] })).toEqual(["read-length"])
    expect(found({ showing: ["shown"] })).toEqual(["platform", "targets"])
  })

  it("combines the box and the axes as an AND", () => {
    expect(found({ types: ["vocabulary", "number"], showing: ["hidden"] })).toEqual(["read-length"])
    expect(found({ keyword: "platform", showing: ["hidden"] })).toEqual([])
  })

  it("narrows nothing when every value of an axis is ticked", () => {
    expect(found({ showing: ["shown", "hidden"] })).toEqual(["platform", "read-length", "targets"])
  })

  it("keeps a field whose box the address does not know out of the way", () => {
    expect(found({ boxes: ["nonesuch"] })).toEqual([])
  })
})
