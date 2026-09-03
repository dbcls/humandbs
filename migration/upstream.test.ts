import { describe, expect, it } from "vitest"

import { humAccessionRows, loadHumAccessions, type HumAccessionRow } from "./upstream"

function study(accession: string, humLabel = "hum0001"): HumAccessionRow {
  return { accession, humLabel, kind: "jga-study", study: null }
}

function dataset(accession: string, humLabel = "hum0001"): HumAccessionRow {
  return { accession, humLabel, kind: "jga-dataset", study: null }
}

function studyOf(rows: readonly HumAccessionRow[], accession: string): string | null | undefined {
  return rows.find((row) => row.accession === accession)?.study
}

describe("attaching the study a dataset sits under", () => {
  it("attaches the edge upstream draws", () => {
    const rows = humAccessionRows(
      [study("JGAS000001"), dataset("JGAD000001")],
      [["JGAD000001", "JGAS000001"]],
    )

    expect(studyOf(rows, "JGAD000001")).toBe("JGAS000001")
  })

  it("drops an edge into a study the cache does not carry", () => {
    // The edge is drawn over everything registered; the cache holds only what
    // is published, so this would put an accession nobody can open on a page.
    const rows = humAccessionRows(
      [dataset("JGAD000001")],
      [["JGAD000001", "JGAS000404"]],
    )

    expect(studyOf(rows, "JGAD000001")).toBeNull()
  })

  it("leaves a dataset with no edge without a study", () => {
    const rows = humAccessionRows([study("JGAS000001"), dataset("JGAD000001")], [])

    expect(studyOf(rows, "JGAD000001")).toBeNull()
  })

  it("gives a study no study of its own, even when named as one end", () => {
    const rows = humAccessionRows(
      [study("JGAS000001")],
      [["JGAS000001", "JGAS000002"]],
    )

    expect(studyOf(rows, "JGAS000001")).toBeNull()
  })

  it("keeps the first row for an accession named twice, and its edge", () => {
    const rows = humAccessionRows(
      [study("JGAS000001"), dataset("JGAD000001", "hum0001"), dataset("JGAD000001", "hum0002")],
      [["JGAD000001", "JGAS000001"]],
    )

    expect(rows.filter((row) => row.accession === "JGAD000001")).toHaveLength(1)
    expect(rows.find((row) => row.accession === "JGAD000001")?.humLabel).toBe("hum0001")
    expect(studyOf(rows, "JGAD000001")).toBe("JGAS000001")
  })

  it("ignores an edge whose dataset the cache does not carry", () => {
    const rows = humAccessionRows(
      [study("JGAS000001")],
      [["JGAD000404", "JGAS000001"]],
    )

    expect(rows.map((row) => row.accession)).toEqual(["JGAS000001"])
  })
})

describe("the correspondence the development data is seeded with", () => {
  const rows = loadHumAccessions()
  const datasets = rows.filter((row) => row.kind === "jga-dataset")
  const studies = rows.filter((row) => row.kind === "jga-study")

  it("keys one row per accession", () => {
    expect(new Set(rows.map((row) => row.accession)).size).toBe(rows.length)
  })

  it("names only accessions the cache itself carries", () => {
    const published = new Set(studies.map((row) => row.accession))
    const dangling = datasets
      .filter((row) => row.study !== null && !published.has(row.study))
      .map((row) => row.accession)

    expect(dangling).toEqual([])
  })

  it("reaches a study for most datasets, but not for the ones upstream cannot", () => {
    // Upstream has published datasets whose current entry reaches no study.
    // They are known, and are not to be invented here.
    const without = datasets.filter((row) => row.study === null)

    expect(without.length).toBeGreaterThan(0)
    expect(without.length).toBeLessThan(datasets.length / 2)
  })

  it("writes every accession in the shape upstream issues it", () => {
    expect(datasets.every((row) => /^JGAD\d+$/.test(row.accession))).toBe(true)
    expect(studies.every((row) => /^JGAS\d+$/.test(row.accession))).toBe(true)
    expect(datasets.every((row) => row.study === null || /^JGAS\d+$/.test(row.study))).toBe(true)
    expect(rows.every((row) => /^hum\d+$/.test(row.humLabel))).toBe(true)
  })
})
