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
  SraRunDetail,
  SraSampleDetail,
  SraStudyDetail,
  SraSubmissionDetail,
} from "@/api/external/ddbj-search/entries"

// --- Stub state -------------------------------------------------------------

const dblinkMap = new Map<string, { type: string; identifier: string }[]>()
const experimentMap = new Map<string, SraExperimentDetail>()
const sampleMap = new Map<string, SraSampleDetail>()
const biosampleMap = new Map<string, BiosampleDetail>()
const studyMap = new Map<string, SraStudyDetail>()
const runMap = new Map<string, SraRunDetail>()
const sampleFailures = new Set<string>()
const biosampleFailures = new Set<string>()
const runFailures = new Set<string>()
const studyFailures = new Set<string>()

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

const fetchSraStudyMock = mock(
  async (id: string, _requestId?: string): Promise<SraStudyDetail | null> => {
    if (studyFailures.has(id)) {
      throw new Error(`simulated DRP fetch failure for ${id}`)
    }
    return studyMap.get(id) ?? null
  },
)

const fetchSraRunMock = mock(
  async (id: string, _requestId?: string): Promise<SraRunDetail | null> => {
    if (runFailures.has(id)) {
      throw new Error(`simulated DRR fetch failure for ${id}`)
    }
    return runMap.get(id) ?? null
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
  fetchSraStudy: fetchSraStudyMock,
  fetchSraRun: fetchSraRunMock,
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
  studyMap.clear()
  runMap.clear()
  sampleFailures.clear()
  biosampleFailures.clear()
  studyFailures.clear()
  runFailures.clear()
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
  fetchSraStudyMock.mockClear()
  fetchSraRunMock.mockClear()
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

  it("prefers the DRP STUDY title for typeOfData over the submission's own (accession-shaped) title", async () => {
    // Real-world quirk: many submissions have title === accession ID, which
    // is uninformative as a dataset typeOfData. We expect the STUDY title
    // wins, even when submission.title is non-null.
    nextSubmission = {
      identifier: "DRA000001",
      title: "DRA000001",
      description: null,
      datePublished: null,
    }
    setDblink("sra-submission", "DRA000001", [
      { type: "sra-study", identifier: "DRP000001" },
    ])
    studyMap.set("DRP000001", {
      identifier: "DRP000001",
      title: "Whole genome sequencing of B. subtilis natto BEST195",
    })
    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.typeOfData?.en).toBe(
      "Whole genome sequencing of B. subtilis natto BEST195",
    )
  })

  it("falls back to submission.title when DRP study has no title", async () => {
    nextSubmission = {
      identifier: "DRA000002",
      title: "Informative submission title",
      description: "ignored description",
      datePublished: null,
    }
    setDblink("sra-submission", "DRA000002", [
      { type: "sra-study", identifier: "DRP000002" },
    ])
    studyMap.set("DRP000002", { identifier: "DRP000002", title: null })
    const result = await mapDraSubmissionToDatasetTemplate("DRA000002")
    expect(result?.typeOfData?.en).toBe("Informative submission title")
  })

  it("falls back to submission.description when neither study nor non-accession submission title is available", async () => {
    nextSubmission = {
      identifier: "DRA000003",
      title: "DRA000003",
      description: "Useful description",
      datePublished: null,
    }
    // No DRP linked -> studyTitleEn stays null
    const result = await mapDraSubmissionToDatasetTemplate("DRA000003")
    expect(result?.typeOfData?.en).toBe("Useful description")
  })

  it("records DRP study fetch failure as a warning and continues (typeOfData falls back)", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "Submission Fallback Title",
      description: null,
      datePublished: null,
    }
    setDblink("sra-submission", "DRA000001", [
      { type: "sra-study", identifier: "DRP000001" },
    ])
    studyFailures.add("DRP000001")
    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    expect(result?.typeOfData?.en).toBe("Submission Fallback Title")
    expect(
      result?.warnings.some((w) => w.includes("sra-study fetch failed")),
    ).toBe(true)
  })

  it("populates Run Date / Run Center / Nominal Insert Size / Center Name from deep properties", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "DRA000001",
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
      { type: "sra-run", identifier: "DRR000001" },
    ])
    experimentMap.set("DRX000001", {
      identifier: "DRX000001",
      title: "Exp",
      libraryStrategy: ["WGS"],
      libraryLayout: "PAIRED",
      platform: "ILLUMINA",
      instrumentModel: ["Illumina Genome Analyzer II"],
      properties: {
        EXPERIMENT_SET: {
          EXPERIMENT: {
            center_name: "KEIO",
            DESIGN: {
              LIBRARY_DESCRIPTOR: {
                LIBRARY_LAYOUT: {
                  PAIRED: { NOMINAL_LENGTH: "163", NOMINAL_SDEV: "24.7558" },
                },
              },
              SPOT_DESCRIPTOR: {
                SPOT_DECODE_SPEC: { SPOT_LENGTH: "72" },
              },
            },
          },
        },
      },
    })
    runMap.set("DRR000001", {
      identifier: "DRR000001",
      properties: {
        RUN_SET: {
          RUN: { run_date: "2008-09-13T01:27:27+09:00", run_center: "NIG" },
        },
      },
    })

    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    const row = result?.experiments?.[0]
    expect(row?.data["Nominal Insert Size"]?.en?.text).toBe("163")
    expect(row?.data["Nominal Insert SDEV"]?.en?.text).toBe("24.7558")
    expect(row?.data["Spot Length"]?.en?.text).toBe("72")
    expect(row?.data["Center Name"]?.en?.text).toBe("KEIO")
    expect(row?.data["Run Date"]?.en?.text).toBe(
      "2008-09-13T01:27:27+09:00",
    )
    expect(row?.data["Run Center"]?.en?.text).toBe("NIG")
    expect(row?.searchable?.readLength).toBe(36)
  })

  it("records DRR fetch failure as a warning and leaves Run Date / Run Center blank", async () => {
    nextSubmission = {
      identifier: "DRA000001",
      title: "DRA000001",
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
      { type: "sra-run", identifier: "DRR000001" },
    ])
    experimentMap.set("DRX000001", {
      identifier: "DRX000001",
      libraryLayout: "PAIRED",
    })
    runFailures.add("DRR000001")

    const result = await mapDraSubmissionToDatasetTemplate("DRA000001")
    const row = result?.experiments?.[0]
    expect(row?.data["Run Date"]).toBeUndefined()
    expect(row?.data["Run Center"]).toBeUndefined()
    expect(
      result?.warnings.some((w) =>
        w.includes("DRX000001 DRR DRR000001: fetch failed"),
      ),
    ).toBe(true)
  })
})
