import { describe, expect, it } from "vitest"

import type { RichText, Slot } from "~/content/types"

import { assertValueEditsApplied, editValues, type ValueEdit } from "./value-edits"

const rich = (...lines: string[]): Slot<RichText> => ({ state: "value", value: lines.map((line) => [{ text: line }]) })
const KEYS = new Map([["jga", "key-jga"], ["ega", "key-ega"], ["dra", "key-dra"], ["insdc", "key-insdc"]])
const keyIdOf = (code: string) => KEYS.get(code)

const dataset = (values: { keyId: string, ja: Slot<RichText>, en: Slot<RichText> }[]) => ({
  datasetId: "d-1",
  experiments: [{ id: "experiment-1", values: values.map(({ keyId, ja, en }) => ({ keyId, value: { kind: "text" as const, text: { ja, en } } })) }],
})

const textOf = (content: ReturnType<typeof dataset>, keyId: string, lang: "ja" | "en") => {
  const value = content.experiments[0]?.values.find((one) => one.keyId === keyId)?.value
  if (value === undefined) return undefined
  const slot = value.text[lang]
  return slot.state === "value" ? slot.value : slot.state
}

describe("editValues", () => {
  const held = dataset([{ keyId: "key-jga", ja: rich("JGAD000036", "EGAD00001000822 / EGAS00001000662（PPB）"), en: rich("JGAD000036", "EGAD00001000822 / EGAS00001000662 (PPB)") }])

  it("writes a value anew where its text is the one the edit names, in that language only", () => {
    const one: ValueEdit = { op: "set", hum: "hum0035", key: "jga", lang: "ja", was: "JGAD000036\nEGAD00001000822 / EGAS00001000662（PPB）", markdown: "[JGAD000036](https://example.org/JGAD000036)" }
    const applied = new Set<ValueEdit>()
    const edited = editValues(held, "hum0035", [one], keyIdOf, applied)

    expect(textOf(edited, "key-jga", "ja")).toEqual([[{ text: "JGAD000036", href: "https://example.org/JGAD000036" }]])
    expect(textOf(edited, "key-jga", "en")).toEqual([[{ text: "JGAD000036" }], [{ text: "EGAD00001000822 / EGAS00001000662 (PPB)" }]])
    expect(applied.has(one)).toBe(true)
  })

  it("adds a value to another key of the experiment whose value was the text named, read before any edit", () => {
    const edits: ValueEdit[] = [
      { op: "set", hum: "hum0035", key: "jga", lang: "ja", was: "JGAD000036\nEGAD00001000822 / EGAS00001000662（PPB）", markdown: "JGAD000036" },
      { op: "add", hum: "hum0035", key: "ega", lang: "ja", markdown: "EGAD00001000822 / EGAS00001000662（PPB）", besideKey: "jga", besideWas: "JGAD000036\nEGAD00001000822 / EGAS00001000662（PPB）" },
      { op: "add", hum: "hum0035", key: "ega", lang: "en", markdown: "EGAD00001000822 / EGAS00001000662 (PPB)", besideKey: "jga", besideWas: "JGAD000036\nEGAD00001000822 / EGAS00001000662 (PPB)" },
    ]
    const edited = editValues(held, "hum0035", edits, keyIdOf, new Set())

    expect(textOf(edited, "key-ega", "ja")).toEqual([[{ text: "EGAD00001000822 / EGAS00001000662（PPB）" }]])
    expect(textOf(edited, "key-ega", "en")).toEqual([[{ text: "EGAD00001000822 / EGAS00001000662 (PPB)" }]])
  })

  it("takes the value away once no language holds anything", () => {
    const moved = dataset([{ keyId: "key-dra", ja: rich("JGAS000205: BRDB01000001-BRDB01028816"), en: rich("JGAS000205: BRDB01000001-BRDB01028816") }])
    const edits: ValueEdit[] = (["ja", "en"] as const).flatMap((lang): ValueEdit[] => [
      { op: "set", hum: "hum0197", key: "dra", lang, was: "JGAS000205: BRDB01000001-BRDB01028816", markdown: "" },
      { op: "add", hum: "hum0197", key: "insdc", lang, markdown: "BRDB01000001-BRDB01028816", besideKey: "dra", besideWas: "JGAS000205: BRDB01000001-BRDB01028816" },
    ])
    const edited = editValues(moved, "hum0197", edits, keyIdOf, new Set())

    expect(textOf(edited, "key-dra", "ja")).toBeUndefined()
    expect(textOf(edited, "key-insdc", "en")).toEqual([[{ text: "BRDB01000001-BRDB01028816" }]])
  })

  it("leaves another research, and a value whose text differs, as they were", () => {
    const one: ValueEdit = { op: "set", hum: "hum0035", key: "jga", lang: "ja", was: "JGAD000088", markdown: "x" }
    expect(editValues(held, "hum0001", [one], keyIdOf, new Set())).toBe(held)
    expect(editValues(held, "hum0035", [one], keyIdOf, new Set())).toBe(held)
  })

  it("lands an edit that names a dataset on that dataset only", () => {
    const was = "JGAD000036\nEGAD00001000822 / EGAS00001000662（PPB）"
    const one: ValueEdit = { op: "set", hum: "hum0035", dataset: "hum0035.v1.gwas.v1", key: "jga", lang: "ja", was, markdown: "" }
    const applied = new Set<ValueEdit>()

    expect(editValues(held, "hum0035", [one], keyIdOf, applied)).toBe(held)
    expect(editValues(held, "hum0035", [one], keyIdOf, applied, new Set(["NHA000001", "JGAD000036"]))).toBe(held)
    expect(applied.size).toBe(0)
    const edited = editValues(held, "hum0035", [one], keyIdOf, applied, new Set(["NHA000001", "hum0035.v1.gwas.v1"]))

    expect(textOf(edited, "key-jga", "ja")).toEqual([])
    expect(applied.has(one)).toBe(true)
  })

  it("takes out a value both languages of which are emptied", () => {
    const edits: ValueEdit[] = [
      { op: "set", hum: "hum0035", key: "jga", lang: "ja", was: "JGAD000036\nEGAD00001000822 / EGAS00001000662（PPB）", markdown: "" },
      { op: "set", hum: "hum0035", key: "jga", lang: "en", was: "JGAD000036\nEGAD00001000822 / EGAS00001000662 (PPB)", markdown: "" },
    ]

    expect(textOf(editValues(held, "hum0035", edits, keyIdOf, new Set()), "key-jga", "ja")).toBeUndefined()
  })

  it("stops on a key the catalog does not have", () => {
    expect(() => editValues(held, "hum0035", [{ op: "set", hum: "hum0035", key: "nope", lang: "ja", was: "x", markdown: "y" }], keyIdOf, new Set()))
      .toThrow(/nope/)
  })
})

