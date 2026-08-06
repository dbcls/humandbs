import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import type { DataProvider, DatasetContent, ResearchContent } from "~/content/types"

import {
  ACCESS_TYPE_KEY,
  TYPE_OF_DATA_KEY,
  datasetView,
  researchView,
  type CatalogKeyView,
  type CatalogView,
  type CauInput,
} from "./view.server"

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
    name: { state: "value", value: { ja: "", en: "" } },
    organization: {
      name: { state: "value", value: { ja: "", en: "" } },
      address: { state: "value", value: { ja: "", en: "" } },
    },
    orcid: { state: "value", value: "" },
    email: { state: "value", value: "" },
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
    const content = research({ title: { state: "value", value: { ja: "題", en: "Title" } } })
    expect(viewOf(content).untranslated).toBe(false)
  })

  it("is on when a rendered field showed the other language", () => {
    const content = research({ title: { state: "value", value: { ja: "題", en: "" } } })
    const view = viewOf(content)
    expect(view.untranslated).toBe(true)
    expect(view.title).toEqual({ state: "plain", text: "題", untranslated: true })
  })

  /**
   * The page does not render these, so a reader told the page has untranslated
   * items would have nothing to look at.
   */
  it("ignores a field the page does not render", () => {
    const content = research({
      dataProviders: [provider({
        organization: {
          name: { state: "value", value: { ja: "大学", en: "University" } },
          address: { state: "value", value: { ja: "東京", en: "" } },
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
  it("renders the summary as markdown and the title as plain text", () => {
    const content = research({
      title: { state: "value", value: { ja: "", en: "**not bold**" } },
      summary: {
        ...emptyResearchContent().summary,
        aims: { state: "value", value: { ja: "", en: "**bold**" } },
      },
    })
    const view = viewOf(content)
    expect(view.title).toEqual({ state: "plain", text: "**not bold**", untranslated: false })
    expect(view.summary.aims.state).toBe("markdown")
  })

  it("takes the links of the language asked for, without falling back", () => {
    const content = research({
      summary: {
        ...emptyResearchContent().summary,
        url: {
          state: "value",
          value: {
            ja: [{ id: "u1", url: "https://example.jp/", text: "jp" }],
            en: [],
          },
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
        title: { state: "value", value: "A paper" },
        doi: { state: "value", value: "https://doi.org/10" },
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
        { keyId: "k-access", slot: { state: "value", value: { kind: "vocabulary", termIds: ["t-open"] } } },
        { keyId: "k-type", slot: { state: "value", value: { kind: "text", text: { ja: "SNP", en: "SNP" } } } },
      ],
    })
    expect(view.accessType).toEqual({ code: "unrestricted-access", label: "非制限公開" })
    expect(view.typeOfData?.state).toBe("markdown")
  })

  it("orders the values of an experiment by the catalog, not by the content", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: { state: "value", value: "WES" },
        values: [
          { keyId: "k-late", slot: { state: "value", value: { kind: "single", value: "later" } } },
          { keyId: "k-early", slot: { state: "value", value: { kind: "single", value: "earlier" } } },
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
        label: { state: "value", value: "WES" },
        values: [
          { keyId: "k-nonexistent", slot: { state: "value", value: { kind: "single", value: "x" } } },
        ],
      }],
    })
    expect(view.experiments[0]?.values).toEqual([])
  })

  it("keeps a settled 'no such value' so the row can say so", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: { state: "value", value: "WES" },
        values: [{ keyId: "k-early", slot: { state: "not-applicable" } }],
      }],
    })
    expect(view.experiments[0]?.values[0]?.field).toEqual({ state: "not-applicable" })
  })

  it("shows a number with the unit it was converted to", () => {
    const view = dataset({
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: { state: "value", value: "WES" },
        values: [{
          keyId: "k-early",
          slot: {
            state: "value",
            value: { kind: "number", value: 375.31, unit: "GB", inputValue: 375.31, inputUnit: "GB" },
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
      values: [
        { keyId: "k-access", slot: { state: "value", value: { kind: "vocabulary", termIds: ["t-en-only"] } } },
      ],
    })
    expect(view.accessType?.label).toBe("English only")
  })
})
