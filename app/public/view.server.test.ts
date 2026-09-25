import { describe, expect, it } from "vitest"

import type { CauUsage } from "~/content/public"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type {
  DataProvider,
  DatasetContent,
  ListingProvider,
  ResearchContent,
  Slot,
} from "~/content/types"

import {
  ACCESS_TYPE_KEY,
  TYPE_OF_DATA_KEY,
  datasetView,
  makerOf,
  researchListRowView,
  researchView,
  type CatalogKeyView,
  type CatalogView,
  type ResearchListRowInput,
  type ResearchListRowView,
  type VocabularyTermView,
} from "./view.server"

const UNKNOWN: Slot<never> = { state: "unknown" }
const NOT_APPLICABLE: Slot<never> = { state: "not-applicable" }

function key(id: string, code: string, position: number): CatalogKeyView {
  return { id, code, labelJa: `${code} ja`, labelEn: `${code} en`, position }
}

const KEYS = [
  key("k-access", ACCESS_TYPE_KEY, 0),
  key("k-type", TYPE_OF_DATA_KEY, 1),
  key("k-late", "late", 90),
  key("k-early", "early", 10),
]

const catalog: CatalogView = {
  keyById: new Map(KEYS.map((k) => [k.id, k])),
  keyByCode: new Map(KEYS.map((k) => [k.code, k])),
  termById: new Map([
    ["t-open", { code: "unrestricted-access", labelJa: "非制限公開", labelEn: "Unrestricted-access", maker: null, position: 0 }],
    ["t-en-only", { code: "en-only", labelJa: null, labelEn: "English only", maker: null, position: 1 }],
  ]),
}

function research(overrides: Partial<ResearchContent> = {}): ResearchContent {
  return { ...emptyResearchContent(), ...overrides }
}

function provider(overrides: Partial<DataProvider> = {}): DataProvider {
  return {
    id: "p1",
    name: { ja: filled(""), en: filled("") },
    organization: {
      name: { ja: filled(""), en: filled("") },
    },
    ...overrides,
  }
}

function viewOf(content: ResearchContent, locale: "ja" | "en" = "en", cau: CauUsage[] = []) {
  return researchView({
    humLabel: "hum0001",
    versionNumber: 2,
    releaseDate: "2020-01-01",
    latestVersionNumber: 2,
    content,
    datasets: [],
    datasetLabelById: new Map(),
    cau,
    files: { rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 },
  }, locale, catalog)
}

describe("the untranslated notice", () => {
  it("is off when nothing had to fall back", () => {
    const content = research({ title: { ja: filled("題"), en: filled("Title") } })
    expect(viewOf(content).untranslated).toBe(false)
  })

  it("is on when a rendered field showed the other language", () => {
    const content = research({ title: { ja: filled("題"), en: filled("") } })
    const view = viewOf(content)
    expect(view.untranslated).toBe(true)
    expect(view.title).toEqual({ state: "plain", text: "題", untranslated: true })
  })

  /**
   * The two are different answers: one language is a question the provider has
   * been asked, the other is a translation nobody has written. Only the second
   * is something falling back can fix, and only a preview ever sees the first —
   * the public projection has already turned it into an empty value.
   */
  it("is off when the wanted language is a question rather than a missing translation", () => {
    const content = research({ title: { ja: filled("題"), en: UNKNOWN } })
    const view = viewOf(content)
    expect(view.untranslated).toBe(false)
    expect(view.title).toEqual({ state: "unsettled" })
  })

  it("ignores a controlled-access usage, which no curator can translate", () => {
    const cau: CauUsage[] = [{
      principalInvestigator: { ja: "山田", en: "" },
      affiliation: { ja: "大学", en: "" },
      country: { ja: "日本", en: "" },
      researchTitle: { ja: "研究", en: "" },
      periodStart: null,
      periodEnd: null,
      datasetAccessions: [],
    }]
    const view = viewOf(research(), "en", cau)
    expect(view.untranslated).toBe(false)
    expect(view.cau[0]?.principalInvestigator).toBe("山田")
  })
})

