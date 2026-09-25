import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  codeFrom,
  codeProblem,
  filterKeyRows,
  freeCode,
  freeKeyCode,
  keyLabelProblem,
  moved,
  movedTo,
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

describe("the code a new key or term is stored under", () => {
  /* The codes already in the vocabulary were written by hand, and the labels
     they were written from are still there — so a generated one has to come out
     the same, or every value added from now on reads differently in an address
     than the ones beside it. */
  it("comes out as the ones written by hand already are", () => {
    expect(codeFrom("ATAC-seq")).toBe("atac-seq")
    expect(codeFrom("16S rRNA Sequencing")).toBe("16s-rrna-sequencing")
    expect(codeFrom("Genotyping by array")).toBe("genotyping-by-array")
    expect(codeFrom("CUT&RUN-seq")).toBe("cut-run-seq")
  })

  it("puts one hyphen where a run of anything else was", () => {
    expect(codeFrom("Whole  —  genome")).toBe("whole-genome")
    expect(codeFrom("a / b (c)")).toBe("a-b-c")
  })

  it("leaves no hyphen at either end", () => {
    expect(codeFrom("  ATAC-seq  ")).toBe("atac-seq")
    expect(codeFrom("(WGS)")).toBe("wgs")
  })

  /* A label with nothing a code can hold leaves an empty one, and an empty code
     is what `termCodeProblem` already refuses — so the screen responds with the
     same problem it would for a code typed by hand. */
  it("leaves nothing to refuse when the label holds no letters or digits", () => {
    expect(codeFrom("―")).toBe("")
    expect(termCodeProblem(codeFrom("―"))).toBe("malformed")
    expect(termCodeProblem(codeFrom("メチル化アレイ"))).toBe("malformed")
  })

  /* Whatever the label holds, what comes out is a code a query can contain
     unquoted — that is the one thing the generated side must not get wrong. */
  it("never makes a code the query language would refuse", () => {
    for (const label of ["ATAC-seq", "a:b", "x (y) [z]", "q?w*e", "back\\slash", "'quoted'"]) {
      const code = codeFrom(label)
      if (code !== "") expect(termCodeProblem(code)).toBeNull()
    }
  })

  /* A key is made from its label the same way, and a key's code has the
     stricter shape of the two — so whatever the label held, what comes out
     must be empty or pass the key's rule, or a key could be stored under a
     code the address cannot have. */
  it("is empty or a well-formed key code, whatever the label holds", () => {
    fc.assert(fc.property(fc.string({ unit: "grapheme" }), (label) => {
      const code = codeFrom(label)
      if (code !== "") expect(codeProblem(code)).not.toBe("malformed")
    }))
  })
})

