import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Bilingual, Line, RichText } from "~/content/types"

import type { SourceDatasetContent, SourceNumber, SourceValueSlot } from "./number-words"
import { type OwnIdContext, withoutOwnIds } from "./own-ids"

const own = new Set(["JGAD000696", "JGAS000570", "hum0068.v5.mfi.v1"])
const context: OwnIdContext = { own, skippedKeys: new Set(["key:processed-data-dataset-id"]) }

const plain = (...lines: string[]): RichText => lines.map((text) => (text === "" ? [] : [{ text }]))

const text = (key: string, ja: RichText, en: RichText): SourceValueSlot => ({
  keyId: `key:${key}`,
  value: { kind: "text", text: { ja: { state: "value", value: ja }, en: { state: "value", value: en } } },
})

const number = (label: Bilingual | null): SourceNumber => ({
  label, value: 100, unit: "bp", inputValue: 100, inputUnit: "bp", high: null, inputHigh: null, note: null,
})

const numbers = (key: string, ...values: SourceNumber[]): SourceValueSlot => ({
  keyId: `key:${key}`,
  value: { kind: "number", values: { state: "value", value: values } },
})

const described = (...values: SourceValueSlot[]): SourceDatasetContent => ({
  releaseDate: null,
  fileSelection: [],
  values: [],
  experiments: [{ id: "experiment-1", label: { state: "value", value: "RNA-seq" }, values }],
})

function textOf(content: SourceDatasetContent, key: string, lang: "ja" | "en"): string[] {
  const slot = content.experiments[0]?.values.find((one) => one.keyId === `key:${key}`)?.value
  if (slot?.kind !== "text") return []
  const side = slot.text[lang]
  return side.state === "value" ? side.value.map((line) => line.map((span) => span.text).join("")) : []
}

function labelsOf(content: SourceDatasetContent, key: string): (Bilingual | null)[] {
  const slot = content.experiments[0]?.values.find((one) => one.keyId === `key:${key}`)?.value
  return slot?.kind === "number" && slot.values.state === "value" ? slot.values.value.map((one) => one.label) : []
}