describe("what a research page has", () => {
  it("hands the summary over as lines and the title as one string", () => {
    const content = research({
      title: { ja: filled(""), en: filled("A * B") },
      summary: {
        ...emptyResearchContent().summary,
        aims: { ja: filled([]), en: filled([[{ text: "First" }], [{ text: "Second" }]]) },
      },
    })
    const view = viewOf(content)
    expect(view.title).toEqual({ state: "plain", text: "A * B", untranslated: false })
    expect(view.summary.aims).toEqual({
      state: "rich",
      text: [[{ text: "First" }], [{ text: "Second" }]],
      untranslated: false,
    })
  })

  it("reports a field is settled as having no value, whichever language holds that", () => {
    const content = research({ title: { ja: NOT_APPLICABLE, en: filled("Title") } })
    expect(viewOf(content, "ja").title).toEqual({ state: "not-applicable" })
    expect(viewOf(content, "en").title)
      .toEqual({ state: "plain", text: "Title", untranslated: false })
  })

  it("takes the links of the language asked for, without falling back", () => {
    const content = research({
      summary: {
        ...emptyResearchContent().summary,
        url: {
          ja: filled([{ id: "u1", url: "https://example.jp/", text: "jp" }]),
          en: filled([]),
        },
      },
    })
    expect(viewOf(content, "en").summary.links)
      .toEqual({ state: "value", value: [], untranslated: false })
    const ja = viewOf(content, "ja").summary.links
    expect(ja.state === "value" && ja.value).toHaveLength(1)
  })

  it("has the state of a link out to the page rather than emptying it", () => {
    const unsettled = research({
      summary: {
        ...emptyResearchContent().summary,
        url: { ja: UNKNOWN, en: NOT_APPLICABLE },
      },
    })

    expect(viewOf(unsettled, "ja").summary.links).toEqual({ state: "unsettled" })
    expect(viewOf(unsettled, "en").summary.links).toEqual({ state: "not-applicable" })
  })

  it("reports a version is the latest only when it is", () => {
    expect(viewOf(research()).isLatest).toBe(true)
    expect(researchView({
      humLabel: "hum0001",
      versionNumber: 1,
      releaseDate: "2020-01-01",
      latestVersionNumber: 3,
      content: research(),
      datasets: [],
      datasetLabelById: new Map(),
      cau: [],
      files: { rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 },
    }, "ja", catalog)).toMatchObject({ isLatest: false, versionLabel: "hum0001-v1" })
  })

  it("names a cited dataset only when the label is known", () => {
    const content = research({
      relatedPublications: [{
        id: "pub1",
        title: filled("A paper"),
        doi: filled("https://doi.org/10"),
        datasetIds: ["known", "gone"],
      }],
    })
    const view = researchView({
      humLabel: "hum0001",
      versionNumber: 1,
      releaseDate: "2020-01-01",
      latestVersionNumber: 1,
      content,
      datasets: [],
      datasetLabelById: new Map([["known", "JGAD000001"]]),
      cau: [],
      files: { rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 },
    }, "ja", catalog)
    expect(view.relatedPublications[0]?.datasetLabels).toEqual(["JGAD000001"])
  })

  describe("the datasets that select a file of the download list", () => {
    function selecting(selections: string[][], names: string[]) {
      return researchView({
        humLabel: "hum0001",
        versionNumber: 1,
        releaseDate: "2020-01-01",
        latestVersionNumber: 1,
        content: research(),
        datasets: selections.map((fileSelection, at) => ({
          id: `d${at}`,
          label: `NHA00000${at + 1}`,
          content: { ...emptyDatasetContent(), fileSelection },
          datePublished: null,
        })),
        datasetLabelById: new Map(),
        cau: [],
        files: {
          rows: names.map((name) => ({ name, size: 1, isPublic: true })),
          total: names.length,
          page: 1,
          pageCount: 1,
          rangeFrom: 1,
          rangeTo: names.length,
        },
      }, "ja", catalog).files.rows.map((row) => row.datasets)
    }

    it("names each dataset by its place in the dataset table, in the table's order", () => {
      expect(selecting([["b.zip"], ["a.zip", "b.zip"], []], ["a.zip", "b.zip"])).toEqual([[1], [0, 1]])
    })

    it("names none for a file no dataset selects", () => {
      expect(selecting([["a.zip"]], ["c.zip"])).toEqual([[]])
    })

    it("does not match a name by its beginning", () => {
      expect(selecting([["a.zip.md5"], ["a"]], ["a.zip"])).toEqual([[]])
    })

    it("keeps the paging of the listing as it came", () => {
      const view = researchView({
        humLabel: "hum0001",
        versionNumber: 1,
        releaseDate: "2020-01-01",
        latestVersionNumber: 1,
        content: research(),
        datasets: [],
        datasetLabelById: new Map(),
        cau: [],
        files: { rows: [], total: 250, page: 3, pageCount: 3, rangeFrom: 201, rangeTo: 250 },
      }, "ja", catalog)
      expect(view.files).toEqual({ rows: [], total: 250, page: 3, pageCount: 3, rangeFrom: 201, rangeTo: 250 })
    })
  })

  describe("the datasets a publication names", () => {
    function cited(humByLabel: ReadonlyMap<string, string>, datasetIds: string[], externalIds: string[]) {
      const content = research({
        relatedPublications: [{ id: "pub1", title: filled("A paper"), doi: filled(""), datasetIds, externalIds }],
      })
      return researchView({
        humLabel: "hum0001",
        versionNumber: 1,
        releaseDate: "2020-01-01",
        latestVersionNumber: 1,
        content,
        datasets: [],
        datasetLabelById: new Map([["mine", "JGAD000001"], ["theirs", "JGAD000009"]]),
        humByLabel,
        cau: [],
        files: { rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 },
      }, "ja", catalog).relatedPublications[0]
    }

    it("lists the chosen before the typed, and compares the place by both", () => {
      const row = cited(new Map(), ["mine"], ["DRA000001"])
      expect(row?.datasetLabels).toEqual(["JGAD000001", "DRA000001"])
      expect(row?.datasets.map((one) => one.label)).toEqual(["JGAD000001", "DRA000001"])
    })

    it("reports whose a dataset is only where it is another research's", () => {
      const hums = new Map([["JGAD000001", "hum0001"], ["JGAD000009", "hum0009"], ["JGAD000777", "hum0007"]])
      const row = cited(hums, ["mine", "theirs"], ["JGAD000777"])
      expect(row?.datasets).toEqual([
        { label: "JGAD000001", known: true, humLabel: null },
        { label: "JGAD000009", known: true, humLabel: "hum0009" },
        { label: "JGAD000777", known: true, humLabel: "hum0007" },
      ])
    })

    it("draws a typed ID the `label_pin` table does not respond for as it was written, with nothing to follow", () => {
      const row = cited(new Map(), [], ["JGAD999999"])
      expect(row?.datasets).toEqual([{ label: "JGAD999999", known: false, humLabel: null }])
    })

    it("reads a publication written without typed IDs as having none", () => {
      const content = research({
        relatedPublications: [{ id: "pub1", title: filled("A paper"), doi: filled(""), datasetIds: ["mine"] }],
      })
      const view = researchView({
        humLabel: "hum0001",
        versionNumber: 1,
        releaseDate: "2020-01-01",
        latestVersionNumber: 1,
        content,
        datasets: [],
        datasetLabelById: new Map([["mine", "JGAD000001"]]),
        cau: [],
        files: { rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 },
      }, "ja", catalog)
      expect(view.relatedPublications[0]?.datasets).toEqual([{ label: "JGAD000001", known: true, humLabel: null }])
    })
  })
})

