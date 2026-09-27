import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { Bilingual, DatasetContent, NumberValue, ValueSlot } from "~/content/types"

import { type NoteLookup, withoutRepeatedNotes } from "./number-notes"

const lookup: NoteLookup = {
  keyIdOf: (code) => `key:${code}`,
  termCodeOf: (setCode, termId) => (termId.startsWith(`${setCode}/`) ? termId.slice(setCode.length + 1) : undefined),
}

const terms = (setCode: string, ...codes: string[]): ValueSlot => ({
  keyId: `key:${setCode}`,
  value: { kind: "vocabulary", termIds: { state: "value", value: codes.map((code) => `${setCode}/${code}`) } },
})

const number = (note: Bilingual | null, label: Bilingual | null = null): NumberValue => ({
  label, value: 495887, unit: "SNPs", inputValue: 495887, inputUnit: "SNPs", high: null, inputHigh: null, note,
})

const numbers = (key: string, ...values: NumberValue[]): ValueSlot => ({
  keyId: `key:${key}`,
  value: { kind: "number", values: { state: "value", value: values } },
})

const described = (...values: ValueSlot[]): Pick<DatasetContent, "experiments"> => ({
  experiments: [{ id: "experiment-1", label: { state: "value", value: "GWAS" }, values }],
})

const same = (said: string): Bilingual => ({ ja: said, en: said })

function notesOf(content: Pick<DatasetContent, "experiments">, key: string): (Bilingual | null)[] {
  const slot = content.experiments[0]?.values.find((one) => one.keyId === `key:${key}`)?.value
  return slot?.kind === "number" && slot.values.state === "value" ? slot.values.value.map((one) => one.note) : []
}

