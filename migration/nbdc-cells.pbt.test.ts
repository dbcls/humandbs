import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Bilingual, DatasetContent, Line, RichText, ValueSlot } from "~/content/types"

import { settleNbdcCells, type NbdcCellContext } from "./nbdc-cells"

const KEY = "key-nbdc"
const OWN = ["NHA000001", "hum0001.v1.gwas.v1"]
const LABELS: Record<string, Bilingual> = {
  "dict.xlsx": { ja: "Dictionary file", en: "Dictionary file" },
  "freq.zip": { ja: "アレル頻度", en: "Allele frequencies" },
}
/** Words no label, ID or list mark holds. */
const STRAY = ["染色毎", "Case", "注記", "追加分", "see"]

const context: NbdcCellContext = {
  keyId: KEY,
  hum: "hum0001",
  labelsOf: (id) => (id === "d-1" ? new Set(OWN) : id === "d-2" ? new Set(["NHA000002"]) : undefined),
  stored: (name) => name !== "gone.zip",
  labelOf: (name) => LABELS[name],
}

const piece: fc.Arbitrary<Line> = fc.oneof(
  fc.constantFrom(...OWN).map((id) => [{ text: id }]),
  fc.constantFrom(...OWN).map((id) => [{ text: id, href: "/files/hum0001/gwas.zip" }]),
  fc.constantFrom("dict.xlsx", "freq.zip", "readme.txt", "gone.zip").map((name) => [{ text: LABELS[name]?.ja ?? name, href: `/files/hum0001/${name}` }]),
  fc.constant<Line>([{ text: "JGAD000101", href: "https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000101" }]),
  fc.constantFrom("【GWAS】", "・", "1.", "").map((text) => [{ text }]),
  fc.constantFrom(...STRAY).map((text) => [{ text }]),
)
const lines: fc.Arbitrary<RichText> = fc.array(piece, { minLength: 1, maxLength: 6 })

const cell = (ja: RichText, en: RichText): ValueSlot =>
  ({ keyId: KEY, value: { kind: "text", text: { ja: { state: "value", value: ja }, en: { state: "value", value: en } } } })
const datasetOf = (datasetId: string, cells: [RichText, RichText][], fileSelection: string[]): DatasetContent & { datasetId: string } => ({
  datasetId,
  releaseDate: null,
  fileSelection,
  values: [],
  experiments: cells.map(([ja, en], i) => ({ id: `experiment-${String(i)}`, label: { state: "value", value: "GWAS" }, values: [cell(ja, en)] })),
})
const research = fc.record({
  cells: fc.array(fc.tuple(lines, lines), { minLength: 1, maxLength: 3 }),
  selection: fc.uniqueArray(fc.constantFrom("a.txt", "dict.xlsx", "gwas.zip"), { maxLength: 3 }).map((names) => names.toSorted()),
  sibling: fc.array(fc.tuple(lines, lines), { maxLength: 2 }),
}).map(({ cells, selection, sibling }) => [datasetOf("d-1", cells, selection), datasetOf("d-2", sibling, []), datasetOf("JGAD000001", cells, [])])

const filesOf = (text: RichText) => text.flat().flatMap((span) => (span.href?.startsWith("/files/hum0001/") ? [span.href.slice("/files/hum0001/".length)] : []))
const wordsOf = (text: RichText) => text.flat().filter((span) => span.href === undefined).map((span) => span.text)

describe("settleNbdcCells", () => {
  it("only adds to a selection, files the prefix holds that the dataset's cells link, in the prefix's order", () => {
    fc.assert(fc.property(research, (datasets) => {
      const out = settleNbdcCells(datasets, context)
      datasets.forEach((one, i) => {
        const now = out.datasets[i]?.fileSelection ?? []
        expect(now).toEqual(now.toSorted())
        expect(now).toEqual(expect.arrayContaining(one.fileSelection))
        const linked = new Set(one.experiments.flatMap((experiment) => experiment.values.flatMap((slot) =>
          slot.value.kind === "text" && slot.value.text.ja.state === "value" && slot.value.text.en.state === "value"
            ? [...filesOf(slot.value.text.ja.value), ...filesOf(slot.value.text.en.value)]
            : [])))
        for (const name of now.filter((name) => !one.fileSelection.includes(name))) {
          expect(linked.has(name) && context.stored(name)).toBe(true)
        }
      })
      expect(out.datasets[2]).toBe(datasets[2])
    }))
  })

  it("takes out no cell that links a file none of the research's datasets selects, or holds a stray word", () => {
    fc.assert(fc.property(research, (datasets) => {
      const out = settleNbdcCells(datasets, context)
      const selected = new Set(out.datasets.flatMap((one) => one.fileSelection))
      for (const gone of out.dropped) {
        const text = [...gone.ja, ...gone.en].join("\n")
        for (const word of STRAY) expect(text.includes(word)).toBe(false)
      }
      datasets.forEach((one, i) => {
        const after = new Set(out.datasets[i]?.experiments.flatMap((experiment) => experiment.values) ?? [])
        for (const experiment of one.experiments) {
          for (const slot of experiment.values) {
            if (after.has(slot) || slot.value.kind !== "text") continue
            const { ja, en } = slot.value.text
            if (ja.state !== "value" || en.state !== "value") continue
            const dropped = [...ja.value, ...en.value]
            const kept = out.datasets[i]?.experiments.find((one) => one.id === experiment.id)?.values.find((one) => one.keyId === KEY)
            const left = kept?.value.kind === "text" && kept.value.text.ja.state === "value" && kept.value.text.en.state === "value"
              ? new Set([...kept.value.text.ja.value, ...kept.value.text.en.value].map((l) => JSON.stringify(l)))
              : new Set<string>()
            const gone = dropped.filter((l) => !left.has(JSON.stringify(l)))
            for (const name of filesOf(gone)) expect(selected.has(name)).toBe(true)
            for (const word of wordsOf(gone)) expect(STRAY.includes(word)).toBe(false)
          }
        }
      })
    }))
  })

  it("changes nothing when applied again", () => {
    fc.assert(fc.property(research, (datasets) => {
      const once = settleNbdcCells(datasets, context).datasets
      const twice = settleNbdcCells(once, context)
      expect(twice.datasets).toEqual(once)
      expect(twice.selected).toEqual([])
    }))
  })
})