function dataset(content: DatasetContent) {
  return datasetView({
    studyAccession: null,
    label: "JGAD000001",
    humLabel: "hum0001",
    content,
    datePublished: "2020-01-01",
    dateModified: null,
    files: [],
  }, "ja", catalog)
}

describe("what a dataset page has", () => {
  it("places the access type and the type of data outside the experiments", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      values: [
        { keyId: "k-access", value: { kind: "vocabulary", termIds: filled(["t-open"]) } },
        {
          keyId: "k-type",
          value: {
            kind: "text",
            text: { ja: filled([[{ text: "SNP" }]]), en: filled([[{ text: "SNP" }]]) },
          },
        },
      ],
    })
    expect(view.accessType).toEqual({ code: "unrestricted-access", label: "非制限公開", maker: null })
    expect(view.typeOfData).toEqual({ state: "rich", text: [[{ text: "SNP" }]], untranslated: false })
  })

  it("orders the values of an experiment by the catalog, not by the content", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: filled("WES"),
        values: [
          { keyId: "k-late", value: { kind: "single", value: filled("later") } },
          { keyId: "k-early", value: { kind: "single", value: filled("earlier") } },
        ],
      }],
    })
    expect(view.experiments[0]?.values.map((v) => v.keyId)).toEqual(["k-early", "k-late"])
    expect(view.experiments[0]?.values[0]?.label).toBe("early ja")
  })

  it("drops a value under a key the catalog does not know", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: filled("WES"),
        values: [{ keyId: "k-nonexistent", value: { kind: "single", value: filled("x") } }],
      }],
    })
    expect(view.experiments[0]?.values).toEqual([])
  })

  it("keeps a settled 'no such value' so the row can report it", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: filled("WES"),
        values: [{ keyId: "k-early", value: { kind: "single", value: NOT_APPLICABLE } }],
      }],
    })
    expect(view.experiments[0]?.values[0]?.field).toEqual({ state: "not-applicable" })
  })

  it("shows a number with the unit it was converted to", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: filled("WES"),
        values: [{
          keyId: "k-early",
          value: {
            kind: "number",
            values: filled([
              { label: null, value: 375.31, unit: "GB", inputValue: 375.31, inputUnit: "GB", note: null },
            ]),
          },
        }],
      }],
    })
    expect(view.experiments[0]?.values[0]?.field).toEqual({
      state: "rich",
      text: [[{ text: "375.31 GB" }]],
      untranslated: false,
    })
  })

  it("shows a width as its two typed ends joined by an en dash", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: filled("WES"),
        values: [{
          keyId: "k-early",
          value: {
            kind: "number",
            values: filled([
              { label: null, value: 900, unit: "GB", inputValue: 0.9, inputUnit: "TB", high: 1300, inputHigh: 1.3, note: null },
            ]),
          },
        }],
      }],
    })
    expect(view.experiments[0]?.values[0]?.field).toEqual({
      state: "rich",
      text: [[{ text: "0.9–1.3 TB" }]],
      untranslated: false,
    })
  })

  it("falls back to the English label of a term that has no Japanese one", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      values: [{ keyId: "k-access", value: { kind: "vocabulary", termIds: filled(["t-en-only"]) } }],
    })
    expect(view.accessType?.label).toBe("English only")
  })
})

