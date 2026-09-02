import { describe, expect, it } from "vitest"

import type { EsSearchable } from "./es"
import type { TermSeed, VocabularyFacet } from "./facets"

import { collectTerms, DISEASE_SET, VOCABULARY_FACETS } from "./facets"

function facetNamed(code: string): VocabularyFacet {
  const facet = VOCABULARY_FACETS.find((one) => one.code === code)
  if (facet === undefined) throw new Error(`no facet is named ${code}`)
  return facet
}

interface Platform {
  vendor?: string | null
  model?: string | null
}

function platformTerms(...written: Platform[]): TermSeed[] {
  return facetNamed("platform").read({ platforms: written } satisfies EsSearchable)
}

function platformsOf(...written: Platform[]): string[] {
  return platformTerms(...written).map((term) => term.labelEn)
}

describe("a platform value naming more than one machine", () => {
  it("becomes one value per machine", () => {
    expect(platformsOf({ vendor: "Illumina", model: "HiSeq 2500/3000, NovaSeq 6000" }))
      .toEqual(["Illumina HiSeq 2500", "Illumina HiSeq 3000", "Illumina NovaSeq 6000"])
  })

  it("splits on the Japanese comma the free text it came from was written with", () => {
    expect(platformsOf({ vendor: "Illumina", model: "HumanOmniExpress、HumanExome、OmniExpressExome BeadChip" }))
      .toEqual([
        "Illumina HumanOmniExpress",
        "Illumina HumanExome",
        "Illumina OmniExpressExome BeadChip",
      ])
  })

  it("carries the maker onto each machine, so every label can be drawn apart", () => {
    expect(platformTerms({ vendor: "PacBio", model: "Sequel II/IIe" }).map((term) => term.maker))
      .toEqual(["PacBio", "PacBio"])
  })

  /**
   * A slash means "and" in `HiSeq 2000/2500` and belongs to the name itself in
   * `DNBSEQ-G400/T7`'s neighbours. Splitting on the character rather than on
   * the table would invent machines that were never sold.
   */
  it("leaves a slash that belongs to the name alone", () => {
    expect(platformsOf({ vendor: "Illumina", model: "HiSeq X Ten" })).toEqual(["Illumina HiSeq X Ten"])
    expect(platformsOf({ vendor: "MGI", model: "DNBSEQ-G400RS" })).toEqual(["MGI DNBSEQ-G400RS"])
    expect(platformsOf({ vendor: "Illumina", model: "HumanOmni2.5-8 BeadChip" }))
      .toEqual(["Illumina HumanOmni2.5-8 BeadChip"])
  })
})

describe("a platform value written a second way", () => {
  it("takes the spelling the vocabulary keeps", () => {
    expect(platformsOf({ vendor: "Illumina", model: "HiSeq X-10" })).toEqual(["Illumina HiSeq X Ten"])
  })

  it("drops the note a model carries in brackets", () => {
    expect(platformsOf({ vendor: "Illumina", model: "Asian Screening Array (ASA-24v1-0_A2)" }))
      .toEqual(["Illumina Asian Screening Array"])
  })

  it("does not write the maker twice where the dump writes it in both fields", () => {
    expect(platformsOf({ vendor: "Olink", model: "Olink Explore 3072" })).toEqual(["Olink Explore 3072"])
  })

  it("keeps a maker whose model is missing, which a reader can still refine by", () => {
    expect(platformsOf({ vendor: "Illumina", model: null })).toEqual(["Illumina"])
  })

  it("keeps a model whose maker is missing", () => {
    expect(platformsOf({ vendor: null, model: "DigiTag2 assay" })).toEqual(["DigiTag2 assay"])
  })

  it("yields nothing where neither is written", () => {
    expect(platformsOf({ vendor: null, model: null })).toEqual([])
  })

  it("yields nothing where the model is only the note it carries", () => {
    expect(platformsOf({ vendor: null, model: " (see above) " })).toEqual([])
  })
})

describe("the order the terms are numbered in", () => {
  it("puts one maker's machines together and orders the rest by label", () => {
    const held = collectTerms([{ platforms: [
      { vendor: "Oxford Nanopore Technologies", model: "PromethION" },
      { vendor: "Illumina", model: "NovaSeq 6000" },
      { vendor: "Illumina", model: "HiSeq 2500" },
      { vendor: "MGI", model: "DNBSEQ-G400" },
    ] }])
    expect((held.get("platform") ?? []).map((term) => term.labelEn)).toEqual([
      "Illumina HiSeq 2500",
      "Illumina NovaSeq 6000",
      "MGI DNBSEQ-G400",
      "Oxford Nanopore Technologies PromethION",
    ])
  })

  it("does not depend on the order the dump mentions the values in", () => {
    const one = collectTerms([{ platforms: [
      { vendor: "MGI", model: "DNBSEQ-T7" },
      { vendor: "Illumina", model: "MiSeq" },
    ] }])
    const other = collectTerms([{ platforms: [
      { vendor: "Illumina", model: "MiSeq" },
      { vendor: "MGI", model: "DNBSEQ-T7" },
    ] }])
    expect(held(one)).toEqual(held(other))
  })

  it("folds a machine named twice into one value", () => {
    const terms = collectTerms([
      { platforms: [{ vendor: "Illumina", model: "HiSeq 2000/2500" }] },
      { platforms: [{ vendor: "Illumina", model: "HiSeq 2500" }] },
    ])
    expect(held(terms)).toEqual(["Illumina HiSeq 2000", "Illumina HiSeq 2500"])
  })

  it("keeps parents before children, so that a child can point at one", () => {
    const codes = (collectTerms([{ diseases: [{ label: "breast", icd10: "C50.1" }] }])
      .get(DISEASE_SET) ?? []).map((term) => term.code)
    expect(codes).toContain("C501")
    expect(codes.indexOf("C50")).toBeLessThan(codes.indexOf("C501"))
  })
})

function held(terms: Map<string, TermSeed[]>): string[] {
  return (terms.get("platform") ?? []).map((term) => term.labelEn)
}