describe("the first free spelling of a code", () => {
  it("keeps the one the label made when nothing holds it", () => {
    expect(freeCode("atac-seq", new Set())).toBe("atac-seq")
    expect(freeCode("atac-seq", new Set(["rna-seq"]))).toBe("atac-seq")
  })

  it("counts up from 2 past every spelling already held", () => {
    expect(freeCode("atac-seq", new Set(["atac-seq"]))).toBe("atac-seq-2")
    expect(freeCode("atac-seq", new Set(["atac-seq", "atac-seq-2"]))).toBe("atac-seq-3")
    // A gap left behind is taken before the count goes on.
    expect(freeCode("atac-seq", new Set(["atac-seq", "atac-seq-3"]))).toBe("atac-seq-2")
  })

  it("never returns a spelling the set holds, and never reshapes the wanted one", () => {
    fc.assert(fc.property(
      fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
      fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/), { maxLength: 30 }),
      (wanted, held) => {
        const taken = new Set(held)
        const code = freeCode(wanted, taken)
        expect(taken.has(code)).toBe(false)
        expect(code === wanted || /^-[2-9][0-9]*$/.test(code.slice(wanted.length))).toBe(true)
      },
    ))
  })

  /* `title` is what the search means by the research's title, so a key cannot
     live there — but the label "Title" is the curator's to choose, so the key
     moves along rather than being refused. */
  it("keeps a key clear of the field names the search owns", () => {
    expect(freeKeyCode("title", [])).toBe("title-2")
    expect(freeKeyCode("title", ["title-2"])).toBe("title-3")
    expect(freeKeyCode("coverage", ["coverage"])).toBe("coverage-2")
    expect(freeKeyCode("read-depth", ["coverage"])).toBe("read-depth")
    expect(codeProblem(freeKeyCode("title", []))).toBeNull()
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

describe("putting an entry at a place", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]
  const ids = (list: readonly { id: string }[]) => list.map((one) => one.id)

  it("closes the rows between over the place it left", () => {
    expect(ids(movedTo(items, "d", 0))).toEqual(["d", "a", "b", "c"])
    expect(ids(movedTo(items, "a", 3))).toEqual(["b", "c", "d", "a"])
    expect(ids(movedTo(items, "b", 2))).toEqual(["a", "c", "b", "d"])
    expect(ids(movedTo(items, "b", 1))).toEqual(["a", "b", "c", "d"])
  })

  it("leaves the order alone for a place or an entry that is not there", () => {
    expect(ids(movedTo(items, "b", 4))).toEqual(["a", "b", "c", "d"])
    expect(ids(movedTo(items, "b", -1))).toEqual(["a", "b", "c", "d"])
    expect(ids(movedTo(items, "b", 1.5))).toEqual(["a", "b", "c", "d"])
    expect(ids(movedTo(items, "b", Number.NaN))).toEqual(["a", "b", "c", "d"])
    expect(ids(movedTo(items, "z", 0))).toEqual(["a", "b", "c", "d"])
  })

  /* Whatever is asked, what comes back is the same rows once each, and the
     one that was moved ends up where it was put — the two things a table's
     positions must be able to rely on. */
  it("keeps every row once and puts the moved one where it was asked", () => {
    fc.assert(fc.property(
      fc.uniqueArray(fc.stringMatching(/^[a-z]{1,4}$/), { minLength: 1, maxLength: 12 }),
      fc.nat(), fc.nat(),
      (names, pick, place) => {
        const list = names.map((id) => ({ id }))
        const id = names[pick % names.length] ?? ""
        const to = place % names.length
        const out = ids(movedTo(list, id, to))
        expect([...out].sort()).toEqual([...names].sort())
        expect(out[to]).toBe(id)
      },
    ))
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

  it("matches the same whatever the case and the surrounding space", () => {
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

describe("how a key is named (keyLabelProblem)", () => {
  it("accepts the names the portal's typed keys have", () => {
    for (const [ja, en] of [
      ["カバレッジ (深度)", "Coverage (depth)"],
      ["疾患", "Disease (ICD-10)"],
      ["腫瘍/非腫瘍", "Tumor / normal"],
      ["表現型データの有無", "Phenotype data"],
      ["実験方法", "Experimental method"],
      ["加工データの種類", "Processed data type"],
      ["ChIP-seq の種類", "ChIP-seq target"],
    ]) {
      expect(keyLabelProblem(ja ?? "", en ?? "", true), `${ja} / ${en}`).toBeNull()
    }
  })

  it("refuses full-width brackets, and half-width ones without a space around them", () => {
    expect(keyLabelProblem("TCRレパトア解析方法（ソフトウェア）", "TCR repertoire analysis method (software)", false)).toBe("label-brackets")
    expect(keyLabelProblem("カバレッジ(深度)", "Coverage (depth)", false)).toBe("label-brackets")
    expect(keyLabelProblem("カバレッジ (深度)", "Coverage (depth)of", false)).toBe("label-brackets")
  })

  it("refuses a unit in brackets", () => {
    expect(keyLabelProblem("リード長 (bp)", "Read length (bp)", true)).toBe("label-unit")
    expect(keyLabelProblem("総データ量", "Total data volume (GB)", true)).toBe("label-unit")
    expect(keyLabelProblem("対象者数 (人)", "Number of subjects", true)).toBe("label-unit")
  })

  it("refuses a name that ends in 〜の別 or 〜の単位", () => {
    expect(keyLabelProblem("腫瘍の別", "Tumor", true)).toBe("label-relational")
    expect(keyLabelProblem("総データ量の単位", "Data volume unit", false)).toBe("label-relational")
  })

  it("refuses title case in a typed key's English name, keeping acronyms and inner capitals", () => {
    expect(keyLabelProblem("リード長", "Read Length", true)).toBe("label-case")
    expect(keyLabelProblem("リード長", "read length", true)).toBe("label-case")
    expect(keyLabelProblem("解析方法", "Analysis methods (Software)", true)).toBe("label-case")
    expect(keyLabelProblem("解析", "RNA-seq and Hi-C method", true)).toBeNull()
  })

  it("leaves a free-text key's English case alone, since it may be named after an archive", () => {
    expect(keyLabelProblem("Sequence Read Archive Accession", "Sequence Read Archive Accession", false)).toBeNull()
  })

  it("finds the same problem whichever language the brackets are in", () => {
    fc.assert(fc.property(fc.boolean(), fc.boolean(), (inJa, typed) => {
      const bad = "名前（括弧）"
      expect(keyLabelProblem(inJa ? bad : "名前", inJa ? "Name" : bad, typed)).toBe("label-brackets")
    }))
  })

  it("accepts any sentence-case name made of small words after a capital", () => {
    const word = fc.stringMatching(/^[a-z]{1,8}$/)
    fc.assert(fc.property(fc.stringMatching(/^[A-Z][a-z]{0,8}$/), fc.array(word, { maxLength: 4 }), (first, rest) => {
      expect(keyLabelProblem("名前", [first, ...rest].join(" "), true)).toBeNull()
    }))
  })
})
