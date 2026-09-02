import { describe, expect, it } from "vitest"

import type { ContentValue, ValueSlot } from "~/content/types"
import type { DsBranchDetail, JgadRegistration } from "~/upstream/application-db.server"
import type { DraSubmission } from "~/upstream/dra.server"

import {
  ACCESS_KEY,
  catalogFixture,
  DISEASE_KEY,
  METHOD_KEY,
  PLATFORM_KEY,
  READ_LENGTH_KEY,
  READ_TYPE_KEY,
  TYPE_KEY,
} from "./arbitraries/upstream"
import { draDatasetSeed, icd10Codes, jgadDatasetSeed, researchContentFrom } from "./templates"

const branch: DsBranchDetail = {
  applicationId: "J-DS000136-010",
  humLabel: "hum0522",
  approvedOn: "2024-05-18",
  titleJa: "ゲノム解析による疾患研究",
  titleEn: "A genome study",
  piNameJa: "田中 太郎",
  piNameEn: "Taro Tanaka",
  accessions: ["JGAD000891", "JGAS000720"],
  aimsJa: "目的です",
  aimsEn: "",
  methodsJa: "方法です",
  methodsEn: "The methods",
  targetsJa: "対象者です",
  targetsEn: "The participants",
  affiliationJa: "内科, 大学",
  affiliationEn: "Internal Medicine, University",
  country: "Japan",
  dataAccess: 2,
  icd10: "C34.9, E11.0",
}

const registration: JgadRegistration = {
  accession: "JGAD000891",
  title: "Whole genome sequencing of a cohort",
  datasetType: "WGS",
}

function valueUnder(values: ValueSlot[], keyId: string): ContentValue | undefined {
  return values.find((slot) => slot.keyId === keyId)?.value
}

function termsUnder(values: ValueSlot[], keyId: string): string[] {
  const value = valueUnder(values, keyId)
  if (value?.kind !== "vocabulary" || value.termIds.state !== "value") return []
  return value.termIds.value
}

describe("the ICD10 codes an application states", () => {
  it("reads codes written with the point and without it as the same code", () => {
    expect(icd10Codes("C34.9")).toEqual(["C349"])
    expect(icd10Codes("C349")).toEqual(["C349"])
  })

  it("splits on both widths of comma, on semicolons and on spaces", () => {
    expect(icd10Codes("D469, C920")).toEqual(["D469", "C920"])
    expect(icd10Codes("F00、F06.7")).toEqual(["F00", "F067"])
    expect(icd10Codes("C25.3 D13.6")).toEqual(["C253", "D136"])
  })

  it("leaves out what is not shaped like a code, which the box is full of", () => {
    expect(icd10Codes("-")).toEqual([])
    expect(icd10Codes("dummy")).toEqual([])
    expect(icd10Codes("")).toEqual([])
  })

  it("names a code once however many times it is written", () => {
    expect(icd10Codes("C253, C25.3, c253")).toEqual(["C253"])
  })
})

describe("the research an application seeds", () => {
  it("writes no email and no ORCID, which are what the public API would carry", () => {
    const provider = researchContentFrom(branch).dataProviders[0]

    expect(provider?.email).toEqual({ state: "value", value: "" })
    expect(provider?.orcid).toEqual({ state: "value", value: "" })
  })

  it("writes one provider, the investigator, and not whoever filed the application", () => {
    expect(researchContentFrom(branch).dataProviders).toHaveLength(1)
  })

  it("writes no provider at all when the application names nobody", () => {
    const nameless = { ...branch, piNameJa: "", piNameEn: "" }

    expect(researchContentFrom(nameless).dataProviders).toEqual([])
  })

  it("writes no publications, projects or grants, which the application does not hold", () => {
    const content = researchContentFrom(branch)

    expect(content.relatedPublications).toEqual([])
    expect(content.researchProjects).toEqual([])
    expect(content.grants).toEqual([])
  })

  it("leaves a language the application did not fill in empty rather than unsettled", () => {
    const content = researchContentFrom(branch)

    expect(content.summary.aims.ja).toEqual({ state: "value", value: [[{ text: "目的です" }]] })
    expect(content.summary.aims.en).toEqual({ state: "value", value: [] })
  })

  it("keeps free text as it was typed rather than reading it as markdown", () => {
    const written = researchContentFrom({ ...branch, aimsJa: "- 1つ目\n\n# 見出しではない" })

    expect(written.summary.aims.ja).toEqual({
      state: "value",
      value: [[{ text: "- 1つ目" }], [], [{ text: "# 見出しではない" }]],
    })
  })

  it("lists no datasets, because which ones are made is chosen separately", () => {
    expect(researchContentFrom(branch).datasetIds).toEqual([])
  })
})

