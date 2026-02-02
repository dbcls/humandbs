import { describe, expect, it } from "bun:test"

import {
  extractAccessionId,
  normalizeHeader,
  isSimilarHeader,
  matchExperiments,
  matchPublications,
  matchGrants,
  matchControlledAccessUsers,
  matchResearchProjects,
} from "@/crawler/processors/merge"
import type {
  SingleLangExperiment,
  SingleLangPublication,
  SingleLangGrant,
  SingleLangPerson,
  SingleLangResearchProject,
  TextValue,
} from "@/crawler/types"

const createTextValue = (text: string): TextValue => ({
  text,
  rawHtml: `<span>${text}</span>`,
})

describe("processors/merge.ts", () => {
  // ===========================================================================
  // extractAccessionId
  // ===========================================================================
  describe("extractAccessionId", () => {
    it("should extract JGAD ID from header", () => {
      const exp: SingleLangExperiment = {
        header: createTextValue("JGAD000123 - Exome sequencing"),
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("JGAD000123")
    })

    it("should extract JGAS ID from header", () => {
      const exp: SingleLangExperiment = {
        header: createTextValue("JGAS000456 study data"),
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("JGAS000456")
    })

    it("should extract DRA ID from header", () => {
      const exp: SingleLangExperiment = {
        header: createTextValue("DRA001234"),
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("DRA001234")
    })

    it("should extract PRJDB ID from header", () => {
      const exp: SingleLangExperiment = {
        header: createTextValue("BioProject PRJDB12345"),
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("PRJDB12345")
    })

    it("should return null for header without accession ID", () => {
      const exp: SingleLangExperiment = {
        header: createTextValue("Exome sequencing data"),
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBeNull()
    })

    it("should return null for empty header", () => {
      const exp: SingleLangExperiment = {
        header: createTextValue(""),
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBeNull()
    })
  })

  // ===========================================================================
  // normalizeHeader
  // ===========================================================================
  describe("normalizeHeader", () => {
    it("should lowercase text", () => {
      expect(normalizeHeader("EXOME DATA")).toBe("exome data")
    })

    it("should replace parentheses with spaces", () => {
      expect(normalizeHeader("data(test)")).toBe("data test")
    })

    it("should replace full-width parentheses with spaces", () => {
      expect(normalizeHeader("data（test）")).toBe("data test")
    })

    it("should replace brackets with spaces", () => {
      expect(normalizeHeader("data[test]")).toBe("data test")
    })

    it("should replace Japanese brackets with spaces", () => {
      expect(normalizeHeader("data「test」")).toBe("data test")
    })

    it("should replace full-width brackets with spaces", () => {
      expect(normalizeHeader("data【test】")).toBe("data test")
    })

    it("should collapse multiple spaces", () => {
      expect(normalizeHeader("data   test")).toBe("data test")
    })

    it("should trim whitespace", () => {
      expect(normalizeHeader("  data  ")).toBe("data")
    })
  })

  // ===========================================================================
  // isSimilarHeader
  // ===========================================================================
  describe("isSimilarHeader", () => {
    it("should return true for exact match after normalization", () => {
      expect(isSimilarHeader("Exome Data", "EXOME DATA")).toBe(true)
    })

    it("should return true when one contains the other", () => {
      expect(isSimilarHeader("Exome", "Exome sequencing")).toBe(true)
      expect(isSimilarHeader("Exome sequencing data", "Exome")).toBe(true)
    })

    it("should return true for matching keywords", () => {
      expect(isSimilarHeader("WGS analysis", "Whole genome WGS")).toBe(true)
      expect(isSimilarHeader("RNA-seq data", "Gene expression RNA-seq")).toBe(true)
      expect(isSimilarHeader("Exome capture", "Whole exome sequencing")).toBe(true)
    })

    it("should return true for microarray keyword match", () => {
      expect(isSimilarHeader("SNP microarray", "Microarray genotyping")).toBe(true)
    })

    it("should return false for unrelated headers", () => {
      expect(isSimilarHeader("Proteomics analysis", "Metabolomics data")).toBe(false)
    })
  })

  // ===========================================================================
  // matchExperiments
  // ===========================================================================
  describe("matchExperiments", () => {
    describe("Strategy 1: exact match by accession ID", () => {
      it("should match experiments with same accession ID", () => {
        const jaExps: SingleLangExperiment[] = [
          { header: createTextValue("JGAD000001 - Exome"), data: {}, footers: [] },
          { header: createTextValue("JGAD000002 - WGS"), data: {}, footers: [] },
        ]
        const enExps: SingleLangExperiment[] = [
          { header: createTextValue("JGAD000002 - Whole genome"), data: {}, footers: [] },
          { header: createTextValue("JGAD000001 - Exome sequencing"), data: {}, footers: [] },
        ]

        const result = matchExperiments(jaExps, enExps)

        expect(result).toHaveLength(2)
        const jgad001 = result.find(r => r.experimentKey === "JGAD000001")
        expect(jgad001?.matchType).toBe("exact")
        expect(jgad001?.ja?.header?.text).toContain("Exome")
        expect(jgad001?.en?.header?.text).toContain("Exome sequencing")
      })
    })

    describe("Strategy 2: fuzzy match by header similarity", () => {
      it("should match experiments with similar headers", () => {
        const jaExps: SingleLangExperiment[] = [
          { header: createTextValue("RNA-seq analysis"), data: {}, footers: [] },
        ]
        const enExps: SingleLangExperiment[] = [
          { header: createTextValue("Gene expression RNA-seq"), data: {}, footers: [] },
        ]

        const result = matchExperiments(jaExps, enExps)

        expect(result).toHaveLength(1)
        expect(result[0].matchType).toBe("fuzzy")
        expect(result[0].ja).not.toBeNull()
        expect(result[0].en).not.toBeNull()
      })
    })

    describe("Strategy 3: position-based match", () => {
      it("should match experiments by position when no other match", () => {
        const jaExps: SingleLangExperiment[] = [
          { header: createTextValue("Data type A"), data: {}, footers: [] },
          { header: createTextValue("Data type B"), data: {}, footers: [] },
        ]
        const enExps: SingleLangExperiment[] = [
          { header: createTextValue("Type X data"), data: {}, footers: [] },
          { header: createTextValue("Type Y data"), data: {}, footers: [] },
        ]

        const result = matchExperiments(jaExps, enExps)

        expect(result).toHaveLength(2)
        expect(result.filter(r => r.matchType === "position")).toHaveLength(2)
      })
    })

    describe("Unmatched handling", () => {
      it("should mark unmatched ja experiments", () => {
        const jaExps: SingleLangExperiment[] = [
          { header: createTextValue("Unique JA data"), data: {}, footers: [] },
        ]
        const enExps: SingleLangExperiment[] = []

        const result = matchExperiments(jaExps, enExps)

        expect(result).toHaveLength(1)
        expect(result[0].matchType).toBe("unmatched-ja")
        expect(result[0].ja).not.toBeNull()
        expect(result[0].en).toBeNull()
      })

      it("should mark unmatched en experiments", () => {
        const jaExps: SingleLangExperiment[] = []
        const enExps: SingleLangExperiment[] = [
          { header: createTextValue("Unique EN data"), data: {}, footers: [] },
        ]

        const result = matchExperiments(jaExps, enExps)

        expect(result).toHaveLength(1)
        expect(result[0].matchType).toBe("unmatched-en")
        expect(result[0].ja).toBeNull()
        expect(result[0].en).not.toBeNull()
      })

      it("should handle mixed matched and unmatched", () => {
        const jaExps: SingleLangExperiment[] = [
          { header: createTextValue("JGAD000001 - Shared"), data: {}, footers: [] },
          { header: createTextValue("JA only data"), data: {}, footers: [] },
        ]
        const enExps: SingleLangExperiment[] = [
          { header: createTextValue("JGAD000001 - Shared EN"), data: {}, footers: [] },
          { header: createTextValue("EN only data"), data: {}, footers: [] },
        ]

        const result = matchExperiments(jaExps, enExps)

        expect(result).toHaveLength(2)
        const exact = result.filter(r => r.matchType === "exact")
        const position = result.filter(r => r.matchType === "position")
        expect(exact).toHaveLength(1)
        expect(position).toHaveLength(1)
      })
    })

    it("should return empty array for empty inputs", () => {
      expect(matchExperiments([], [])).toEqual([])
    })
  })

  // ===========================================================================
  // matchPublications
  // ===========================================================================
  describe("matchPublications", () => {
    it("should match publications by DOI", () => {
      const jaPubs: SingleLangPublication[] = [
        { title: "論文タイトル", doi: "10.1234/test", datasetIds: [] },
      ]
      const enPubs: SingleLangPublication[] = [
        { title: "Paper Title", doi: "10.1234/test", datasetIds: [] },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-doi")
    })

    it("should match publications by datasetIds", () => {
      const jaPubs: SingleLangPublication[] = [
        { title: "論文", doi: null, datasetIds: ["JGAD000001", "JGAD000002"] },
      ]
      const enPubs: SingleLangPublication[] = [
        { title: "Paper", doi: null, datasetIds: ["JGAD000001"] },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-datasetIds")
    })

    it("should match publications by similar title", () => {
      const jaPubs: SingleLangPublication[] = [
        { title: "Genome wide association study of disease X", doi: null, datasetIds: [] },
      ]
      const enPubs: SingleLangPublication[] = [
        { title: "genome wide association study disease x analysis", doi: null, datasetIds: [] },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("fuzzy-title")
    })

    it("should match publications by position when no other match", () => {
      const jaPubs: SingleLangPublication[] = [
        { title: "完全に異なるタイトルA", doi: null, datasetIds: [] },
      ]
      const enPubs: SingleLangPublication[] = [
        { title: "Completely different title B", doi: null, datasetIds: [] },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should handle unmatched publications", () => {
      const jaPubs: SingleLangPublication[] = [
        { title: "日本語の論文タイトルA", doi: null, datasetIds: [] },
        { title: "日本語の論文タイトルB", doi: null, datasetIds: [] },
      ]
      const enPubs: SingleLangPublication[] = [
        { title: "English paper title X", doi: null, datasetIds: [] },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(2)
      expect(result.filter(r => r.matchType === "position")).toHaveLength(1)
      expect(result.filter(r => r.matchType === "unmatched-ja")).toHaveLength(1)
    })

    it("should return empty array for empty inputs", () => {
      expect(matchPublications([], [])).toEqual([])
    })
  })

  // ===========================================================================
  // matchGrants
  // ===========================================================================
  describe("matchGrants", () => {
    it("should match grants by grantId overlap", () => {
      const jaGrants: SingleLangGrant[] = [
        { id: ["JP12345", "JP67890"], title: "研究課題", agency: { name: "JSPS" } },
      ]
      const enGrants: SingleLangGrant[] = [
        { id: ["JP12345"], title: "Research Project", agency: { name: "JSPS" } },
      ]

      const result = matchGrants(jaGrants, enGrants)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-grantId")
    })

    it("should match grants by position when no grantId overlap", () => {
      const jaGrants: SingleLangGrant[] = [
        { id: ["JA001"], title: "研究A", agency: { name: "機関A" } },
      ]
      const enGrants: SingleLangGrant[] = [
        { id: ["EN001"], title: "Research A", agency: { name: "Agency A" } },
      ]

      const result = matchGrants(jaGrants, enGrants)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should handle unmatched grants", () => {
      const jaGrants: SingleLangGrant[] = [
        { id: ["JA001"], title: "研究A", agency: { name: "機関A" } },
        { id: ["JA002"], title: "研究B", agency: { name: "機関B" } },
      ]
      const enGrants: SingleLangGrant[] = [
        { id: ["EN001"], title: "Research A", agency: { name: "Agency A" } },
      ]

      const result = matchGrants(jaGrants, enGrants)

      expect(result).toHaveLength(2)
      expect(result.filter(r => r.matchType === "unmatched-ja")).toHaveLength(1)
    })

    it("should handle grants with empty grantId arrays", () => {
      const jaGrants: SingleLangGrant[] = [
        { id: [], title: "No ID grant", agency: { name: "Agency" } },
      ]
      const enGrants: SingleLangGrant[] = [
        { id: [], title: "No ID grant EN", agency: { name: "Agency" } },
      ]

      const result = matchGrants(jaGrants, enGrants)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should return empty array for empty inputs", () => {
      expect(matchGrants([], [])).toEqual([])
    })
  })

  // ===========================================================================
  // matchControlledAccessUsers
  // ===========================================================================
  describe("matchControlledAccessUsers", () => {
    it("should match users by both datasetIds AND periodOfDataUse", () => {
      const jaUsers: SingleLangPerson[] = [
        {
          name: createTextValue("研究者A"),
          organization: null,
          datasetIds: ["JGAD000001"],
          periodOfDataUse: { startDate: "2024-01-01", endDate: "2024-12-31" },
        },
      ]
      const enUsers: SingleLangPerson[] = [
        {
          name: createTextValue("Researcher A"),
          organization: null,
          datasetIds: ["JGAD000001"],
          periodOfDataUse: { startDate: "2024-01-01", endDate: "2024-12-31" },
        },
      ]

      const result = matchControlledAccessUsers(jaUsers, enUsers)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-both")
    })

    it("should match users by datasetIds only when periods differ", () => {
      const jaUsers: SingleLangPerson[] = [
        {
          name: createTextValue("研究者A"),
          organization: null,
          datasetIds: ["JGAD000001"],
          periodOfDataUse: { startDate: "2024-01-01", endDate: "2024-12-31" },
        },
      ]
      const enUsers: SingleLangPerson[] = [
        {
          name: createTextValue("Researcher A"),
          organization: null,
          datasetIds: ["JGAD000001"],
          periodOfDataUse: { startDate: "2024-06-01", endDate: "2025-05-31" },
        },
      ]

      const result = matchControlledAccessUsers(jaUsers, enUsers)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-datasetIds")
    })

    it("should match users by position when no datasetId overlap", () => {
      const jaUsers: SingleLangPerson[] = [
        {
          name: createTextValue("研究者A"),
          organization: null,
          datasetIds: ["JGAD000001"],
        },
      ]
      const enUsers: SingleLangPerson[] = [
        {
          name: createTextValue("Researcher A"),
          organization: null,
          datasetIds: ["JGAD000002"],
        },
      ]

      const result = matchControlledAccessUsers(jaUsers, enUsers)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should handle unmatched users", () => {
      const jaUsers: SingleLangPerson[] = [
        { name: createTextValue("研究者A"), organization: null },
        { name: createTextValue("研究者B"), organization: null },
      ]
      const enUsers: SingleLangPerson[] = [
        { name: createTextValue("Researcher A"), organization: null },
      ]

      const result = matchControlledAccessUsers(jaUsers, enUsers)

      expect(result).toHaveLength(2)
      expect(result.filter(r => r.matchType === "unmatched-ja")).toHaveLength(1)
    })

    it("should return empty array for empty inputs", () => {
      expect(matchControlledAccessUsers([], [])).toEqual([])
    })
  })

  // ===========================================================================
  // matchResearchProjects
  // ===========================================================================
  describe("matchResearchProjects", () => {
    it("should match projects by URL", () => {
      const jaProjects: SingleLangResearchProject[] = [
        {
          name: createTextValue("プロジェクトA"),
          url: { text: "Project Site", url: "https://example.com/project" },
        },
      ]
      const enProjects: SingleLangResearchProject[] = [
        {
          name: createTextValue("Project A"),
          url: { text: "Project Site", url: "https://example.com/project" },
        },
      ]

      const result = matchResearchProjects(jaProjects, enProjects)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-url")
    })

    it("should match projects by name similarity", () => {
      const jaProjects: SingleLangResearchProject[] = [
        {
          name: createTextValue("Genomics research project analysis"),
          url: null,
        },
      ]
      const enProjects: SingleLangResearchProject[] = [
        {
          name: createTextValue("genomics research project"),
          url: null,
        },
      ]

      const result = matchResearchProjects(jaProjects, enProjects)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("fuzzy-name")
    })

    it("should match projects by position when no URL or name match", () => {
      const jaProjects: SingleLangResearchProject[] = [
        { name: createTextValue("完全に異なるプロジェクト"), url: null },
      ]
      const enProjects: SingleLangResearchProject[] = [
        { name: createTextValue("Completely different project"), url: null },
      ]

      const result = matchResearchProjects(jaProjects, enProjects)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should handle unmatched projects", () => {
      const jaProjects: SingleLangResearchProject[] = [
        { name: createTextValue("JA Project 1"), url: null },
        { name: createTextValue("JA Project 2"), url: null },
      ]
      const enProjects: SingleLangResearchProject[] = [
        { name: createTextValue("EN Project 1"), url: null },
      ]

      const result = matchResearchProjects(jaProjects, enProjects)

      expect(result).toHaveLength(2)
      expect(result.filter(r => r.matchType === "unmatched-ja")).toHaveLength(1)
    })

    it("should return empty array for empty inputs", () => {
      expect(matchResearchProjects([], [])).toEqual([])
    })
  })
})
