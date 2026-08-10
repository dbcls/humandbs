import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetContentArb, filesArb, researchContentArb } from "~/content/arbitraries/content"
import { publicDatasetContent, publicResearchContent } from "~/content/public"
import type { DatasetContent, ResearchContent, Slot } from "~/content/types"

import { catalogViewArb, termIdsIn } from "./arbitraries/catalog"
import { apiDataset, apiResearch, type ApiContext } from "./view"

const PUBLISHED = { keepUnsettled: false }
const ORIGIN = "https://humandbs.dbcls.jp"

/** What a caller actually receives: the object after it has been serialised. */
function answered(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

function walk(value: unknown, visit: (key: string, held: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit)
    return
  }
  if (value === null || typeof value !== "object") return
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    visit(key, item)
    walk(item, visit)
  }
}

const datasetCaseArb = datasetContentArb.chain((content) =>
  fc.record({
    content: fc.constant(content),
    catalog: catalogViewArb(termIdsIn(content)),
    files: filesArb,
  }))

/**
 * The dataset as an endpoint answers it. **The catalog the public projection
 * consults is the same one the API projection consults**, as it is on every
 * route: a law run against two independent catalogs would be watching values
 * disappear for a reason production does not have.
 */
function datasetAnswer(input: {
  content: DatasetContent
  catalog: ApiContext["catalog"]
  files: { name: string, size: number }[]
}): unknown {
  return answered(apiDataset({
    label: "JGAD000001",
    humLabel: "hum0001",
    datePublished: "2020-01-01",
    dateModified: null,
    content: publicDatasetContent(
      input.content,
      { keys: input.catalog.keyById, files: input.files },
      PUBLISHED,
    ),
    files: input.files,
  }, { origin: ORIGIN, catalog: input.catalog }))
}

function researchAnswer(content: ResearchContent): unknown {
  return answered(apiResearch({
    humLabel: "hum0001",
    versionNumber: 1,
    releaseDate: "2020-01-01",
    versions: [{ number: 1, releaseDate: "2020-01-01" }],
    content: publicResearchContent(content, PUBLISHED),
    datasetLabelById: new Map(),
    cau: [],
    files: [],
  }, { origin: ORIGIN, catalog: { keyById: new Map(), keyByCode: new Map(), termById: new Map() } }))
}

/** Every slot of a content turned into a question nobody has answered yet. */
function allUnknown<T>(value: T): T {
  if (Array.isArray(value)) return value.map(allUnknown) as T
  if (value === null || typeof value !== "object") return value
  const record = value as Record<string, unknown>
  if (typeof record.state === "string") return { state: "unknown" } as unknown as T
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, allUnknown(item)]),
  ) as T
}

describe("the API projection", () => {
  it("never answers with an empty string for a language", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      walk(researchAnswer(content), (key, held) => {
        if (key === "ja" || key === "en") expect(held).not.toBe("")
      })
    }))
  })

  it("never answers with an empty string for a language of a dataset", () => {
    fc.assert(fc.property(datasetCaseArb, (input) => {
      walk(datasetAnswer(input), (key, held) => {
        if (key === "ja" || key === "en") expect(held).not.toBe("")
      })
    }))
  })

  it("leaves out every key whose value nobody has settled", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const answer = researchAnswer(allUnknown(content)) as Record<string, unknown>
      expect(answer.title).toBeUndefined()
      expect(answer.releaseNote).toBeUndefined()
      expect(answer.summary).toEqual({})
      expect(answer.summaryShort).toEqual({})
      for (const provider of answer.dataProviders as Record<string, unknown>[]) {
        expect(provider).toEqual({ organization: {} })
      }
    }))
  })

  it("leaves out every value slot nobody has settled", () => {
    fc.assert(fc.property(datasetCaseArb, (input) => {
      const answer = datasetAnswer({
        ...input,
        content: allUnknown(input.content),
      }) as { values: unknown[], experiments: { label?: unknown, values: unknown[] }[] }
      expect(answer.values).toEqual([])
      for (const experiment of answer.experiments) {
        expect(experiment.values).toEqual([])
        expect(experiment.label).toBeUndefined()
      }
    }))
  })

  it("answers with every list present, empty rather than absent", () => {
    const lists = [
      "versions",
      "dataProviders",
      "researchProjects",
      "grants",
      "relatedPublications",
      "datasets",
      "controlledAccessUsers",
      "files",
    ]
    fc.assert(fc.property(researchContentArb, (content) => {
      const answer = researchAnswer(content) as Record<string, unknown>
      for (const list of lists) expect(Array.isArray(answer[list])).toBe(true)
    }))
  })

  it("answers with every list of a dataset present, empty rather than absent", () => {
    fc.assert(fc.property(datasetCaseArb, (input) => {
      const answer = datasetAnswer(input) as Record<string, unknown>
      for (const list of ["values", "experiments", "files"]) {
        expect(Array.isArray(answer[list])).toBe(true)
      }
    }))
  })

  it("never lets an internal identity out of an array element", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const answer = researchAnswer(content) as Record<string, unknown>
      for (const [key, held] of Object.entries(answer)) {
        if (key === "id") continue
        walk(held, (nested) => {
          expect(nested).not.toBe("id")
        })
      }
    }))
  })

  it("never lets a vocabulary term identity out", () => {
    fc.assert(fc.property(datasetCaseArb, (input) => {
      const answer = datasetAnswer(input)
      const ids = new Set(input.catalog.termById.keys())
      walk(answer, (key, held) => {
        if (key !== "code") return
        expect(ids.has(String(held))).toBe(false)
      })
    }))
  })

  it("keeps a value that is known not to exist, as null", () => {
    const notApplicable: Slot<never> = { state: "not-applicable" }
    fc.assert(fc.property(researchContentArb, (content) => {
      const answer = researchAnswer({
        ...content,
        title: { ja: notApplicable, en: notApplicable },
      }) as { title?: { ja?: unknown, en?: unknown } }
      expect(answer.title).toEqual({ ja: null, en: null })
    }))
  })
})