describe("withoutRepeatedNotes", () => {
  it("takes a genome out of a count's note where the experiment has that genome as a term", () => {
    const content = described(terms("reference-sequence", "grch37"), numbers("variant-number",
      number(same("hg19")),
      number({ ja: "約 hg19", en: "Approx. hg19" }),
      number({ ja: "男性 hg19", en: "for male hg19" }),
      number(same("ref: GRCh37.p13")),
      number({ ja: "CpGs 常染色体上、reference [hg19]", en: "CpGs on autosomes, reference [hg19]" }),
      number(same("reference sequence: hg19")),
    ))

    const { content: out, changes } = withoutRepeatedNotes(content, lookup)

    expect(notesOf(out, "variant-number")).toEqual([
      null,
      { ja: "約", en: "Approx." },
      { ja: "男性", en: "for male" },
      null,
      { ja: "CpGs 常染色体上", en: "CpGs on autosomes" },
      null,
    ])
    expect(changes).toHaveLength(6)
  })

  it("reads an older build and a genome in brackets of its own", () => {
    const content = described(terms("reference-sequence", "ncbi36"), numbers("variant-number",
      number({ ja: "常染色体のSNP（NCBI Build 36.3）", en: "autosomal SNPs NCBI Build 36.3" }),
      number({ ja: "HLA領域を除く常染色体のSNP（hg18）", en: "autosomal non-HLA SNPs hg18" }),
      number(same("hg18/GRCh36")),
    ))

    expect(notesOf(withoutRepeatedNotes(content, lookup).content, "variant-number")).toEqual([
      { ja: "常染色体のSNP", en: "autosomal SNPs" },
      { ja: "HLA領域を除く常染色体のSNP", en: "autosomal non-HLA SNPs" },
      null,
    ])
  })

  it("keeps a note naming a genome the experiment does not have, or where it has none", () => {
    const disagreeing = described(terms("reference-sequence", "grch38"), numbers("variant-number", number(same("hg19"))))
    const termless = described(numbers("variant-number", number(same("hg19"))))

    expect(withoutRepeatedNotes(disagreeing, lookup)).toEqual({ content: disagreeing, changes: [] })
    expect(withoutRepeatedNotes(termless, lookup)).toEqual({ content: termless, changes: [] })
  })

  it("keeps a note naming no genome, such as a dbSNP build", () => {
    const content = described(terms("reference-sequence", "grch37"), numbers("variant-number",
      number({ ja: "約 b129", en: "Approx. b129" }),
      number(same("GWAS-1")),
    ))

    expect(withoutRepeatedNotes(content, lookup).changes).toEqual([])
  })

  it("keeps a note where one of the genomes it names is not the experiment's", () => {
    const content = described(terms("reference-sequence", "grch38"), numbers("variant-number", number(same("hg19/hg38"))))

    expect(withoutRepeatedNotes(content, lookup).changes).toEqual([])
  })

  it("takes the two reads of a pair out of a read length's note only where the read type is paired-end", () => {
    const written = ["x 2", "x2", "2 ×", "2 x", "× 2"].map((said) => number(same(said)))
    const paired = described(terms("read-type", "paired-end"), numbers("read-length",
      ...written,
      number({ ja: "ペアエンド(x2)", en: "Paired-end (x2)" }),
      number(same("PE")),
      number(same("Read1")),
    ))
    const single = described(terms("read-type", "single-end"), numbers("read-length", number(same("x 2"))))

    expect(notesOf(withoutRepeatedNotes(paired, lookup).content, "read-length")).toEqual([
      null, null, null, null, null, null, same("PE"), same("Read1"),
    ])
    expect(withoutRepeatedNotes(single, lookup).changes).toEqual([])
  })

  it("leaves the notes of other keys as they are", () => {
    const content = described(terms("reference-sequence", "grch37"), terms("read-type", "paired-end"),
      numbers("total-data-volume", number(same("bam [ref: hg19]"))),
      numbers("coverage-depth", number(same("x 2"))))

    expect(withoutRepeatedNotes(content, lookup)).toEqual({ content, changes: [] })
    expect(withoutRepeatedNotes(content, lookup).content).toBe(content)
  })

  it("does not look at a genome in a note of a read length", () => {
    const content = described(terms("reference-sequence", "grch37"), numbers("read-length", number(same("hg19"))))

    expect(withoutRepeatedNotes(content, lookup).changes).toEqual([])
  })

  it("puts a sign into words, and the words before it into the label where there is none", () => {
    const content = described(numbers("coverage-depth",
      number(same(">")),
      number(same("≥")),
      number({ ja: "ユニークにマップされたリードの割合 >", en: "Uniquely mapped reads >" }),
      number({ ja: "総深度 ≥", en: "Total depth ≥" }, same("RNA")),
      number({ ja: "14症例 腫瘍> , 正常>30×", en: "14 cases, tumor >, normal >30x" }),
      number({ ja: ">", en: "≥" }),
    ))

    const { content: out, changes } = withoutRepeatedNotes(content, lookup)
    const slot = out.experiments[0]?.values[0]?.value
    const got = slot?.kind === "number" && slot.values.state === "value" ? slot.values.value.map((one) => [one.label, one.note]) : []

    expect(got).toEqual([
      [null, { ja: "超", en: "More than" }],
      [null, { ja: "以上", en: "Or more" }],
      [{ ja: "ユニークにマップされたリードの割合", en: "Uniquely mapped reads" }, { ja: "超", en: "More than" }],
      [same("RNA"), { ja: "総深度 ≥", en: "Total depth ≥" }],
      [null, { ja: "14症例 腫瘍> , 正常>30×", en: "14 cases, tumor >, normal >30x" }],
      [null, { ja: ">", en: "≥" }],
    ])
    expect(changes).toHaveLength(3)
  })

  it("puts the sign into words after the genome is taken out", () => {
    const content = described(terms("reference-sequence", "grch37"), numbers("variant-number", number({ ja: "hg19 >", en: "hg19 >" })))

    expect(notesOf(withoutRepeatedNotes(content, lookup).content, "variant-number")).toEqual([{ ja: "超", en: "More than" }])
  })

  it("leaves a key that is unknown or not applicable as it is", () => {
    const content = described(terms("reference-sequence", "grch37"),
      { keyId: "key:variant-number", value: { kind: "number", values: { state: "unknown" } } })

    expect(withoutRepeatedNotes(content, lookup)).toEqual({ content, changes: [] })
  })

  const noteArb = fc.oneof(
    fc.constant(null),
    fc.record({
      ja: fc.oneof(fc.constantFrom("hg19", "約 hg19", "男性 hg19", "x 2", "ref: GRCh37.p13", "", "b129"), fc.string()),
      en: fc.oneof(fc.constantFrom("hg19", "Approx. hg19", "x2", "reference [hg38]", ""), fc.string()),
    }),
  )
  const numberArb = fc.record({ note: noteArb, label: fc.option(fc.record({ ja: fc.string(), en: fc.string() }), { nil: null }), value: fc.double({ noNaN: true }) })
    .map(({ note, label, value }): NumberValue => ({ ...number(note, label), value, inputValue: value }))
  const contentArb = fc.record({
    genomes: fc.subarray(["grch37", "grch38", "ncbi36"]),
    readTypes: fc.subarray(["paired-end", "single-end", "mixed"]),
    counts: fc.array(numberArb, { maxLength: 5 }),
    lengths: fc.array(numberArb, { maxLength: 5 }),
  }).map(({ genomes, readTypes, counts, lengths }) => described(
    terms("reference-sequence", ...genomes),
    terms("read-type", ...readTypes),
    numbers("variant-number", ...counts),
    numbers("read-length", ...lengths),
  ))

  it("changes nothing but the notes, and a label only where there was none", () => {
    fc.assert(fc.property(contentArb, (content) => {
      const { content: out } = withoutRepeatedNotes(content, lookup)
      const without = (one: Pick<DatasetContent, "experiments">) => JSON.parse(JSON.stringify(one, (key, value: unknown) => (key === "note" || key === "label" ? undefined : value))) as unknown
      const labels = (one: Pick<DatasetContent, "experiments">) => one.experiments[0]?.values.flatMap((slot) => (slot.value.kind === "number" && slot.value.values.state === "value" ? slot.value.values.value.map((number) => number.label) : [])) ?? []

      expect(without(out)).toEqual(without(content))
      labels(content).forEach((label, at) => {
        if (label !== null) expect(labels(out)[at]).toEqual(label)
      })
      expect(out.experiments[0]?.label).toEqual(content.experiments[0]?.label)
    }))
  })

  it("changes nothing the second time", () => {
    fc.assert(fc.property(contentArb, (content) => {
      const once = withoutRepeatedNotes(content, lookup).content

      expect(withoutRepeatedNotes(once, lookup)).toEqual({ content: once, changes: [] })
    }))
  })
})
