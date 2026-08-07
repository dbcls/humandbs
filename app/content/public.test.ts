import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "./empty"
import {
  publicDataset,
  publicDatasetContent,
  publicResearch,
  publicResearchContent,
  type CatalogKey,
  type PublicOptions,
} from "./public"
import type { Slot } from "./types"

const PUBLISHED: PublicOptions = { keepUnsettled: false }
const PREVIEW: PublicOptions = { keepUnsettled: true }

const UNKNOWN: Slot<never> = { state: "unknown" }
const NOT_APPLICABLE: Slot<never> = { state: "not-applicable" }

const catalog = (...keys: CatalogKey[]): ReadonlyMap<string, CatalogKey> =>
  new Map(keys.map((key) => [key.id, key]))

describe("publicResearchContent", () => {
  it("empties an unsettled language for a public page and keeps its state for a preview", () => {
    const content = { ...emptyResearchContent(), title: { ja: filled("日本語"), en: UNKNOWN } }

    expect(publicResearchContent(content, PUBLISHED).title)
      .toEqual({ ja: filled("日本語"), en: filled("") })
    expect(publicResearchContent(content, PREVIEW).title)
      .toEqual({ ja: filled("日本語"), en: UNKNOWN })
  })

  it("settles each language on its own, so one being a question does not empty the other", () => {
    const content = { ...emptyResearchContent(), title: { ja: UNKNOWN, en: filled("English") } }

    expect(publicResearchContent(content, PUBLISHED).title)
      .toEqual({ ja: filled(""), en: filled("English") })
  })

  it("keeps a not-applicable language on both, because it is settled information", () => {
    const content = {
      ...emptyResearchContent(),
      releaseNote: { ja: NOT_APPLICABLE, en: NOT_APPLICABLE },
    }

    expect(publicResearchContent(content, PUBLISHED).releaseNote)
      .toEqual({ ja: NOT_APPLICABLE, en: NOT_APPLICABLE })
    expect(publicResearchContent(content, PREVIEW).releaseNote)
      .toEqual({ ja: NOT_APPLICABLE, en: NOT_APPLICABLE })
  })

  it("keeps an array element whose own field is unsettled", () => {
    const content = {
      ...emptyResearchContent(),
      dataProviders: [{
        id: "p1",
        name: { ja: UNKNOWN, en: UNKNOWN },
        organization: {
          name: { ja: filled("大学"), en: filled("University") },
          address: { ja: filled(""), en: filled("") },
        },
        orcid: filled(""),
        email: filled(""),
      }],
    }

    const published = publicResearchContent(content, PUBLISHED)
    expect(published.dataProviders).toHaveLength(1)
    expect(published.dataProviders[0]?.name).toEqual({ ja: filled(""), en: filled("") })
    expect(published.dataProviders[0]?.organization.name)
      .toEqual({ ja: filled("大学"), en: filled("University") })
  })

  it("empties an unsettled URL field to an empty list, not to a text", () => {
    const content = {
      ...emptyResearchContent(),
      summary: { ...emptyResearchContent().summary, url: { ja: UNKNOWN, en: UNKNOWN } },
    }

    expect(publicResearchContent(content, PUBLISHED).summary.url)
      .toEqual({ ja: filled([]), en: filled([]) })
  })
})

describe("publicDatasetContent", () => {
  const shown: CatalogKey = { id: "shown", showOnPublicPage: true }
  const hidden: CatalogKey = { id: "hidden", showOnPublicPage: false }
  const value = { kind: "single", value: filled("x") } as const

  it("drops a value under a key the catalog hides", () => {
    const content = {
      ...emptyDatasetContent(),
      values: [{ keyId: "shown", value }, { keyId: "hidden", value }],
    }

    const out = publicDatasetContent(content, { keys: catalog(shown, hidden), files: [] }, PREVIEW)
    expect(out.values.map((v) => v.keyId)).toEqual(["shown"])
  })

  it("drops a value under a key the catalog does not know", () => {
    const content = { ...emptyDatasetContent(), values: [{ keyId: "gone", value }] }

    const out = publicDatasetContent(content, { keys: catalog(shown), files: [] }, PREVIEW)
    expect(out.values).toEqual([])
  })

  it("drops an unsettled single value for a public page and keeps it for a preview", () => {
    const unsettled = { keyId: "shown", value: { kind: "single", value: UNKNOWN } as const }
    const content = { ...emptyDatasetContent(), values: [unsettled] }
    const input = { keys: catalog(shown), files: [] }

    expect(publicDatasetContent(content, input, PUBLISHED).values).toEqual([])
    expect(publicDatasetContent(content, input, PREVIEW).values).toEqual([unsettled])
  })

  it("empties only the unsettled language of a prose value, keeping the other published", () => {
    const ja = [[{ text: "値" }]]
    const content = {
      ...emptyDatasetContent(),
      values: [{
        keyId: "shown",
        value: { kind: "text", text: { ja: filled(ja), en: UNKNOWN } } as const,
      }],
    }

    const out = publicDatasetContent(content, { keys: catalog(shown), files: [] }, PUBLISHED)
    expect(out.values[0]?.value)
      .toEqual({ kind: "text", text: { ja: filled(ja), en: filled([]) } })
  })

  it("applies the same rules to an experiment's values", () => {
    const content = {
      ...emptyDatasetContent(),
      experiments: [{
        id: "e1",
        label: UNKNOWN,
        values: [{ keyId: "shown", value }, { keyId: "hidden", value }],
      }],
    }

    const out = publicDatasetContent(content, { keys: catalog(shown, hidden), files: [] }, PUBLISHED)
    expect(out.experiments).toHaveLength(1)
    expect(out.experiments[0]?.label).toEqual(filled(""))
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
