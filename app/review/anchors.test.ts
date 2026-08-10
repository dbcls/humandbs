import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"

import { RESEARCH, anchorKey, anchorOf, isAnchorPath, isSameSubject, pathExists, subjectOf } from "./anchors"

const DATASET = { kind: "dataset" as const, datasetId: "d1" }

function research(): ResearchContent {
  return {
    ...emptyResearchContent(),
    dataProviders: [{
      id: "p1",
      name: { ja: filled("提供者"), en: filled("") },
      organization: {
        name: { ja: filled(""), en: filled("") },
        address: { ja: filled(""), en: filled("") },
      },
      orcid: filled(""),
      email: filled(""),
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
  it("names one place, so two subjects with the same path are two anchors", () => {
    expect(anchorKey(anchorOf(RESEARCH, "title")))
      .not.toBe(anchorKey(anchorOf(DATASET, "title")))
    expect(anchorKey(anchorOf(DATASET, "title")))
      .not.toBe(anchorKey(anchorOf({ kind: "dataset", datasetId: "d2" }, "title")))
  })

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

  it("does not exist for an element that is not there or a name nothing carries", () => {
    expect(pathExists(research(), "dataProviders.p9.name")).toBe(false)
    expect(pathExists(research(), "summary.nothing")).toBe(false)
    expect(pathExists(dataset(), "values.k9")).toBe(false)
    expect(pathExists(dataset(), "experiments.e9.label")).toBe(false)
  })

  /** The memo is the administrator's own and is not part of what is reviewed. */
  it("is not the draft's memo, which never reaches a preview", () => {
    expect(pathExists(research(), "note")).toBe(false)
  })
})
