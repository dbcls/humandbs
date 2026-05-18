/**
 * End-to-end flow tests for `mapDraSubmissionToDatasetTemplate`.
 *
 * Lives in a separate file from `mapping-dataset-dra.test.ts` so the
 * `mock.module(...)` calls do not leak into the pure-function tests in the
 * companion file (bun's mock.module is process-scoped after-the-write).
 *
 * The DDBJ Search API access layer (entries / dblink) is stubbed so we can
 * exercise the traversal, warnings, and de-duplication paths without hitting
 * the network. `biosample.ts` is left real because its parser is a pure
 * function and we want to assert the end-to-end shape it produces.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

import type {
  BiosampleDetail,
  SraExperimentDetail,
  SraSampleDetail,
  SraSubmissionDetail,
} from "@/api/external/ddbj-search/entries"

// --- Stub state -------------------------------------------------------------

const dblinkMap = new Map<string, { type: string; identifier: string }[]>()
const experimentMap = new Map<string, SraExperimentDetail>()
const sampleMap = new Map<string, SraSampleDetail>()
const biosampleMap = new Map<string, BiosampleDetail>()
const sampleFailures = new Set<string>()
const biosampleFailures = new Set<string>()

let nextSubmission: SraSubmissionDetail | null = null
let dblinkSubmissionThrows: string | null = null
let dblinkStudyThrows: string | null = null

const dblinkKey = (type: string, id: string): string => `${type}:${id}`

const fetchSraSubmissionMock = mock(
  async (_id: string, _requestId?: string): Promise<SraSubmissionDetail | null> => nextSubmission,
)

const fetchSraExperimentMock = mock(
  async (id: string, _requestId?: string): Promise<SraExperimentDetail | null> =>
    experimentMap.get(id) ?? null,
)

const fetchSraSampleMock = mock(
  async (id: string, _requestId?: string): Promise<SraSampleDetail | null> => {
    if (sampleFailures.has(id)) {
      throw new Error(`simulated DRS fetch failure for ${id}`)
    }
    return sampleMap.get(id) ?? null
  },
)

const fetchBiosampleMock = mock(
  async (id: string, _requestId?: string): Promise<BiosampleDetail | null> => {
    if (biosampleFailures.has(id)) {
      throw new Error(`simulated BioSample fetch failure for ${id}`)
    }
    return biosampleMap.get(id) ?? null
  },
)

const fetchDblinkMock = mock(
  async (type: string, id: string, _requestId?: string) => {
    const dbXrefs = dblinkMap.get(dblinkKey(type, id)) ?? []
    return { identifier: id, type, dbXrefs }
  },
)

const fetchDblinkTargetsMock = mock(
  async (type: string, id: string, target: string, _requestId?: string): Promise<string[]> => {
    if (type === "sra-submission" && dblinkSubmissionThrows === id) {
      throw new Error(`simulated dblink failure for submission ${id}`)
    }
    if (type === "sra-study" && dblinkStudyThrows === id) {
      throw new Error(`simulated dblink failure for study ${id}`)
    }
    const dbXrefs = dblinkMap.get(dblinkKey(type, id)) ?? []
    return dbXrefs.filter((x) => x.type === target).map((x) => x.identifier)
  },
)

void mock.module("@/api/external/ddbj-search/entries", () => ({
  fetchSraSubmission: fetchSraSubmissionMock,
  fetchSraExperiment: fetchSraExperimentMock,
  fetchSraSample: fetchSraSampleMock,
  fetchBiosample: fetchBiosampleMock,
}))

void mock.module("@/api/external/ddbj-search/dblink", () => ({
  DblinkAccessionType: {
    SRA_SUBMISSION: "sra-submission",
    SRA_STUDY: "sra-study",
    SRA_EXPERIMENT: "sra-experiment",
    SRA_RUN: "sra-run",
    SRA_SAMPLE: "sra-sample",
    SRA_ANALYSIS: "sra-analysis",
    JGA_STUDY: "jga-study",
    JGA_DATASET: "jga-dataset",
    JGA_DAC: "jga-dac",
    JGA_POLICY: "jga-policy",
    BIOPROJECT: "bioproject",
    BIOSAMPLE: "biosample",
    HUMANDBS: "humandbs",
  },
  fetchDblink: fetchDblinkMock,
  fetchDblinkTargets: fetchDblinkTargetsMock,
}))

const { mapDraSubmissionToDatasetTemplate } = await import(
  "@/api/routes/templates/mapping-dataset-dra"
)

// --- Helpers ---------------------------------------------------------------

const resetState = (): void => {
  dblinkMap.clear()
  experimentMap.clear()
  sampleMap.clear()
  biosampleMap.clear()
  sampleFailures.clear()
  biosampleFailures.clear()
  nextSubmission = null
  dblinkSubmissionThrows = null
  dblinkStudyThrows = null
}

const setDblink = (
  type: string,
  id: string,
  dbXrefs: { type: string; identifier: string }[],
): void => {
  dblinkMap.set(dblinkKey(type, id), dbXrefs)
}

const makeExperiment = (
  id: string,
  overrides: Partial<SraExperimentDetail> = {},
): SraExperimentDetail => ({
  identifier: id,
  title: `${id} title`,
  description: null,
  libraryStrategy: ["WGS"],
  libraryLayout: "PAIRED",
  platform: "ILLUMINA",
  instrumentModel: ["HiSeq 2000"],
  ...overrides,
})

beforeEach(() => {
  resetState()
  fetchSraSubmissionMock.mockClear()
  fetchSraExperimentMock.mockClear()
  fetchSraSampleMock.mockClear()
  fetchBiosampleMock.mockClear()
  fetchDblinkMock.mockClear()
  fetchDblinkTargetsMock.mockClear()
})

afterEach(() => {
  resetState()
})

// --- Tests ------------------------------------------------------------------

describe("mapDraSubmissionToDatasetTemplate", () => {
  it("returns null when the root submission is not found", async () => {
    nextSubmission = null
    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result).toBeNull()
    expect(fetchDblinkMock).not.toHaveBeenCalled()
  })

  it("returns empty experiments / warnings when no DRP is linked", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "Empty submission",
      description: null,
      datePublished: "2024-05-01T00:00:00Z",
    }
    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result).not.toBeNull()
    expect(result?.experiments).toEqual([])
    expect(result?.warnings).toEqual([])
    expect(result?.criteria).toBe("Unrestricted-access")
    expect(result?.releaseDate).toBe("2024-05-01")
    expect(result?.typeOfData).toEqual({ ja: null, en: "Empty submission" })
  })

  it("uses submission.description when title is empty", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: null,
      description: "Fallback description",
      datePublished: null,
    }
    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.typeOfData?.en).toBe("Fallback description")
    expect(result?.releaseDate).toBeUndefined()
  })

  it("traverses DRP -> DRX with exactly one dblink call per DRX", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "T",
      description: null,
      datePublished: "2024-01-01",
    }
    setDblink("sra-submission", "DRA000001", [
      { type: "sra-study", identifier: "DRP000001" },
    ])
    setDblink("sra-study", "DRP000001", [
      { type: "sra-experiment", identifier: "DRX000001" },
      { type: "sra-experiment", identifier: "DRX000002" },
    ])
    setDblink("sra-experiment", "DRX000001", [
      { type: "sra-run", identifier: "DRR000001" },
      { type: "sra-sample", identifier: "DRS000001" },
      { type: "biosample", identifier: "SAMD00000001" },
    ])
    setDblink("sra-experiment", "DRX000002", [
      { type: "sra-run", identifier: "DRR000002" },
    ])
    experimentMap.set("DRX000001", makeExperiment("DRX000001"))
    experimentMap.set("DRX000002", makeExperiment("DRX000002", { libraryLayout: "SINGLE" }))
    sampleMap.set("DRS000001", {
      identifier: "DRS000001",
      organism: { name: "Homo sapiens", identifier: "9606" },
    })
    biosampleMap.set("SAMD00000001", {
      identifier: "SAMD00000001",
      properties: {
        BioSample: {
          Attributes: {
            Attribute: [
              {
                attribute_name: "tissue",
                harmonized_name: "tissue",
                content: "blood",
              },
            ],
          },
        },
      },
    })

    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.experiments).toHaveLength(2)

    // dblink calls: 1 submission -> study, 1 study -> experiment, plus 1 per DRX
    const drxDblinkCalls = fetchDblinkMock.mock.calls.filter(
      ([type]) => type === "sra-experiment",
    )
    expect(drxDblinkCalls).toHaveLength(2)

    const drx1 = result?.experiments?.find(
      (e) => e.header.en?.text === "DRX000001",
    )
    expect(drx1?.searchable?.assayType).toEqual(["WGS"])
    expect(drx1?.searchable?.readType).toBe("paired-end")
    expect(drx1?.data.Organism?.en?.text).toBe(
      "Homo sapiens (taxonomy_id: 9606)",
    )
    expect(drx1?.data["Run Accessions"]?.en?.text).toBe("DRR000001")
    expect(drx1?.data.tissue?.en?.text).toBe("blood")

    const drx2 = result?.experiments?.find(
      (e) => e.header.en?.text === "DRX000002",
    )
    expect(drx2?.searchable?.readType).toBe("single-end")
    expect(drx2?.data.Organism).toBeUndefined()
  })

  it("records DRS fetch failure as a warning but still emits the row", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "T",
      description: null,
      datePublished: null,
    }
    setDblink("sra-submission", "DRA000001", [
      { type: "sra-study", identifier: "DRP000001" },
    ])
    setDblink("sra-study", "DRP000001", [
      { type: "sra-experiment", identifier: "DRX000001" },
    ])
    setDblink("sra-experiment", "DRX000001", [
      { type: "sra-sample", identifier: "DRS000001" },
    ])
    experimentMap.set("DRX000001", makeExperiment("DRX000001"))
    sampleFailures.add("DRS000001")

    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.experiments).toHaveLength(1)
    expect(result?.experiments?.[0].data.Organism).toBeUndefined()
    expect(result?.warnings.some((w) => w.includes("DRX000001 DRS DRS000001"))).toBe(
      true,
    )
  })

  it("records BioSample fetch failure as a warning but still emits the row", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "T",
      description: null,
      datePublished: null,
    }
    setDblink("sra-submission", "DRA000001", [
      { type: "sra-study", identifier: "DRP000001" },
    ])
    setDblink("sra-study", "DRP000001", [
      { type: "sra-experiment", identifier: "DRX000001" },
    ])
    setDblink("sra-experiment", "DRX000001", [
      { type: "biosample", identifier: "SAMD00000001" },
    ])
    experimentMap.set("DRX000001", makeExperiment("DRX000001"))
    biosampleFailures.add("SAMD00000001")

    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.experiments).toHaveLength(1)
    expect(
      result?.warnings.some((w) =>
        w.includes("DRX000001 BioSample SAMD00000001"),
      ),
    ).toBe(true)
  })

  it("records DRX-level fetch failure when the experiment entry is missing (404)", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "T",
      description: null,
      datePublished: null,
    }
    setDblink("sra-submission", "DRA000001", [
      { type: "sra-study", identifier: "DRP000001" },
    ])
    setDblink("sra-study", "DRP000001", [
      { type: "sra-experiment", identifier: "DRX000001" },
      { type: "sra-experiment", identifier: "DRX000002" },
    ])
    setDblink("sra-experiment", "DRX000001", [])
    setDblink("sra-experiment", "DRX000002", [])
    experimentMap.set("DRX000002", makeExperiment("DRX000002"))
    // DRX000001 not present -> fetchSraExperiment returns null -> 404 warning

    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.experiments).toHaveLength(1)
    expect(result?.experiments?.[0].header.en?.text).toBe("DRX000002")
    expect(
      result?.warnings.some((w) =>
        w.includes("DRX000001: sra-experiment entry not found"),
      ),
    ).toBe(true)
  })

  it("de-duplicates DRX accessions linked from multiple DRP", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "T",
      description: null,
      datePublished: null,
    }
    setDblink("sra-submission", "DRA000001", [
      { type: "sra-study", identifier: "DRP000001" },
      { type: "sra-study", identifier: "DRP000002" },
    ])
    setDblink("sra-study", "DRP000001", [
      { type: "sra-experiment", identifier: "DRX000001" },
    ])
    setDblink("sra-study", "DRP000002", [
      { type: "sra-experiment", identifier: "DRX000001" },
    ])
    setDblink("sra-experiment", "DRX000001", [])
    experimentMap.set("DRX000001", makeExperiment("DRX000001"))

    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.experiments).toHaveLength(1)
    // 1 dblink per unique DRX, not per DRP-DRX edge
    const drxDblinkCalls = fetchDblinkMock.mock.calls.filter(
      ([type]) => type === "sra-experiment",
    )
    expect(drxDblinkCalls).toHaveLength(1)
  })

  it("records study-level dblink failure as a warning and continues", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "T",
      description: null,
      datePublished: null,
    }
    dblinkSubmissionThrows = "DRA000001"
    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.experiments).toEqual([])
    expect(
      result?.warnings.some((w) => w.includes("dblink to sra-study failed")),
    ).toBe(true)
  })
})
