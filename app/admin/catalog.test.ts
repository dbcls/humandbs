import { describe, expect, it } from "vitest"

import { codeProblem, moved, termCodeProblem } from "./catalog"

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