describe("the maker a label is drawn apart from", () => {
  it("is kept while the label still opens with it", () => {
    expect(makerOf("Illumina", "Illumina NovaSeq 6000")).toBe("Illumina")
  })

  it("is nothing where the value names no product", () => {
    expect(makerOf(null, "Unrestricted-access")).toBeNull()
  })

  /**
   * A curator who renames the value has said the two are no longer a prefix and
   * a rest. Cutting the label at the maker's length anyway would take the wrong
   * characters off the front of it.
   */
  it("is dropped once the label has been renamed away from it", () => {
    expect(makerOf("Illumina", "NovaSeq 6000 (Illumina)")).toBeNull()
  })

  it("is dropped when it is empty, so a missing vendor draws nothing apart", () => {
    expect(makerOf("", "DigiTag2 assay")).toBeNull()
  })
})

describe("the several values one listing cell holds", () => {
  const PLATFORMS: [string, VocabularyTermView][] = [
    ["t-minion", {
      code: "oxford-nanopore-technologies-minion",
      labelJa: null,
      labelEn: "Oxford Nanopore Technologies MinION",
      maker: "Oxford Nanopore Technologies",
      position: 20,
    }],
    ["t-novaseq", {
      code: "illumina-novaseq-6000",
      labelJa: null,
      labelEn: "Illumina NovaSeq 6000",
      maker: "Illumina",
      position: 8,
    }],
    ["t-hiseq", {
      code: "illumina-hiseq-2500",
      labelJa: null,
      labelEn: "Illumina HiSeq 2500",
      maker: "Illumina",
      position: 4,
    }],
  ]
  const withPlatforms: CatalogView = {
    ...catalog,
    termById: new Map([...catalog.termById, ...PLATFORMS]),
  }

  function row(input: Partial<ResearchListRowInput>): ResearchListRowView {
    return researchListRowView({
      humLabel: "hum0001",
      content: emptyResearchContent(),
      datasetLabels: [],
      accessTermIds: [],
      platformTermIds: [],
      datePublished: null,
      dateModified: null,
      ...input,
    }, "en", withPlatforms)
  }

  it("draws the values in catalog order rather than the order they arrived in", () => {
    expect(row({ platformTermIds: ["t-minion", "t-novaseq", "t-hiseq"] }).platforms.map((one) => one.label))
      .toEqual([
        "Illumina HiSeq 2500",
        "Illumina NovaSeq 6000",
        "Oxford Nanopore Technologies MinION",
      ])
  })

  /**
   * The ids come out of the search tables under no ordering, and the cell shows
   * only its first few values. Two requests that reach the same study have to
   * show the same three.
   */
  it("draws the same order whichever order the ids arrive in", () => {
    expect(row({ platformTermIds: ["t-hiseq", "t-minion", "t-novaseq"] }).platforms)
      .toEqual(row({ platformTermIds: ["t-novaseq", "t-hiseq", "t-minion"] }).platforms)
  })

  it("drops an id the catalog no longer knows instead of leaving a hole", () => {
    expect(row({ platformTermIds: ["t-novaseq", "t-forgotten"] }).platforms.map((one) => one.label))
      .toEqual(["Illumina NovaSeq 6000"])
  })

  it("puts a study's datasets in accession order", () => {
    expect(row({ datasetLabels: ["JGAD000363", "E-GEAD-420", "JGAD000290"] }).datasetLabels)
      .toEqual(["E-GEAD-420", "JGAD000290", "JGAD000363"])
  })

  it("counts the numbers in an accession as numbers, so v2 comes before v10", () => {
    expect(row({ datasetLabels: ["hum0014.v10.freq.v1", "hum0014.v2.freq.v1"] }).datasetLabels)
      .toEqual(["hum0014.v2.freq.v1", "hum0014.v10.freq.v1"])
  })

  it("leaves the array it was handed alone", () => {
    const labels = ["JGAD000363", "JGAD000290"]
    row({ datasetLabels: labels })
    expect(labels).toEqual(["JGAD000363", "JGAD000290"])
  })
})

