import { describe, it, expect } from "bun:test"
import {
  extractDatasetIdsFromMolData,
  invertMolTableToDataset,
  buildDatasetMetadataMap,
  isExperimentsEqual,
  assignDatasetVersion,
  transformDataProvider,
  transformControlledAccessUsers,
  transformGrants,
  transformPublications,
  transformResearchProjects,
  buildDatasetIdExpansionMap,
  expandDatasetIds,
} from "@/crawler/transform"
import type {
  NormalizedMolecularData,
  NormalizedDataset,
  TransformedExperiment,
  TransformedDataset,
  NormalizedParseResult,
} from "@/crawler/types"

describe("transform.ts", () => {
  describe("extractDatasetIdsFromMolData", () => {
    it("should extract JGAD IDs from header", () => {
      const molData: NormalizedMolecularData = {
        id: { text: "JGAD000001", rawHtml: "JGAD000001" },
        data: {},
        footers: [],
      }
      const result = extractDatasetIdsFromMolData(molData)
      expect(result.JGAD).toBeDefined()
      expect([...result.JGAD!]).toContain("JGAD000001")
    })

    it("should extract DRA IDs from data fields", () => {
      const molData: NormalizedMolecularData = {
        id: { text: "Sample", rawHtml: "Sample" },
        data: {
          "Sequence Read Archive Accession": {
            text: "DRA000001",
            rawHtml: "<a href='...'>DRA000001</a>",
          },
        },
        footers: [],
      }
      const result = extractDatasetIdsFromMolData(molData)
      expect(result.DRA).toBeDefined()
      expect([...result.DRA!]).toContain("DRA000001")
    })

    it("should extract GEA IDs", () => {
      const molData: NormalizedMolecularData = {
        id: { text: "E-GEAD-123", rawHtml: "E-GEAD-123" },
        data: {},
        footers: [],
      }
      const result = extractDatasetIdsFromMolData(molData)
      expect(result.GEA).toBeDefined()
      expect([...result.GEA!]).toContain("E-GEAD-123")
    })

    it("should skip invalid GEA IDs", () => {
      const molData: NormalizedMolecularData = {
        id: { text: "E-GEAD-000", rawHtml: "E-GEAD-000" },
        data: {},
        footers: [],
      }
      const result = extractDatasetIdsFromMolData(molData)
      // GEA may be undefined or an empty set (invalid IDs are skipped)
      if (result.GEA) {
        expect(result.GEA.size).toBe(0)
      } else {
        expect(result.GEA).toBeUndefined()
      }
    })

    it("should apply special case transformation for AP023461-AP024084", () => {
      const molData: NormalizedMolecularData = {
        id: { text: "AP023461-AP024084", rawHtml: "AP023461-AP024084" },
        data: {},
        footers: [],
      }
      const result = extractDatasetIdsFromMolData(molData)
      expect(result.BP).toBeDefined()
      expect([...result.BP!]).toContain("PRJDB10452")
    })

    it("should extract BP IDs", () => {
      const molData: NormalizedMolecularData = {
        id: { text: "PRJDB12345", rawHtml: "PRJDB12345" },
        data: {},
        footers: [],
      }
      const result = extractDatasetIdsFromMolData(molData)
      expect(result.BP).toBeDefined()
      expect([...result.BP!]).toContain("PRJDB12345")
    })

    it("should extract METABO IDs", () => {
      const molData: NormalizedMolecularData = {
        id: { text: "MTBKS123", rawHtml: "MTBKS123" },
        data: {},
        footers: [],
      }
      const result = extractDatasetIdsFromMolData(molData)
      expect(result.METABO).toBeDefined()
      expect([...result.METABO!]).toContain("MTBKS123")
    })

    it("should extract multiple IDs from same field", () => {
      const molData: NormalizedMolecularData = {
        id: { text: "JGAD000001, JGAD000002", rawHtml: "JGAD000001, JGAD000002" },
        data: {},
        footers: [],
      }
      const result = extractDatasetIdsFromMolData(molData)
      expect(result.JGAD).toBeDefined()
      expect([...result.JGAD!]).toContain("JGAD000001")
      expect([...result.JGAD!]).toContain("JGAD000002")
    })
  })

  describe("invertMolTableToDataset", () => {
    it("should invert single molData to dataset", async () => {
      const molecularData: NormalizedMolecularData[] = [
        {
          id: { text: "JGAD000001", rawHtml: "JGAD000001" },
          data: {},
          footers: [],
        },
      ]
      const result = await invertMolTableToDataset(molecularData)
      expect(result.has("JGAD000001")).toBe(true)
      expect(result.get("JGAD000001")).toHaveLength(1)
    })

    it("should group multiple molData by same datasetId", async () => {
      const molecularData: NormalizedMolecularData[] = [
        {
          id: { text: "JGAD000001-A", rawHtml: "JGAD000001-A" },
          data: {},
          footers: [],
        },
        {
          id: { text: "JGAD000001-B", rawHtml: "JGAD000001-B" },
          data: {},
          footers: [],
        },
      ]
      const result = await invertMolTableToDataset(molecularData)
      expect(result.has("JGAD000001")).toBe(true)
      expect(result.get("JGAD000001")).toHaveLength(2)
    })

    it("should handle empty molecularData array", async () => {
      const result = await invertMolTableToDataset([])
      expect(result.size).toBe(0)
    })
  })

  describe("buildDatasetMetadataMap", () => {
    it("should build metadata map from datasets", () => {
      const datasets: NormalizedDataset[] = [
        {
          datasetId: ["JGAD000001"],
          typeOfData: "WGS",
          criteria: ["Controlled-access (Type I)"],
          releaseDate: ["2024-01-01"],
        },
      ]
      const result = buildDatasetMetadataMap(datasets)
      expect(result.has("JGAD000001")).toBe(true)
      const metadata = result.get("JGAD000001")!
      expect(metadata.typeOfData).toEqual("WGS")
      expect(metadata.criteria).toEqual(["Controlled-access (Type I)"])
      expect(metadata.releaseDate).toEqual(["2024-01-01"])
    })

    it("should handle null datasetId", () => {
      const datasets: NormalizedDataset[] = [
        {
          datasetId: null,
          typeOfData: "WGS",
          criteria: null,
          releaseDate: null,
        },
      ]
      const result = buildDatasetMetadataMap(datasets)
      expect(result.size).toBe(0)
    })

    it("should handle multiple datasetIds in one dataset", () => {
      const datasets: NormalizedDataset[] = [
        {
          datasetId: ["JGAD000001", "JGAD000002"],
          typeOfData: "WGS",
          criteria: null,
          releaseDate: null,
        },
      ]
      const result = buildDatasetMetadataMap(datasets)
      expect(result.has("JGAD000001")).toBe(true)
      expect(result.has("JGAD000002")).toBe(true)
    })
  })

  describe("isExperimentsEqual", () => {
    it("should return true for equal experiments", () => {
      const exp1: TransformedExperiment[] = [
        { header: { text: "A", rawHtml: "A" }, data: {}, footers: [] },
      ]
      const exp2: TransformedExperiment[] = [
        { header: { text: "A", rawHtml: "A" }, data: {}, footers: [] },
      ]
      expect(isExperimentsEqual(exp1, exp2)).toBe(true)
    })

    it("should return false for different experiments", () => {
      const exp1: TransformedExperiment[] = [
        { header: { text: "A", rawHtml: "A" }, data: {}, footers: [] },
      ]
      const exp2: TransformedExperiment[] = [
        { header: { text: "B", rawHtml: "B" }, data: {}, footers: [] },
      ]
      expect(isExperimentsEqual(exp1, exp2)).toBe(false)
    })

    it("should return false for different lengths", () => {
      const exp1: TransformedExperiment[] = [
        { header: { text: "A", rawHtml: "A" }, data: {}, footers: [] },
      ]
      const exp2: TransformedExperiment[] = []
      expect(isExperimentsEqual(exp1, exp2)).toBe(false)
    })
  })

  describe("assignDatasetVersion", () => {
    it("should assign v1 for first version", () => {
      const experiments: TransformedExperiment[] = [
        { header: { text: "A", rawHtml: "A" }, data: {}, footers: [] },
      ]
      const existingVersions = new Map<string, TransformedDataset[]>()
      const version = assignDatasetVersion("JGAD000001", "ja", experiments, existingVersions)
      expect(version).toBe("v1")
    })

    it("should return existing version for same experiments", () => {
      const experiments: TransformedExperiment[] = [
        { header: { text: "A", rawHtml: "A" }, data: {}, footers: [] },
      ]
      const existingVersions = new Map<string, TransformedDataset[]>([
        ["JGAD000001-ja", [
          {
            datasetId: "JGAD000001",
            lang: "ja",
            version: "v1",
            versionReleaseDate: "2024-01-01",
            humId: "hum0001",
            humVersionId: "hum0001-v1",
            typeOfData: null,
            criteria: null,
            releaseDate: null,
            experiments,
          },
        ]],
      ])
      const version = assignDatasetVersion("JGAD000001", "ja", experiments, existingVersions)
      expect(version).toBe("v1")
    })

    it("should assign new version for different experiments", () => {
      const existingExperiments: TransformedExperiment[] = [
        { header: { text: "A", rawHtml: "A" }, data: {}, footers: [] },
      ]
      const newExperiments: TransformedExperiment[] = [
        { header: { text: "B", rawHtml: "B" }, data: {}, footers: [] },
      ]
      const existingVersions = new Map<string, TransformedDataset[]>([
        ["JGAD000001-ja", [
          {
            datasetId: "JGAD000001",
            lang: "ja",
            version: "v1",
            versionReleaseDate: "2024-01-01",
            humId: "hum0001",
            humVersionId: "hum0001-v1",
            typeOfData: null,
            criteria: null,
            releaseDate: null,
            experiments: existingExperiments,
          },
        ]],
      ])
      const version = assignDatasetVersion("JGAD000001", "ja", newExperiments, existingVersions)
      expect(version).toBe("v2")
    })
  })

  describe("transformDataProvider", () => {
    it("should transform data provider with PI and affiliation", () => {
      const dp: NormalizedParseResult["dataProvider"] = {
        principalInvestigator: [{ text: "Dr. Smith", rawHtml: "Dr. Smith" }],
        affiliation: [{ text: "University", rawHtml: "University" }],
        projectName: [],
        projectUrl: [],
        grants: [],
      }
      const result = transformDataProvider(dp)
      expect(result).toHaveLength(1)
      expect(result[0].name).toEqual({ text: "Dr. Smith", rawHtml: "Dr. Smith" })
      expect(result[0].organization?.name).toEqual({ text: "University", rawHtml: "University" })
    })

    it("should handle more PIs than affiliations", () => {
      const dp: NormalizedParseResult["dataProvider"] = {
        principalInvestigator: [
          { text: "Dr. Smith", rawHtml: "Dr. Smith" },
          { text: "Dr. Jones", rawHtml: "Dr. Jones" },
        ],
        affiliation: [{ text: "University", rawHtml: "University" }],
        projectName: [],
        projectUrl: [],
        grants: [],
      }
      const result = transformDataProvider(dp)
      expect(result).toHaveLength(2)
      expect(result[0].organization?.name).toEqual({ text: "University", rawHtml: "University" })
      expect(result[1].organization).toBeNull()
    })
  })

  describe("transformGrants", () => {
    it("should transform grant with all fields", () => {
      const grants: NormalizedParseResult["dataProvider"]["grants"] = [
        {
          grantName: "JSPS",
          projectTitle: "Research Project",
          grantId: ["12345"],
        },
      ]
      const result = transformGrants(grants)
      expect(result).toHaveLength(1)
      expect(result[0].agency.name).toBe("JSPS")
      expect(result[0].title).toBe("Research Project")
      expect(result[0].id).toEqual(["12345"])
    })

    it("should filter out grants without any fields", () => {
      const grants: NormalizedParseResult["dataProvider"]["grants"] = [
        {
          grantName: null,
          projectTitle: null,
          grantId: null,
        },
      ]
      const result = transformGrants(grants)
      expect(result).toHaveLength(0)
    })

    it("should handle null grantId", () => {
      const grants: NormalizedParseResult["dataProvider"]["grants"] = [
        {
          grantName: "JSPS",
          projectTitle: null,
          grantId: null,
        },
      ]
      const result = transformGrants(grants)
      expect(result).toHaveLength(1)
      expect(result[0].id).toEqual([])
    })
  })

  describe("buildDatasetIdExpansionMap", () => {
    it("should build expansion map for molData with multiple datasetIds", async () => {
      const molecularData: NormalizedMolecularData[] = [
        {
          id: { text: "JGAD000001, JGAD000002", rawHtml: "JGAD000001, JGAD000002" },
          data: {},
          footers: [],
        },
      ]
      const invertedMap = await invertMolTableToDataset(molecularData)
      const expansionMap = buildDatasetIdExpansionMap(molecularData, invertedMap)
      // Each ID should expand to all IDs in the same molTable
      const expanded1 = expansionMap.get("JGAD000001")
      const expanded2 = expansionMap.get("JGAD000002")
      expect(expanded1).toBeDefined()
      expect(expanded2).toBeDefined()
    })
  })

  describe("expandDatasetIds", () => {
    it("should expand datasetIds using expansion map", () => {
      const expansionMap = new Map<string, Set<string>>([
        ["JGAD000001", new Set(["JGAD000001", "JGAD000002"])],
      ])
      const result = expandDatasetIds(["JGAD000001"], expansionMap)
      expect(result).toContain("JGAD000001")
      expect(result).toContain("JGAD000002")
    })

    it("should keep original if no expansion found", () => {
      const expansionMap = new Map<string, Set<string>>()
      const result = expandDatasetIds(["JGAD000003"], expansionMap)
      expect(result).toEqual(["JGAD000003"])
    })

    it("should sort expanded results", () => {
      const expansionMap = new Map<string, Set<string>>([
        ["JGAD000002", new Set(["JGAD000002", "JGAD000001"])],
      ])
      const result = expandDatasetIds(["JGAD000002"], expansionMap)
      expect(result).toEqual(["JGAD000001", "JGAD000002"])
    })
  })

  describe("transformPublications", () => {
    it("should transform publications with title and doi", () => {
      const pubs: NormalizedParseResult["publications"] = [
        {
          title: "Research Paper",
          doi: "10.1234/example",
          datasetIds: [],
        },
      ]
      const expansionMap = new Map<string, Set<string>>()
      const result = transformPublications(pubs, expansionMap)
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe("Research Paper")
      expect(result[0].doi).toBe("10.1234/example")
    })

    it("should filter out publications without title", () => {
      const pubs: NormalizedParseResult["publications"] = [
        {
          title: null,
          doi: "10.1234/example",
          datasetIds: [],
        },
      ]
      const expansionMap = new Map<string, Set<string>>()
      const result = transformPublications(pubs, expansionMap)
      expect(result).toHaveLength(0)
    })

    it("should expand datasetIds in publications", () => {
      const pubs: NormalizedParseResult["publications"] = [
        {
          title: "Research Paper",
          doi: null,
          datasetIds: ["JGAD000001"],
        },
      ]
      const expansionMap = new Map<string, Set<string>>([
        ["JGAD000001", new Set(["JGAD000001", "JGAD000002"])],
      ])
      const result = transformPublications(pubs, expansionMap)
      expect(result[0].datasetIds).toContain("JGAD000001")
      expect(result[0].datasetIds).toContain("JGAD000002")
    })
  })

  describe("transformResearchProjects", () => {
    it("should transform research projects with name and url", () => {
      const dp: NormalizedParseResult["dataProvider"] = {
        principalInvestigator: [],
        affiliation: [],
        projectName: [{ text: "Project A", rawHtml: "Project A" }],
        projectUrl: [{ text: "URL", url: "https://example.com" }],
        grants: [],
      }
      const result = transformResearchProjects(dp)
      expect(result).toHaveLength(1)
      expect(result[0].name).toEqual({ text: "Project A", rawHtml: "Project A" })
      expect(result[0].url).toEqual({ text: "URL", url: "https://example.com" })
    })

    it("should handle more names than urls", () => {
      const dp: NormalizedParseResult["dataProvider"] = {
        principalInvestigator: [],
        affiliation: [],
        projectName: [
          { text: "Project A", rawHtml: "Project A" },
          { text: "Project B", rawHtml: "Project B" },
        ],
        projectUrl: [{ text: "URL", url: "https://example.com" }],
        grants: [],
      }
      const result = transformResearchProjects(dp)
      expect(result).toHaveLength(2)
      expect(result[0].url).toEqual({ text: "URL", url: "https://example.com" })
      expect(result[1].url).toBeNull()
    })
  })

  describe("transformControlledAccessUsers", () => {
    it("should transform controlled access users", () => {
      const users: NormalizedParseResult["controlledAccessUsers"] = [
        {
          principalInvestigator: "Dr. Smith",
          affiliation: "University",
          country: "Japan",
          researchTitle: "Research Project",
          datasetIds: [],
          periodOfDataUse: { startDate: "2024-01-01", endDate: "2024-12-31" },
        },
      ]
      const expansionMap = new Map<string, Set<string>>()
      const result = transformControlledAccessUsers(users, expansionMap)
      expect(result).toHaveLength(1)
      expect(result[0].name.text).toBe("Dr. Smith")
      expect(result[0].organization?.name.text).toBe("University")
      expect(result[0].organization?.address?.country).toBe("Japan")
    })

    it("should expand datasetIds in controlled access users", () => {
      const users: NormalizedParseResult["controlledAccessUsers"] = [
        {
          principalInvestigator: "Dr. Smith",
          affiliation: null,
          country: null,
          researchTitle: null,
          datasetIds: ["JGAD000001"],
          periodOfDataUse: null,
        },
      ]
      const expansionMap = new Map<string, Set<string>>([
        ["JGAD000001", new Set(["JGAD000001", "JGAD000002"])],
      ])
      const result = transformControlledAccessUsers(users, expansionMap)
      expect(result[0].datasetIds).toContain("JGAD000001")
      expect(result[0].datasetIds).toContain("JGAD000002")
    })
  })
})