describe("assertValueEditsApplied", () => {
  it("stops on an edit that found nothing", () => {
    const edits: ValueEdit[] = [{ op: "set", hum: "hum0035", key: "jga", lang: "ja", was: "JGAD000088", markdown: "x" }]
    expect(() => {
      assertValueEditsApplied(edits, new Set())
    }).toThrow(/hum0035 jga ja/)
    expect(() => {
      assertValueEditsApplied(edits, new Set(edits))
    }).not.toThrow()
  })

  describe("drop-numbers", () => {
    const number = (ja: string | null, value: number) => ({ label: ja === null ? null : { ja, en: ja }, value, unit: "SNVs", inputValue: value, inputUnit: "SNVs", high: null, inputHigh: null, note: null })
    const counted = (...numbers: ReturnType<typeof number>[]) => ({
      datasetId: "d-1",
      experiments: [{ id: "experiment-1", values: [{ keyId: "key-variants", value: { kind: "number" as const, values: { state: "value" as const, value: numbers } } }] }],
    })
    const keys = (code: string) => (code === "variants" ? "key-variants" : undefined)
    const labelsOf = (content: ReturnType<typeof counted>) => {
      const value = content.experiments[0]?.values[0]?.value
      return value === undefined ? undefined : value.values.value.map((one) => one.label?.ja ?? null)
    }

    it("takes out the numbers under the labels named and keeps the rest in their order", () => {
      const edit: ValueEdit = { op: "drop-numbers", hum: "hum0014", key: "variants", labels: ["男性X染色体(喫煙本数)", "女性X染色体(喫煙本数)"] }
      const applied = new Set<ValueEdit>()
      const out = editValues(counted(number("常染色体", 1), number("男性X染色体(喫煙本数)", 2), number(null, 3), number("女性X染色体(喫煙本数)", 4)), "hum0014", [edit], keys, applied)

      expect(labelsOf(out)).toEqual(["常染色体", null])
      expect(applied.has(edit)).toBe(true)
    })

    it("does not land where one of the labels is not there", () => {
      const edit: ValueEdit = { op: "drop-numbers", hum: "hum0014", key: "variants", labels: ["男性X染色体(喫煙本数)", "Y染色体"] }
      const applied = new Set<ValueEdit>()
      const content = counted(number("常染色体", 1), number("男性X染色体(喫煙本数)", 2))

      expect(editValues(content, "hum0014", [edit], keys, applied)).toBe(content)
      expect(applied.size).toBe(0)
      expect(() => {
        assertValueEditsApplied([edit], applied)
      }).toThrow("男性X染色体(喫煙本数), Y染色体")
    })

    it("takes the key out where no number is left", () => {
      const edit: ValueEdit = { op: "drop-numbers", hum: "hum0014", key: "variants", labels: ["常染色体"] }
      const out = editValues(counted(number("常染色体", 1)), "hum0014", [edit], keys, new Set())

      expect(out.experiments[0]?.values).toEqual([])
    })

    it("lands only on the dataset named", () => {
      const edit: ValueEdit = { op: "drop-numbers", hum: "hum0014", dataset: "hum0014.v14.asi.v1", key: "variants", labels: ["常染色体"] }
      const content = counted(number("常染色体", 1))

      expect(editValues(content, "hum0014", [edit], keys, new Set(), new Set(["hum0014.v14.cpd.v1"]))).toBe(content)
      expect(labelsOf(editValues(content, "hum0014", [edit], keys, new Set(), new Set(["hum0014.v14.asi.v1"])))).toBeUndefined()
    })
  })
})