describe("withoutOwnIds", () => {
  it("takes the dataset's own ID out of the end of a line, in brackets or after for", () => {
    const content = described(text("targets", plain("Cycle/蛍光タンパク質対応表（JGAD000696）"), plain("cycle/probe information for JGAD000696")))

    const { content: out, changes } = withoutOwnIds(content, context)

    expect(textOf(out, "targets", "ja")).toEqual(["Cycle/蛍光タンパク質対応表"])
    expect(textOf(out, "targets", "en")).toEqual(["cycle/probe information"])
    expect(changes).toHaveLength(2)
  })

  it("keeps the link of a line whose ID it takes out", () => {
    const link: Line = [{ text: "Cycle/蛍光タンパク質対応表（JGAD000696）", href: "/files/hum0068/cycle_probe_info_JGAD000696.pdf" }]
    const content = described(text("targets", [link], []))

    const { content: out } = withoutOwnIds(content, context)

    const slot = out.experiments[0]?.values[0]?.value
    expect(slot?.kind === "text" && slot.text.ja.state === "value" ? slot.text.ja.value : null)
      .toEqual([[{ text: "Cycle/蛍光タンパク質対応表", href: "/files/hum0068/cycle_probe_info_JGAD000696.pdf" }]])
  })

  it("takes out the heading and the label before a line that name only the dataset and its study", () => {
    const content = described(text(
      "materials-and-participants",
      plain("肺がん（ICD10：C349）", "【オルガノイド】", "JGAS000570/JGAD000696：21症例", "【JGAD000696】腫瘍組織由来オルガノイド：2検体", "JGAD000696: 1 検体"),
      plain("lung cancer (ICD10: C349)", "[organoids]", "JGAS000570 / JGAD000696: 21 cases", "[JGAD000696] organoids: 2 samples", "hum0068.v5.mfi.v1: 1 sample"),
    ))

    const { content: out } = withoutOwnIds(content, context)

    expect(textOf(out, "materials-and-participants", "ja")).toEqual(["肺がん（ICD10：C349）", "【オルガノイド】", "21症例", "腫瘍組織由来オルガノイド：2検体", "1 検体"])
    expect(textOf(out, "materials-and-participants", "en")).toEqual(["lung cancer (ICD10: C349)", "[organoids]", "21 cases", "organoids: 2 samples", "1 sample"])
  })

  it("takes out a line that is only a heading naming the dataset", () => {
    const content = described(text("materials-and-participants", plain("【JGAS000570/JGAD000696】", "ATL：6症例"), plain("", "[JGAD000696]", "", "ATL: 6 cases")))

    const { content: out } = withoutOwnIds(content, context)

    expect(textOf(out, "materials-and-participants", "ja")).toEqual(["ATL：6症例"])
    expect(textOf(out, "materials-and-participants", "en")).toEqual(["ATL: 6 cases"])
  })

  it("leaves a cell that heads a line with another dataset's ID as it is", () => {
    const ja = plain("【JGAD000696】", "腫瘍：2検体", "【JGAD000807】", "腫瘍：3検体")
    const shared = plain("【JGAD000696/E-GEAD-414】腫瘍組織由来オルガノイド：22検体")
    const content = described(text("materials-and-participants", ja, shared))

    const { content: out, changes } = withoutOwnIds(content, context)

    expect(out).toEqual(content)
    expect(changes).toEqual([])
  })

  it("leaves the ID inside a sentence and a line that is the ID alone", () => {
    const ja = plain("1,026名のWGSデータ（JGAD000696）を含むvcfファイル", "23症例(うち2症例を再解析[JGAD000696])", "JGAD000696", "公開データ (JGAD000696) より取得")
    const content = described(text("materials-and-participants", ja, []))

    const { content: out } = withoutOwnIds(content, context)

    expect(out).toEqual(content)
  })

  it("does not read a longer ID that starts with the dataset's as the dataset's", () => {
    const content = described(text("targets", plain("対応表（JGAD0006961）", "JGAD0006960：2検体", "表 (hum0068.v5.mfi.v12)"), []))

    const { content: out } = withoutOwnIds(content, context)

    expect(out).toEqual(content)
  })

  it("leaves both sides where the other language still names the dataset", () => {
    const content = described(text("materials-and-participants", plain("日本人腸内微生物ゲノム", "公開データ (JGAD000696) より取得"), plain("Japanese gut microbiome", "Public data (JGAD000696)")))

    const { content: out } = withoutOwnIds(content, context)

    expect(out).toEqual(content)
  })

  it("takes the ID out of one side where the other language does not name the dataset", () => {
    const content = described(text("materials-and-participants", plain("非症候群性難聴(ICD10: H90): 16症例(JGAS000570)"), plain("16 non-syndromic hearing loss patients (ICD10: H90)")))

    const { content: out } = withoutOwnIds(content, context)

    expect(textOf(out, "materials-and-participants", "ja")).toEqual(["非症候群性難聴(ICD10: H90): 16症例"])
    expect(textOf(out, "materials-and-participants", "en")).toEqual(["16 non-syndromic hearing loss patients (ICD10: H90)"])
  })

  it("leaves the keys it is told to", () => {
    const content = described(text("processed-data-dataset-id", plain("【JGAD000696】", "加工方法はこちら"), []))

    const { content: out } = withoutOwnIds(content, context)

    expect(out).toEqual(content)
  })

  it("takes the dataset's ID out of the end of a number's label on each side", () => {
    const content = described(numbers("read-length",
      number({ ja: "乳がん(JGAD000696)", en: "Breast cancer (JGAD000696)" }),
      number({ ja: "肺腺がん（JGAD000696）", en: "Lung adenocarcinoma (JGAD000696)" }),
      number(null),
    ))

    const { content: out, changes } = withoutOwnIds(content, context)

    expect(labelsOf(out, "read-length")).toEqual([
      { ja: "乳がん", en: "Breast cancer" },
      { ja: "肺腺がん", en: "Lung adenocarcinoma" },
      null,
    ])
    // One for each label on each side.
    expect(changes).toHaveLength(4)
  })

  it("leaves a number's label that would be left empty or the same as another's", () => {
    const content = described(numbers("read-length",
      number({ ja: "JGAD000696(追加)", en: "JGAD000696 (additional)" }),
      number({ ja: "(JGAD000696)", en: "(JGAD000696)" }),
      number({ ja: "乳がん(JGAD000696)", en: "Breast cancer (JGAD000696)" }),
      number({ ja: "乳がん", en: "Breast cancer" }),
    ))

    const { content: out } = withoutOwnIds(content, context)

    expect(out).toEqual(content)
  })

  it("takes out only characters the dataset's IDs, their brackets, separators and the space around them make up", () => {
    const words = fc.constantFrom("腫瘍", "RNA", "2検体", "cases", "（", "）", "(", ")", "【", "】", "[", "]", "：", ": ", " for ", "/", "、", " ", "JGAD000807", "E-GEAD-414")
    const ids = fc.constantFrom(...own)
    const piece = fc.oneof(words, ids)
    const lineText = fc.array(piece, { maxLength: 6 }).map((parts) => parts.join(""))
    const cellText = fc.array(lineText, { minLength: 1, maxLength: 5 })

    fc.assert(fc.property(cellText, (lines) => {
      const content = described(text("materials-and-participants", plain(...lines), []))
      const { content: out } = withoutOwnIds(content, context)
      const before = lines.join("\n")
      const after = textOf(out, "materials-and-participants", "ja").join("\n")
      const idChars = new RegExp(`${[...own].map((id) => id.replace(/\./g, "\\.")).join("|")}|[（）()【】[\\]：:/、\\s]|for`, "g")
      // Every word that is not the dataset's is kept, in order.
      expect(after.replace(idChars, "")).toBe(before.replace(idChars, ""))
    }))
  })

  it("changes nothing a second time", () => {
    const piece = fc.constantFrom("【JGAD000696】", "JGAD000696：", "腫瘍：2検体", "（JGAD000696）", " for JGAD000696", "【JGAD000807】", "")
    const cellText = fc.array(fc.array(piece, { maxLength: 3 }).map((parts) => parts.join("")), { minLength: 1, maxLength: 5 })

    fc.assert(fc.property(cellText, (lines) => {
      const once = withoutOwnIds(described(text("materials-and-participants", plain(...lines), [])), context).content
      const twice = withoutOwnIds(once, context)
      expect(twice.changes).toEqual([])
    }))
  })
})
