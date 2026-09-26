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
})
