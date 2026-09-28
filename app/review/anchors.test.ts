import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"

import { fieldHash } from "~/admin/urls"

import { RESEARCH, anchorOf, commentSpotId, isAnchorPath, isSameSubject, pathExists, subjectOf } from "./anchors"

const DATASET = { kind: "dataset" as const, datasetId: "d1" }

function research(): ResearchContent {
  return {
    ...emptyResearchContent(),
    dataProviders: [{
      id: "p1",
      name: { ja: filled("提供者"), en: filled("") },
      organization: {
        name: { ja: filled(""), en: filled("") },
      },
    }],
  }
}

function dataset(): DatasetContent {
  return {
    ...emptyDatasetContent(),
    values: [{ keyId: "k1", value: { kind: "vocabulary", termIds: filled(["t1"]) } }],
    experiments: [{
      id: "e1",
      label: filled("Exome"),
      values: [{ keyId: "k2", value: { kind: "vocabulary", termIds: filled([]) } }],
    }],
  }
}

describe("an anchor path", () => {
  it("is names joined by dots, and nothing else", () => {
    expect(isAnchorPath("summary.aims")).toBe(true)
    expect(isAnchorPath("dataProviders.0f3a-1b2c.organization.name")).toBe(true)
    expect(isAnchorPath("experiments.e1.values.k2")).toBe(true)

    expect(isAnchorPath("")).toBe(false)
    expect(isAnchorPath(".summary")).toBe(false)
    expect(isAnchorPath("summary..aims")).toBe(false)
    expect(isAnchorPath("summary aims")).toBe(false)
    expect(isAnchorPath("summary/aims")).toBe(false)
    expect(isAnchorPath("__proto__.x".repeat(40))).toBe(false)
    expect(isAnchorPath(42)).toBe(false)
  })
})

describe("an anchor", () => {
  it("remembers which subject it is about", () => {
    expect(subjectOf(anchorOf(RESEARCH, "title"))).toEqual(RESEARCH)
    expect(subjectOf(anchorOf(DATASET, "title"))).toEqual(DATASET)
    expect(isSameSubject(RESEARCH, DATASET)).toBe(false)
    expect(isSameSubject(DATASET, { kind: "dataset", datasetId: "d1" })).toBe(true)
  })
})

describe("the place an anchor points at", () => {
  it("exists when the path leads somewhere in the content it is about", () => {
    expect(pathExists(research(), "summary.aims")).toBe(true)
    expect(pathExists(research(), "dataProviders.p1.organization.name")).toBe(true)
    expect(pathExists(dataset(), "values.k1")).toBe(true)
    expect(pathExists(dataset(), "experiments.e1.label")).toBe(true)
    expect(pathExists(dataset(), "experiments.e1.values.k2")).toBe(true)
  })

  it("does not exist for an element that is not there or a name no element has", () => {
    expect(pathExists(research(), "dataProviders.p9.name")).toBe(false)
    expect(pathExists(research(), "summary.nothing")).toBe(false)
    expect(pathExists(dataset(), "values.k9")).toBe(false)
    expect(pathExists(dataset(), "experiments.e9.label")).toBe(false)
  })

  /**
   * Every object inherits these names, and none of them is a place in the
   * content: a comment on one would be kept under a place no screen draws.
   */
  it("does not exist for a name every object inherits, at the top or under a real place", () => {
    const inherited = fc.constantFrom(...Object.getOwnPropertyNames(Object.prototype))
    fc.assert(fc.property(inherited, fc.constantFrom("", "summary.", "title.", "dataProviders.p1."), (name, under) => {
      expect(pathExists(research(), `${under}${name}`)).toBe(false)
      expect(pathExists(dataset(), `${under}${name}`)).toBe(false)
    }))
  })
})

describe("the id of a place's comment control", () => {
  const path = fc.array(fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/), { minLength: 1, maxLength: 4 }).map((names) => names.join("."))

  it("is never the id the editing form gives the same place, which shares a document with the page beside it", () => {
    fc.assert(fc.property(path, (at) => {
      fc.pre(isAnchorPath(at))
      expect(commentSpotId(at)).not.toBe(at)
      expect(commentSpotId(at)).not.toBe(at.split(".")[0])
      expect(`#${commentSpotId(at)}`).not.toBe(fieldHash(at, null))
    }))
  })

  it("is one for each place", () => {
    fc.assert(fc.property(path, path, (a, b) => {
      fc.pre(a !== b)
      expect(commentSpotId(a)).not.toBe(commentSpotId(b))
    }))
  })
})