describe("the dataset a JGA registration seeds", () => {
  it("takes its id from the accession", () => {
    expect(jgadDatasetSeed(registration, branch, catalogFixture).label).toBe("JGAD000891")
  })

  it("carries no date, because the archive's own is what the page shows", () => {
    expect(jgadDatasetSeed(registration, branch, catalogFixture).content.releaseDate).toBeNull()
  })

  it("writes the access type the application's number means", () => {
    const seed = jgadDatasetSeed(registration, branch, catalogFixture)

    expect(termsUnder(seed.content.values, ACCESS_KEY)).toEqual(["set-access/controlled-access-type-1"])
  })

  it("writes no access type for an application covering both, which says nothing about one dataset", () => {
    const seed = jgadDatasetSeed(registration, { ...branch, dataAccess: 3 }, catalogFixture)

    expect(termsUnder(seed.content.values, ACCESS_KEY)).toEqual([])
  })

  it("writes no access type when no application could be resolved", () => {
    const seed = jgadDatasetSeed(registration, null, catalogFixture)

    expect(termsUnder(seed.content.values, ACCESS_KEY)).toEqual([])
  })

  it("carries one experiment, which is what a published dataset holds four times in five", () => {
    expect(jgadDatasetSeed(registration, branch, catalogFixture).content.experiments).toHaveLength(1)
  })

  it("labels the experiment with the assay, and falls back to the title where there is none", () => {
    const withAssay = jgadDatasetSeed(registration, branch, catalogFixture)
    const without = jgadDatasetSeed({ ...registration, datasetType: "" }, branch, catalogFixture)

    expect(withAssay.content.experiments[0]?.label).toEqual({ state: "value", value: "WGS" })
    expect(without.content.experiments[0]?.label)
      .toEqual({ state: "value", value: "Whole genome sequencing of a cohort" })
  })

  it("writes the diseases the application states onto the experiment", () => {
    const seed = jgadDatasetSeed(registration, branch, catalogFixture)

    expect(termsUnder(seed.content.experiments[0]?.values ?? [], DISEASE_KEY))
      .toEqual(["set-disease/C349", "set-disease/E110"])
  })

  it("names a disease the catalog has no term for instead of writing it", () => {
    const unknown = { ...branch, icd10: "Z999" }
    const seed = jgadDatasetSeed(registration, unknown, catalogFixture)

    expect(termsUnder(seed.content.experiments[0]?.values ?? [], DISEASE_KEY)).toEqual([])
    expect(seed.dropped).toContainEqual({ keyCode: "disease-icd10", value: "Z999" })
  })

  it("names an assay the catalog has no term for instead of minting one", () => {
    const seed = jgadDatasetSeed(
      { ...registration, datasetType: "Exome sequencing" },
      branch,
      catalogFixture,
    )

    expect(termsUnder(seed.content.experiments[0]?.values ?? [], METHOD_KEY)).toEqual([])
    expect(seed.dropped).toContainEqual({
      keyCode: "experimental-method",
      value: "Exome sequencing",
    })
  })

  it("writes the assay as the type of data as well, which is what a reader sees", () => {
    const seed = jgadDatasetSeed(registration, branch, catalogFixture)

    expect(valueUnder(seed.content.values, TYPE_KEY)).toEqual({
      kind: "text",
      text: {
        ja: { state: "value", value: [[{ text: "WGS" }]] },
        en: { state: "value", value: [[{ text: "WGS" }]] },
      },
    })
  })
})

describe("the dataset a DRA submission seeds", () => {
  const submission: DraSubmission = {
    accession: "DRA000123",
    title: "A transcriptome study",
    groups: [
      {
        strategy: "WGS",
        instrumentModels: ["Illumina HiSeq 2500", "DNBSEQ-T7"],
        layout: "PAIRED",
        readLength: 150,
      },
      { strategy: "RNA-Seq", instrumentModels: [], layout: "SINGLE", readLength: null },
    ],
    unreachable: [],
  }

  it("is unrestricted, which is what the archive is", () => {
    const seed = draDatasetSeed(submission, null, catalogFixture)

    expect(termsUnder(seed.content.values, ACCESS_KEY)).toEqual(["set-access/unrestricted-access"])
  })

  it("carries one experiment per strategy, not one per library", () => {
    const seed = draDatasetSeed(submission, null, catalogFixture)

    expect(seed.content.experiments.map((one) => one.label))
      .toEqual([{ state: "value", value: "WGS" }, { state: "value", value: "RNA-Seq" }])
  })

  it("writes the instrument models the catalog knows and names the rest", () => {
    const seed = draDatasetSeed(submission, null, catalogFixture)

    expect(termsUnder(seed.content.experiments[0]?.values ?? [], PLATFORM_KEY))
      .toEqual(["set-platform/illumina-hiseq-2500"])
    expect(seed.dropped).toContainEqual({ keyCode: "platform", value: "DNBSEQ-T7" })
  })

  it("writes the layout as the catalog spells it rather than as the archive does", () => {
    const seed = draDatasetSeed(submission, null, catalogFixture)

    expect(termsUnder(seed.content.experiments[0]?.values ?? [], READ_TYPE_KEY))
      .toEqual(["set-read-type/paired-end"])
  })

  it("writes the read length in the unit the key is stored in, keeping what was read", () => {
    const seed = draDatasetSeed(submission, null, catalogFixture)

    expect(valueUnder(seed.content.experiments[0]?.values ?? [], READ_LENGTH_KEY)).toEqual({
      kind: "number",
      values: {
        state: "value",
        value: [{ label: null, value: 150, unit: "bp", inputValue: 150, inputUnit: "bp", note: null }],
      },
    })
  })

  it("writes no read length where the libraries did not agree on one", () => {
    const seed = draDatasetSeed(submission, null, catalogFixture)

    expect(valueUnder(seed.content.experiments[1]?.values ?? [], READ_LENGTH_KEY)).toBeUndefined()
  })

  it("still gives somewhere to write when no library could be read at all", () => {
    const empty = { ...submission, groups: [], unreachable: ["DRX000001"] }

    expect(draDatasetSeed(empty, null, catalogFixture).content.experiments).toHaveLength(1)
  })

  it("carries no date, because the archive's own is what the page shows", () => {
    expect(draDatasetSeed(submission, null, catalogFixture).content.releaseDate).toBeNull()
  })
})
