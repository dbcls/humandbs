/**
 * JGAD -> Dataset template mapping tests.
 *
 * `getJgadEntry` is stubbed module-wide so we can exercise the property
 * transformation paths without hitting DDBJ Search.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

type JgadEntry = {
  properties: Record<string, unknown>
  datePublished: string | null
} | null

let nextEntry: JgadEntry = null
const getJgadEntryMock = mock(async (_id: string): Promise<JgadEntry> => nextEntry)

void mock.module("@/crawler/api/jga", () => ({
  getJgadEntry: getJgadEntryMock,
}))

// Imported after mock so the mapper picks up the stubbed module.
const { mapJgadToDatasetTemplate } = await import(
  "@/api/routes/templates/mapping-dataset-jgad"
)

beforeEach(() => {
  nextEntry = null
  getJgadEntryMock.mockClear()
})

afterEach(() => {
  nextEntry = null
})

describe("mapJgadToDatasetTemplate", () => {
  it("returns null when the JGAD entry is not present", async () => {
    nextEntry = null
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result).toBeNull()
  })

  it("uses TITLE for typeOfData.en when present", async () => {
    nextEntry = {
      properties: { TITLE: "RNA-Seq of human blood", DATASET_TYPE: "RNA" },
      datePublished: "2024-05-01",
    }
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result?.typeOfData).toEqual({
      ja: null,
      en: "RNA-Seq of human blood",
    })
  })

  it("falls back to DATASET_TYPE (string) when TITLE is absent", async () => {
    nextEntry = {
      properties: { DATASET_TYPE: "Whole genome sequencing" },
      datePublished: null,
    }
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result?.typeOfData?.en).toBe("Whole genome sequencing")
  })

  it("joins DATASET_TYPE arrays with comma+space when TITLE is absent", async () => {
    nextEntry = {
      properties: { DATASET_TYPE: ["WGS", "WES", "RNA-Seq"] },
      datePublished: null,
    }
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result?.typeOfData?.en).toBe("WGS, WES, RNA-Seq")
  })

  it("drops whitespace-only entries from a DATASET_TYPE array", async () => {
    nextEntry = {
      properties: { DATASET_TYPE: ["WGS", "  ", ""] },
      datePublished: null,
    }
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result?.typeOfData?.en).toBe("WGS")
  })

  it("returns typeOfData.en = null when neither TITLE nor DATASET_TYPE yields content", async () => {
    nextEntry = {
      properties: { DESCRIPTION: "ignored" },
      datePublished: null,
    }
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result?.typeOfData).toEqual({ ja: null, en: null })
  })

  it("passes through the date helper result as releaseDate when present", async () => {
    nextEntry = {
      properties: { TITLE: "X" },
      datePublished: "2023-01-15",
    }
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result?.releaseDate).toBe("2023-01-15")
  })

  it("leaves releaseDate undefined when datePublished is null", async () => {
    nextEntry = {
      properties: { TITLE: "X" },
      datePublished: null,
    }
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result?.releaseDate).toBeUndefined()
  })

  it("always emits the controlled-access (Type II) criteria and empty experiments / warnings", async () => {
    nextEntry = {
      properties: { TITLE: "X" },
      datePublished: "2024-01-01",
    }
    const result = await mapJgadToDatasetTemplate("JGAD000001")
    expect(result?.criteria).toBe("Controlled-access (Type II)")
    expect(result?.experiments).toEqual([])
    expect(result?.warnings).toEqual([])
    expect(result?.datasetId).toBeUndefined()
  })

  it("forwards the requestId for symmetry but tolerates omission", async () => {
    nextEntry = {
      properties: { TITLE: "X" },
      datePublished: null,
    }
    expect(
      (await mapJgadToDatasetTemplate("JGAD000001", "req-1"))?.criteria,
    ).toBe("Controlled-access (Type II)")
    expect(
      (await mapJgadToDatasetTemplate("JGAD000001"))?.criteria,
    ).toBe("Controlled-access (Type II)")
  })
})
