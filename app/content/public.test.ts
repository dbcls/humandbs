import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "./empty"
import {
  publicDataset,
  publicDatasetContent,
  publicResearch,
  publicResearchContent,
  type CatalogKey,
  type PublicOptions,
} from "./public"

const PUBLISHED: PublicOptions = { keepUnsettled: false }
const PREVIEW: PublicOptions = { keepUnsettled: true }

const catalog = (...keys: CatalogKey[]): ReadonlyMap<string, CatalogKey> =>
  new Map(keys.map((key) => [key.id, key]))

describe("publicResearchContent", () => {
  it("empties an unsettled field for a public page and keeps its state for a preview", () => {
    const content = { ...emptyResearchContent(), title: { state: "unknown" } as const }

    expect(publicResearchContent(content, PUBLISHED).title)
      .toEqual({ state: "value", value: { ja: "", en: "" } })
    expect(publicResearchContent(content, PREVIEW).title).toEqual({ state: "unknown" })
  })

  it("keeps a not-applicable field on both, because it is settled information", () => {
    const content = { ...emptyResearchContent(), releaseNote: { state: "not-applicable" } as const }

    expect(publicResearchContent(content, PUBLISHED).releaseNote)
      .toEqual({ state: "not-applicable" })
    expect(publicResearchContent(content, PREVIEW).releaseNote)
      .toEqual({ state: "not-applicable" })
  })

  it("keeps an array element whose own field is unsettled", () => {
    const content = {
      ...emptyResearchContent(),
      dataProviders: [{
        id: "p1",
        name: { state: "unknown" } as const,
        organization: {
          name: { state: "value", value: { ja: "大学", en: "University" } } as const,
          address: { state: "value", value: { ja: "", en: "" } } as const,
        },
        orcid: { state: "value", value: "" } as const,
        email: { state: "value", value: "" } as const,
      }],
    }

    const published = publicResearchContent(content, PUBLISHED)
    expect(published.dataProviders).toHaveLength(1)
    expect(published.dataProviders[0]?.name).toEqual({ state: "value", value: { ja: "", en: "" } })
    expect(published.dataProviders[0]?.organization.name)
      .toEqual({ state: "value", value: { ja: "大学", en: "University" } })
  })

  it("empties an unsettled URL field to a pair of empty lists, not to a text", () => {
    const content = {
      ...emptyResearchContent(),
      summary: { ...emptyResearchContent().summary, url: { state: "unknown" } as const },
    }

    expect(publicResearchContent(content, PUBLISHED).summary.url)
      .toEqual({ state: "value", value: { ja: [], en: [] } })
  })
})

describe("publicDatasetContent", () => {
  const shown: CatalogKey = { id: "shown", showOnPublicPage: true }
  const hidden: CatalogKey = { id: "hidden", showOnPublicPage: false }
  const value = { state: "value", value: { kind: "single", value: "x" } } as const

  it("drops a value under a key the catalog hides", () => {
    const content = {
      ...emptyDatasetContent(),
      values: [{ keyId: "shown", slot: value }, { keyId: "hidden", slot: value }],
    }

    const out = publicDatasetContent(content, { keys: catalog(shown, hidden), files: [] }, PREVIEW)
    expect(out.values.map((v) => v.keyId)).toEqual(["shown"])
  })

  it("drops a value under a key the catalog does not know", () => {
    const content = {
      ...emptyDatasetContent(),
      values: [{ keyId: "gone", slot: value }],
    }

    const out = publicDatasetContent(content, { keys: catalog(shown), files: [] }, PREVIEW)
    expect(out.values).toEqual([])
  })

  it("drops an unsettled value for a public page and keeps it for a preview", () => {
    const content = {
      ...emptyDatasetContent(),
      values: [{ keyId: "shown", slot: { state: "unknown" } as const }],
    }
    const input = { keys: catalog(shown), files: [] }

    expect(publicDatasetContent(content, input, PUBLISHED).values).toEqual([])
    expect(publicDatasetContent(content, input, PREVIEW).values)
      .toEqual([{ keyId: "shown", slot: { state: "unknown" } }])
  })

  it("applies the same rules to an experiment's values", () => {
    const content = {
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: { state: "unknown" } as const,
        values: [{ keyId: "shown", slot: value }, { keyId: "hidden", slot: value }],
      }],
    }

    const out = publicDatasetContent(content, { keys: catalog(shown, hidden), files: [] }, PUBLISHED)
    expect(out.experiments).toHaveLength(1)
    expect(out.experiments[0]?.label).toEqual({ state: "value", value: "" })
    expect(out.experiments[0]?.values.map((v) => v.keyId)).toEqual(["shown"])
  })

  it("drops a file selection the listing no longer contains", () => {
    const content = { ...emptyDatasetContent(), fileSelection: ["kept.zip", "gone.zip"] }

    const out = publicDatasetContent(
      content,
      { keys: catalog(), files: [{ name: "kept.zip", size: 1 }] },
      PREVIEW,
    )
    expect(out.fileSelection).toEqual(["kept.zip"])
  })
})

describe("publicDataset", () => {
  const input = { keys: catalog(), files: [] }

  it("shows the admin's release date when the dataset has one", () => {
    const content = { ...emptyDatasetContent(), releaseDate: "2020-01-01" }
    const archive = { datePublished: "2021-02-02", dateModified: "2022-03-03" }

    const out = publicDataset(content, { ...input, archive }, PUBLISHED)
    expect(out.dates).toEqual({ datePublished: "2020-01-01", dateModified: "2022-03-03" })
  })

  it("falls back to the archive's date when the dataset has none", () => {
    const archive = { datePublished: "2021-02-02", dateModified: null }

    const out = publicDataset(emptyDatasetContent(), { ...input, archive }, PUBLISHED)
    expect(out.dates).toEqual({ datePublished: "2021-02-02", dateModified: null })
  })

  it("reports no date when neither side has one", () => {
    const out = publicDataset(emptyDatasetContent(), { ...input, archive: null }, PUBLISHED)
    expect(out.dates).toEqual({ datePublished: null, dateModified: null })
  })
})

describe("publicResearch", () => {
  it("passes through the usage records and the listing it was given", () => {
    const cau = [{
      applicationId: "A-1",
      principalInvestigator: { ja: "山田", en: "Yamada" },
      affiliation: { ja: "大学", en: "University" },
      country: "Japan",
      researchTitle: { ja: "課題", en: "Project" },
      periodStart: "2020-01-01",
      periodEnd: null,
      datasetAccessions: ["JGAD000001"],
    }]
    const files = [{ name: "a.zip", size: 10 }]

    const out = publicResearch(emptyResearchContent(), { cau, files }, PUBLISHED)
    expect(out.cau).toEqual(cau)
    expect(out.files).toEqual(files)
  })
})
