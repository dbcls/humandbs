import { describe, expect, it } from "vitest"

import { assertEditsApplied, assertPublicationEditsApplied, editPublications, editText, type PublicationEdit, type TextEdit } from "./text-edits"

const slot = (value: string) => ({ state: "value", value })

describe("editText", () => {
  const content = {
    title: { ja: slot("脳腫瘍のゲノム・遺伝子解析と その臨床病理学的意義の解明"), en: slot("Brain tumors and their analysis") },
    grants: [{ id: "grant-1", title: { ja: slot("研究助成-がん領域-"), en: slot("Grant") } }],
    summary: { aims: { ja: slot("その臨床"), en: slot("") } },
    datasets: [{ datasetId: "d-1", experiments: [{ text: { ja: { state: "value", value: [[{ text: "①ー2" }]] } } }] }],
  }
  const edit = (over: Partial<TextEdit>): TextEdit => ({ hum: "hum0006", field: "title", before: "と その", after: "とその", ...over })

  it("replaces the words in the named part of the named research's content, in the named language", () => {
    const applied = new Set<TextEdit>()
    const one = edit({ lang: "ja" })
    const edited = editText(content, { hum: "hum0006", dataset: false }, [one], applied)

    expect(edited.title.ja.value).toBe("脳腫瘍のゲノム・遺伝子解析とその臨床病理学的意義の解明")
    expect(edited.summary).toBe(content.summary)
    expect(applied.has(one)).toBe(true)
  })

  it("leaves another research, another part and another language as they were", () => {
    const applied = new Set<TextEdit>()
    const edits = [edit({ hum: "hum0007" }), edit({ field: "grants", before: "Grant" }), edit({ lang: "en" })]
    const edited = editText(content, { hum: "hum0006", dataset: false }, edits, applied)

    expect(edited.title).toEqual(content.title)
    expect(applied.size).toBe(1)
    expect(edited.grants[0]?.title.en.value).toBe("とその")
  })

  it("reaches the datasets inside a version and a dataset's own description only with `datasets`", () => {
    const one = edit({ field: "datasets", before: "①ー2", after: "①-2" })
    const inVersion = editText(content, { hum: "hum0006", dataset: false }, [one], new Set())
    const own = editText(content.datasets[0] ?? {}, { hum: "hum0006", dataset: true }, [one, edit({})], new Set())

    expect(inVersion.datasets[0]?.experiments[0]?.text.ja.value).toEqual([[{ text: "①-2" }]])
    expect(own).toEqual({ datasetId: "d-1", experiments: [{ text: { ja: { state: "value", value: [[{ text: "①-2" }]] } } }] })
  })

  it("takes an entry an edit leaves empty out of a list of strings, and keeps the rest", () => {
    const grants = { grants: [{ id: "grant-1", grantIds: ["16H06279", "SCLS課題4", ""] }] }
    const edited = editText(grants, { hum: "hum0066", dataset: false }, [edit({ hum: "hum0066", field: "grants", before: "SCLS課題4", after: "" })], new Set())

    expect(edited.grants[0]?.grantIds).toEqual(["16H06279", ""])
  })

  it("does not touch identifiers", () => {
    const edited = editText(content, { hum: "hum0006", dataset: false }, [edit({ field: "grants", before: "grant-1", after: "x" })], new Set())

    expect(edited.grants[0]?.id).toBe("grant-1")
  })
})

describe("assertEditsApplied", () => {
  it("stops on an edit that found nothing", () => {
    const edits: TextEdit[] = [{ hum: "hum0001", field: "title", before: "a", after: "b" }]

    expect(() => {
      assertEditsApplied(edits, new Set())
    }).toThrow(/hum0001 title/)
    expect(() => {
      assertEditsApplied(edits, new Set(edits))
    }).not.toThrow()
  })
})

describe("editPublications", () => {
  const paper = (title: string, doi: string) => ({ id: title, title: slot(title), doi: slot(doi), datasetIds: [] as string[], externalIds: [] as string[] })
  const content = { relatedPublications: [paper("A study", ""), paper("B study", "https://doi.org/10.1/b"), paper("A study", "")] }

  it("fills in the DOI of every entry with the title", () => {
    const one: PublicationEdit = { hum: "hum0014", title: "A study", doi: "https://doi.org/10.1/a" }
    const applied = new Set<PublicationEdit>()
    const edited = editPublications(content, "hum0014", [one], applied)

    expect(edited.relatedPublications.map((p) => p.doi.value)).toEqual(["https://doi.org/10.1/a", "https://doi.org/10.1/b", "https://doi.org/10.1/a"])
    expect(applied.has(one)).toBe(true)
  })

  it("keeps the first entry of a repeated paper, with the datasets the later ones cite, and drops the later ones", () => {
    const repeated = { relatedPublications: [
      { ...paper("A study", ""), datasetIds: ["d-1"] },
      paper("B study", "https://doi.org/10.1/b"),
      { ...paper("A study", ""), datasetIds: ["d-2", "d-1"], externalIds: ["JGAD000001"] },
    ] }
    const edited = editPublications(repeated, "hum0018", [{ hum: "hum0018", title: "A study", repeated: true }], new Set())

    expect(edited.relatedPublications.map((p) => [p.title.value, p.datasetIds])).toEqual([["A study", ["d-1", "d-2"]], ["B study", []]])
    expect(edited.relatedPublications[0]?.externalIds).toEqual(["JGAD000001"])
  })

  it("writes the title anew of only the entry with the given DOI", () => {
    const two = { relatedPublications: [paper("A study", "https://doi.org/10.1/a"), paper("A study", "https://doi.org/10.1/erratum")] }
    const edited = editPublications(two, "hum0018", [{ hum: "hum0018", title: "A study", having: "https://doi.org/10.1/erratum", retitle: "Erratum: A study" }], new Set())

    expect(edited.relatedPublications.map((p) => p.title.value)).toEqual(["A study", "Erratum: A study"])
  })

  it("corrects a title and then lists the paper once when the edits come in that order", () => {
    const typo = { relatedPublications: [{ ...paper("A stuudy", "https://doi.org/10.1/a"), datasetIds: ["d-1"] }, { ...paper("A study", "https://doi.org/10.1/a"), datasetIds: ["d-2"] }] }
    const edited = editPublications(typo, "hum0014", [
      { hum: "hum0014", title: "A stuudy", retitle: "A study" },
      { hum: "hum0014", title: "A study", repeated: true },
    ], new Set())

    expect(edited.relatedPublications.map((p) => [p.title.value, p.datasetIds])).toEqual([["A study", ["d-1", "d-2"]]])
  })

  it("leaves another research, and content without publications, as they were", () => {
    expect(editPublications(content, "hum0001", [{ hum: "hum0018", title: "A study", repeated: true }], new Set())).toBe(content)
    const bare = { title: slot("x") }
    expect(editPublications(bare, "hum0018", [{ hum: "hum0018", title: "x", repeated: true }], new Set())).toBe(bare)
  })

  it("stops on an edit whose title is nowhere", () => {
    const edits: PublicationEdit[] = [{ hum: "hum0018", title: "C study", repeated: true }]
    editPublications(content, "hum0018", edits, new Set())

    expect(() => {
      assertPublicationEditsApplied(edits, new Set())
    }).toThrow(/hum0018 "C study"/)
  })
})
