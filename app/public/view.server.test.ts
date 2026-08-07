import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DataProvider, DatasetContent, ResearchContent, Slot } from "~/content/types"

import {
  ACCESS_TYPE_KEY,
  TYPE_OF_DATA_KEY,
  datasetView,
  researchView,
  type CatalogKeyView,
  type CatalogView,
  type CauInput,
} from "./view.server"

const UNKNOWN: Slot<never> = { state: "unknown" }
const NOT_APPLICABLE: Slot<never> = { state: "not-applicable" }

function key(id: string, code: string, position: number, showOnPublicPage = true): CatalogKeyView {
  return { id, code, labelJa: `${code} ja`, labelEn: `${code} en`, position, showOnPublicPage }
}

const KEYS = [
  key("k-access", ACCESS_TYPE_KEY, 0),
  key("k-type", TYPE_OF_DATA_KEY, 1),
  key("k-late", "late", 90),
  key("k-early", "early", 10),
  key("k-hidden", "hidden", 20, false),
]

const catalog: CatalogView = {
  keyById: new Map(KEYS.map((k) => [k.id, k])),
  keyByCode: new Map(KEYS.map((k) => [k.code, k])),
  termById: new Map([
    ["t-open", { code: "unrestricted-access", labelJa: "非制限公開", labelEn: "Unrestricted-access" }],
    ["t-en-only", { code: "en-only", labelJa: null, labelEn: "English only" }],
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
      address: { ja: filled(""), en: filled("") },
    },
    orcid: filled(""),
    email: filled(""),
    ...overrides,
  }
}

function viewOf(content: ResearchContent, locale: "ja" | "en" = "en", cau: CauInput[] = []) {
  return researchView({
    humLabel: "hum0001",
    versionNumber: 2,
    releaseDate: "2020-01-01",
    latestVersionNumber: 2,
    content,
    datasets: [],
    datasetLabelById: new Map(),
    cau,
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
   * is something falling back can fix.
   */
  it("is off when the wanted language is a question rather than a missing translation", () => {
    const content = research({ title: { ja: filled("題"), en: UNKNOWN } })
    const view = viewOf(content)
    expect(view.untranslated).toBe(false)
    expect(view.title).toEqual({ state: "plain", text: "", untranslated: false })
  })

  /**
   * The page does not render these, so a reader told the page has untranslated
   * items would have nothing to look at.
   */
  it("ignores a field the page does not render", () => {
    const content = research({
      dataProviders: [provider({
        organization: {
          name: { ja: filled("大学"), en: filled("University") },
          address: { ja: filled("東京"), en: filled("") },
        },
      })],
    })
    expect(viewOf(content).untranslated).toBe(false)
  })

  it("ignores a controlled-access usage, which no curator can translate", () => {
    const cau: CauInput[] = [{
      applicationId: "a1",
      principalInvestigator: { ja: "山田", en: "" },
      affiliation: { ja: "大学", en: "" },
      country: "Japan",
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

describe("what a research page carries", () => {
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

  it("says a field is settled as having no value, whichever language holds that", () => {
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
    expect(viewOf(content, "en").summary.links).toEqual([])
    expect(viewOf(content, "ja").summary.links).toHaveLength(1)
  })

  it("says a version is the latest only when it is", () => {
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
    }, "ja", catalog)
    expect(view.relatedPublications[0]?.datasetLabels).toEqual(["JGAD000001"])
  })
})

function dataset(content: DatasetContent) {
  return datasetView({
    label: "JGAD000001",
    humLabel: "hum0001",
    content,
    datePublished: "2020-01-01",
    dateModified: null,
  }, "ja", catalog)
}

describe("what a dataset page carries", () => {
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
    expect(view.accessType).toEqual({ code: "unrestricted-access", label: "非制限公開" })
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

  it("keeps a settled 'no such value' so the row can say so", () => {
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
            value: filled({ value: 375.31, unit: "GB", inputValue: 375.31, inputUnit: "GB" }),
          },
        }],
      }],
    })
    expect(view.experiments[0]?.values[0]?.field).toEqual({
      state: "plain",
      text: "375.31 GB",
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
