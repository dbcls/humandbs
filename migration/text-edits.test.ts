import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  assertEditsApplied,
  assertGrantEditsApplied,
  assertPublicationEditsApplied,
  editGrants,
  editPublications,
  editText,
  type GrantEdit,
  type PublicationEdit,
  type TextEdit,
} from "./text-edits"

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
    const grants = { grants: [{ id: "grant-1", grantIds: { state: "value", value: ["16H06279", "SCLS課題4", ""] } }] }
    const edited = editText(grants, { hum: "hum0066", dataset: false }, [edit({ hum: "hum0066", field: "grants", before: "SCLS課題4", after: "" })], new Set())

    expect(edited.grants[0]?.grantIds).toEqual({ state: "value", value: ["16H06279", ""] })
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
  const paper = (title: string, doi: string) => ({ id: title, title: slot(title), doi: slot(doi), datasetIds: { state: "value", value: [] as string[] }, externalIds: [] as string[] })
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
      { ...paper("A study", ""), datasetIds: { state: "value", value: ["d-1"] } },
      paper("B study", "https://doi.org/10.1/b"),
      { ...paper("A study", ""), datasetIds: { state: "value", value: ["d-2", "d-1"] }, externalIds: ["JGAD000001"] },
    ] }
    const edited = editPublications(repeated, "hum0018", [{ hum: "hum0018", title: "A study", repeated: true }], new Set())

    expect(edited.relatedPublications.map((p) => [p.title.value, p.datasetIds.value])).toEqual([["A study", ["d-1", "d-2"]], ["B study", []]])
    expect(edited.relatedPublications[0]?.externalIds).toEqual(["JGAD000001"])
  })

  it("writes the title anew of only the entry with the given DOI", () => {
    const two = { relatedPublications: [paper("A study", "https://doi.org/10.1/a"), paper("A study", "https://doi.org/10.1/erratum")] }
    const edited = editPublications(two, "hum0018", [{ hum: "hum0018", title: "A study", having: "https://doi.org/10.1/erratum", retitle: "Erratum: A study" }], new Set())

    expect(edited.relatedPublications.map((p) => p.title.value)).toEqual(["A study", "Erratum: A study"])
  })

  it("corrects a title and then lists the paper once when the edits come in that order", () => {
    const typo = { relatedPublications: [{ ...paper("A stuudy", "https://doi.org/10.1/a"), datasetIds: { state: "value", value: ["d-1"] } }, { ...paper("A study", "https://doi.org/10.1/a"), datasetIds: { state: "value", value: ["d-2"] } }] }
    const edited = editPublications(typo, "hum0014", [
      { hum: "hum0014", title: "A stuudy", retitle: "A study" },
      { hum: "hum0014", title: "A study", repeated: true },
    ], new Set())

    expect(edited.relatedPublications.map((p) => [p.title.value, p.datasetIds.value])).toEqual([["A study", ["d-1", "d-2"]]])
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

describe("editGrants", () => {
  const grant = (id: string, ja: string, en: string, numbers: string[]) => ({
    id,
    title: { ja: slot(ja), en: slot(en) },
    agency: { name: { ja: slot("基盤研究（C）"), en: slot("Grant-in-Aid for Scientific Research (C)") } },
    grantIds: { state: "value", value: numbers },
  })
  const content = { grants: [
    grant("grant-1", "肺がんの研究", "Lung cancer", ["19K07699"]),
    grant("grant-2", "胃がんの研究", "Gastric cancer", ["22H00001"]),
    grant("grant-3", "肺がんの研究", "", ["19K07699"]),
  ] }

  it("keeps the first entry of a repeated grant and drops the later ones", () => {
    const one: GrantEdit = { hum: "hum0419", title: "肺がんの研究", repeated: true }
    const applied = new Set<GrantEdit>()
    const edited = editGrants(content, "hum0419", [one], applied)

    expect(edited.grants.map((g) => g.id)).toEqual(["grant-1", "grant-2"])
    expect(edited.grants[0]).toBe(content.grants[0])
    expect(applied.has(one)).toBe(true)
  })

  it("finds the grant by its title in either language", () => {
    const edited = editGrants(content, "hum0419", [{ hum: "hum0419", title: "Lung cancer", repeated: true }], new Set())

    expect(edited.grants.map((g) => g.id)).toEqual(["grant-1", "grant-2", "grant-3"])
    const twice = { grants: [grant("grant-1", "", "Lung cancer", []), grant("grant-2", "", "Lung cancer", [])] }
    expect(editGrants(twice, "hum0419", [{ hum: "hum0419", title: "Lung cancer", repeated: true }], new Set()).grants.map((g) => g.id)).toEqual(["grant-1"])
  })

  it("drops a later entry whose numbers are unknown or not applicable", () => {
    const later = { ...grant("grant-2", "肺がんの研究", "Lung cancer", []), grantIds: { state: "unknown" } }
    const first = grant("grant-1", "肺がんの研究", "Lung cancer", ["19K07699"])
    const edited = editGrants({ grants: [first, later] }, "hum0419", [{ hum: "hum0419", title: "肺がんの研究", repeated: true }], new Set())

    expect(edited.grants.map((g) => g.id)).toEqual(["grant-1"])
  })

  it("stops on a later entry holding a value the first does not", () => {
    const edits: GrantEdit[] = [{ hum: "hum0419", title: "肺がんの研究", repeated: true }]
    const numbered = { grants: [content.grants[0], grant("grant-3", "肺がんの研究", "Lung cancer", ["22H03164"])] }
    const described = { grants: [grant("grant-1", "肺がんの研究", "", ["19K07699"]), grant("grant-3", "肺がんの研究", "Lung cancer", ["19K07699"])] }

    expect(() => editGrants(numbered, "hum0419", edits, new Set())).toThrow(/hum0419 .*grant-3/)
    expect(() => editGrants(described, "hum0419", edits, new Set())).toThrow(/hum0419 .*grant-3/)
  })

  it("leaves another research, a title listed once, and content without grants as they were", () => {
    const edits: GrantEdit[] = [{ hum: "hum0419", title: "胃がんの研究", repeated: true }]
    expect(editGrants(content, "hum0001", edits, new Set())).toBe(content)
    expect(editGrants(content, "hum0419", edits, new Set())).toBe(content)
    const bare = { title: slot("x") }
    expect(editGrants(bare, "hum0419", edits, new Set())).toBe(bare)
  })

  it("lists every title named once, in the order of its first entry, leaving the other entries in place", () => {
    const titleArb: fc.Arbitrary<string> = fc.constantFrom("A", "B", "C", "D")
    fc.assert(fc.property(fc.array(titleArb, { maxLength: 8 }), fc.subarray<string>(["A", "B", "C", "D"]), (titles, named) => {
      const grants = titles.map((title, at) => grant(`grant-${at + 1}`, title, "", ["X"]))
      const edited = editGrants({ grants }, "hum0419", named.map((title) => ({ hum: "hum0419", title, repeated: true as const })), new Set())

      const expected = grants.filter((one, at) => !named.includes(one.title.ja.value) || titles.indexOf(one.title.ja.value) === at)
      expect(edited.grants).toEqual(expected)
    }))
  })

  it("writes the numbers anew of every entry with the title", () => {
    const one: GrantEdit = { hum: "hum0419", title: "胃がんの研究", grantIds: ["22H03164"] }
    const applied = new Set<GrantEdit>()
    const edited = editGrants(content, "hum0419", [one], applied)

    expect(edited.grants.map((g) => g.grantIds)).toEqual([
      { state: "value", value: ["19K07699"] },
      { state: "value", value: ["22H03164"] },
      { state: "value", value: ["19K07699"] },
    ])
    expect(applied.has(one)).toBe(true)
  })

  it("lists a repeated grant once and then numbers it anew, in one edit", () => {
    const twice = { grants: [grant("grant-1", "肺がんの研究", "Lung cancer", ["22H03164"]), grant("grant-2", "肺がんの研究", "", ["22H03164"])] }
    const edited = editGrants(twice, "hum0419", [{ hum: "hum0419", title: "肺がんの研究", repeated: true, grantIds: ["19K07699"] }], new Set())

    expect(edited.grants.map((g) => [g.id, g.grantIds])).toEqual([["grant-1", { state: "value", value: ["19K07699"] }]])
  })

  it("stops on an edit whose title is nowhere", () => {
    const edits: GrantEdit[] = [{ hum: "hum0419", title: "腎がんの研究", repeated: true }]
    editGrants(content, "hum0419", edits, new Set())

    expect(() => {
      assertGrantEditsApplied(edits, new Set())
    }).toThrow(/hum0419 "腎がんの研究"/)
  })
})