/**
 * The column the listing owns and the section the research owns hold the same
 * kind of thing, and almost always the same thing. What decides which is read
 * is whether anybody wrote the first.
 */
describe("the provider column of the research listing", () => {
  function named(id: string, ja: string, en: string): DataProvider {
    return provider({ id, name: { ja: filled(ja), en: filled(en) } })
  }

  function listed(id: string, ja: string, en: string): ListingProvider {
    return { id, name: { ja: filled(ja), en: filled(en) } }
  }

  function withListing(
    dataProviders: DataProvider[],
    listing: ListingProvider[],
  ): ResearchContent {
    const content = emptyResearchContent()
    return {
      ...content,
      dataProviders,
      listingSummary: { ...content.listingSummary, dataProviders: listing },
    }
  }

  function column(content: ResearchContent, locale: "ja" | "en" = "en"): (string | null)[] {
    return researchListRowView({
      humLabel: "hum0001",
      content,
      datasetLabels: [],
      accessTermIds: [],
      platformTermIds: [],
      datePublished: null,
      dateModified: null,
    }, locale, catalog).dataProviders.map((field) =>
      field.state === "plain" ? field.text : null)
  }

  it("names the research's own providers while the listing names none", () => {
    const content = withListing(
      [named("p1", "森下 真一", "Shinichi Morishita"), named("p2", "井ノ上 逸朗", "Itsuro Inoue")],
      [],
    )
    expect(column(content)).toEqual(["Shinichi Morishita", "Itsuro Inoue"])
  })

  /**
   * The reason the column is held at all: a study naming two people is shown
   * under one of them in the table.
   */
  it("names only what the listing holds once the listing holds anything", () => {
    const content = withListing(
      [named("p1", "森下 真一", "Shinichi Morishita"), named("p2", "井ノ上 逸朗", "Itsuro Inoue")],
      [listed("l1", "森下 真一", "Shinichi Morishita")],
    )
    expect(column(content)).toEqual(["Shinichi Morishita"])
  })

  it("keeps the order the listing was written in", () => {
    const content = withListing([named("p1", "甲", "A")], [
      listed("l1", "丙", "C"),
      listed("l2", "乙", "B"),
    ])
    expect(column(content)).toEqual(["C", "B"])
  })

  /**
   * A name written in one language only is ordinary here — one of the studies
   * in the archive has no English for its provider — so the cell falls back the
   * way every other translated pair does rather than showing nothing.
   */
  it("falls back to the other language for a name written only once", () => {
    const content = withListing([], [listed("l1", "森下 真一", "")])
    expect(column(content, "en")).toEqual(["森下 真一"])
  })

  /**
   * Emptying the listing is how a curator reports "the section again", so the
   * column has to go back rather than stay on the last thing typed into it.
   */
  it("goes back to the research's providers when the listing is emptied", () => {
    const both = [named("p1", "甲", "A"), named("p2", "乙", "B")]
    expect(column(withListing(both, [listed("l1", "甲", "A")]))).toEqual(["A"])
    expect(column(withListing(both, []))).toEqual(["A", "B"])
  })

  it("shows an empty column for a research naming nobody at all", () => {
    expect(column(withListing([], []))).toEqual([])
  })
})
