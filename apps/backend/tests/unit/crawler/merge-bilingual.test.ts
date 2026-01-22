import { describe, it, expect } from "bun:test"

import {
  extractAccessionId,
  normalizeHeader,
  isSimilarHeader,
  matchExperiments,
  matchPublications,
  matchGrants,
  matchControlledAccessUsers,
  matchResearchProjects,
} from "@/crawler/merge-bilingual"
import type {
  TransformedExperiment,
  TransformedPublication,
  TransformedGrant,
  TransformedPerson,
  TransformedResearchProject,
} from "@/crawler/types"

describe("merge-bilingual.ts", () => {
  describe("extractAccessionId", () => {
    it("should extract JGAD IDs from header", () => {
      const exp: TransformedExperiment = {
        header: { text: "JGAD000001", rawHtml: "JGAD000001" },
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("JGAD000001")
    })

    it("should extract JGAS IDs from header", () => {
      const exp: TransformedExperiment = {
        header: { text: "JGAS000123", rawHtml: "JGAS000123" },
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("JGAS000123")
    })

    it("should extract DRA IDs from header", () => {
      const exp: TransformedExperiment = {
        header: { text: "Exome (DRA001234)", rawHtml: "Exome (DRA001234)" },
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("DRA001234")
    })

    it("should extract GEA IDs from header", () => {
      const exp: TransformedExperiment = {
        header: { text: "GEA000456 - Microarray", rawHtml: "GEA000456 - Microarray" },
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("GEA000456")
    })

    it("should extract PRJDB IDs from header", () => {
      const exp: TransformedExperiment = {
        header: { text: "WGS (PRJDB12345)", rawHtml: "WGS (PRJDB12345)" },
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBe("PRJDB12345")
    })

    it("should return null for header without accession ID", () => {
      const exp: TransformedExperiment = {
        header: { text: "Exome sequencing", rawHtml: "Exome sequencing" },
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBeNull()
    })

    it("should return null for empty header", () => {
      const exp: TransformedExperiment = {
        header: { text: "", rawHtml: "" },
        data: {},
        footers: [],
      }
      expect(extractAccessionId(exp)).toBeNull()
    })
  })

  describe("normalizeHeader", () => {
    it("should convert to lowercase", () => {
      expect(normalizeHeader("EXOME SEQUENCING")).toBe("exome sequencing")
    })

    it("should normalize Japanese parentheses", () => {
      expect(normalizeHeader("エクソーム（全エクソン）")).toBe("エクソーム 全エクソン")
    })

    it("should normalize multiple spaces", () => {
      expect(normalizeHeader("exome   sequencing")).toBe("exome sequencing")
    })

    it("should trim whitespace", () => {
      expect(normalizeHeader("  exome sequencing  ")).toBe("exome sequencing")
    })

    it("should handle brackets", () => {
      expect(normalizeHeader("WGS [Illumina]")).toBe("wgs illumina")
    })
  })

  describe("isSimilarHeader", () => {
    it("should return true for exact match after normalization", () => {
      expect(isSimilarHeader("EXOME", "exome")).toBe(true)
    })

    it("should return true when one contains the other", () => {
      expect(isSimilarHeader("Exome sequencing", "exome")).toBe(true)
      expect(isSimilarHeader("exome", "Exome sequencing")).toBe(true)
    })

    it("should return true for common keywords", () => {
      // Both headers contain 'wgs' keyword
      expect(isSimilarHeader("WGSデータ", "WGS data")).toBe(true)
      // Both headers contain 'rna-seq' keyword (after normalization)
      expect(isSimilarHeader("RNA-seq サンプル", "RNA-seq sample")).toBe(true)
      // Both headers contain 'exome' keyword
      expect(isSimilarHeader("Exome sequencing", "exome analysis")).toBe(true)
    })

    it("should return false for completely different headers", () => {
      expect(isSimilarHeader("Exome", "Microarray")).toBe(false)
      // Japanese-only text without matching keywords
      expect(isSimilarHeader("全エクソームシーケンス", "Microarray")).toBe(false)
    })

    it("should return true for matching keyword variations", () => {
      // Both contain 'chip-seq' keyword
      expect(isSimilarHeader("ChIP-seq data", "chip-seq analysis")).toBe(true)
    })
  })

  describe("matchExperiments", () => {
    it("should match experiments by exact accession ID", () => {
      const jaExperiments: TransformedExperiment[] = [
        { header: { text: "JGAD000001 エクソーム", rawHtml: "" }, data: {}, footers: [] },
      ]
      const enExperiments: TransformedExperiment[] = [
        { header: { text: "JGAD000001 Exome", rawHtml: "" }, data: {}, footers: [] },
      ]

      const result = matchExperiments(jaExperiments, enExperiments)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact")
      expect(result[0].experimentKey).toBe("JGAD000001")
      expect(result[0].ja).toBe(jaExperiments[0])
      expect(result[0].en).toBe(enExperiments[0])
    })

    it("should match experiments by header similarity", () => {
      const jaExperiments: TransformedExperiment[] = [
        { header: { text: "全ゲノムシーケンス WGS", rawHtml: "" }, data: {}, footers: [] },
      ]
      const enExperiments: TransformedExperiment[] = [
        { header: { text: "Whole Genome Sequencing WGS", rawHtml: "" }, data: {}, footers: [] },
      ]

      const result = matchExperiments(jaExperiments, enExperiments)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("fuzzy")
      expect(result[0].ja).toBe(jaExperiments[0])
      expect(result[0].en).toBe(enExperiments[0])
    })

    it("should match experiments by position as fallback", () => {
      const jaExperiments: TransformedExperiment[] = [
        { header: { text: "サンプルA", rawHtml: "" }, data: {}, footers: [] },
        { header: { text: "サンプルB", rawHtml: "" }, data: {}, footers: [] },
      ]
      const enExperiments: TransformedExperiment[] = [
        { header: { text: "Sample X", rawHtml: "" }, data: {}, footers: [] },
        { header: { text: "Sample Y", rawHtml: "" }, data: {}, footers: [] },
      ]

      const result = matchExperiments(jaExperiments, enExperiments)

      expect(result).toHaveLength(2)
      expect(result[0].matchType).toBe("position")
      expect(result[1].matchType).toBe("position")
    })

    it("should handle unmatched ja experiments", () => {
      const jaExperiments: TransformedExperiment[] = [
        { header: { text: "JGAD000001", rawHtml: "" }, data: {}, footers: [] },
        { header: { text: "日本語のみ", rawHtml: "" }, data: {}, footers: [] },
      ]
      const enExperiments: TransformedExperiment[] = [
        { header: { text: "JGAD000001", rawHtml: "" }, data: {}, footers: [] },
      ]

      const result = matchExperiments(jaExperiments, enExperiments)

      expect(result).toHaveLength(2)
      expect(result[0].matchType).toBe("exact")
      expect(result[1].matchType).toBe("unmatched-ja")
      expect(result[1].ja).toBe(jaExperiments[1])
      expect(result[1].en).toBeNull()
    })

    it("should handle unmatched en experiments", () => {
      const jaExperiments: TransformedExperiment[] = [
        { header: { text: "JGAD000001", rawHtml: "" }, data: {}, footers: [] },
      ]
      const enExperiments: TransformedExperiment[] = [
        { header: { text: "JGAD000001", rawHtml: "" }, data: {}, footers: [] },
        { header: { text: "English only", rawHtml: "" }, data: {}, footers: [] },
      ]

      const result = matchExperiments(jaExperiments, enExperiments)

      expect(result).toHaveLength(2)
      expect(result[0].matchType).toBe("exact")
      expect(result[1].matchType).toBe("unmatched-en")
      expect(result[1].ja).toBeNull()
      expect(result[1].en).toBe(enExperiments[1])
    })

    it("should handle empty experiment lists", () => {
      const result = matchExperiments([], [])
      expect(result).toHaveLength(0)
    })

    it("should handle only ja experiments", () => {
      const jaExperiments: TransformedExperiment[] = [
        { header: { text: "エクソーム", rawHtml: "" }, data: {}, footers: [] },
      ]

      const result = matchExperiments(jaExperiments, [])

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("unmatched-ja")
    })

    it("should handle only en experiments", () => {
      const enExperiments: TransformedExperiment[] = [
        { header: { text: "Exome", rawHtml: "" }, data: {}, footers: [] },
      ]

      const result = matchExperiments([], enExperiments)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("unmatched-en")
    })

    it("should match multiple experiments with mixed strategies", () => {
      const jaExperiments: TransformedExperiment[] = [
        { header: { text: "JGAD000001 WGS", rawHtml: "" }, data: {}, footers: [] },
        { header: { text: "RNA-seq サンプル", rawHtml: "" }, data: {}, footers: [] },
        { header: { text: "その他データ", rawHtml: "" }, data: {}, footers: [] },
      ]
      const enExperiments: TransformedExperiment[] = [
        { header: { text: "JGAD000001 Whole Genome", rawHtml: "" }, data: {}, footers: [] },
        { header: { text: "RNA-seq Sample", rawHtml: "" }, data: {}, footers: [] },
        { header: { text: "Other Data", rawHtml: "" }, data: {}, footers: [] },
      ]

      const result = matchExperiments(jaExperiments, enExperiments)

      expect(result).toHaveLength(3)
      // First should match by exact accession ID
      expect(result[0].matchType).toBe("exact")
      expect(result[0].experimentKey).toBe("JGAD000001")
      // Second should match by fuzzy (RNA-seq keyword)
      expect(result[1].matchType).toBe("fuzzy")
      // Third should match by position
      expect(result[2].matchType).toBe("position")
    })
  })

  describe("matchPublications", () => {
    it("should match publications by exact DOI", () => {
      const jaPubs: TransformedPublication[] = [
        { title: "論文タイトル", doi: "10.1234/test", datasetIds: [] },
      ]
      const enPubs: TransformedPublication[] = [
        { title: "Paper Title", doi: "10.1234/test", datasetIds: [] },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-doi")
      expect(result[0].ja).toBe(jaPubs[0])
      expect(result[0].en).toBe(enPubs[0])
    })

    it("should match publications by datasetIds", () => {
      const jaPubs: TransformedPublication[] = [
        { title: "論文A", doi: null, datasetIds: ["JGAD000001", "JGAD000002"] },
      ]
      const enPubs: TransformedPublication[] = [
        { title: "Paper A", doi: null, datasetIds: ["JGAD000001"] },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-datasetIds")
    })

    it("should match publications by title similarity", () => {
      const jaPubs: TransformedPublication[] = [
        { title: "Genome-wide association study of type 2 diabetes", doi: null },
      ]
      const enPubs: TransformedPublication[] = [
        { title: "Genome-wide association study of type 2 diabetes mellitus", doi: null },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("fuzzy-title")
    })

    it("should match publications by position as fallback", () => {
      const jaPubs: TransformedPublication[] = [
        { title: "完全に異なるタイトル", doi: null },
      ]
      const enPubs: TransformedPublication[] = [
        { title: "Completely different title", doi: null },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should handle unmatched publications", () => {
      const jaPubs: TransformedPublication[] = [
        { title: "論文1", doi: "10.1234/a" },
        { title: "論文2", doi: null },
      ]
      const enPubs: TransformedPublication[] = [
        { title: "Paper1", doi: "10.1234/a" },
      ]

      const result = matchPublications(jaPubs, enPubs)

      expect(result).toHaveLength(2)
      expect(result[0].matchType).toBe("exact-doi")
      expect(result[1].matchType).toBe("unmatched-ja")
      expect(result[1].en).toBeNull()
    })

    it("should handle empty publication lists", () => {
      const result = matchPublications([], [])
      expect(result).toHaveLength(0)
    })
  })

  describe("matchGrants", () => {
    it("should match grants by grantId overlap", () => {
      const jaGrants: TransformedGrant[] = [
        { id: ["JP12345678", "12345678"], title: "研究助成金", agency: { name: "JSPS" } },
      ]
      const enGrants: TransformedGrant[] = [
        { id: ["JP12345678"], title: "Research Grant", agency: { name: "JSPS" } },
      ]

      const result = matchGrants(jaGrants, enGrants)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-grantId")
      expect(result[0].ja).toBe(jaGrants[0])
      expect(result[0].en).toBe(enGrants[0])
    })

    it("should match grants by position when no grantId match", () => {
      const jaGrants: TransformedGrant[] = [
        { id: [], title: "助成金A", agency: { name: "Agency" } },
      ]
      const enGrants: TransformedGrant[] = [
        { id: [], title: "Grant A", agency: { name: "Agency" } },
      ]

      const result = matchGrants(jaGrants, enGrants)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should handle unmatched grants", () => {
      const jaGrants: TransformedGrant[] = [
        { id: ["A"], title: "助成金1", agency: { name: "X" } },
        { id: ["B"], title: "助成金2", agency: { name: "Y" } },
      ]
      const enGrants: TransformedGrant[] = [
        { id: ["A"], title: "Grant1", agency: { name: "X" } },
      ]

      const result = matchGrants(jaGrants, enGrants)

      expect(result).toHaveLength(2)
      expect(result[0].matchType).toBe("exact-grantId")
      expect(result[1].matchType).toBe("unmatched-ja")
    })

    it("should handle empty grant lists", () => {
      const result = matchGrants([], [])
      expect(result).toHaveLength(0)
    })
  })

  describe("matchControlledAccessUsers", () => {
    it("should match users by both datasetIds and periodOfDataUse", () => {
      const jaUsers: TransformedPerson[] = [
        {
          name: { text: "山田太郎", rawHtml: "" },
          datasetIds: ["JGAD000001"],
          periodOfDataUse: { startDate: "2023-01-01", endDate: "2024-01-01" },
        },
      ]
      const enUsers: TransformedPerson[] = [
        {
          name: { text: "Taro Yamada", rawHtml: "" },
          datasetIds: ["JGAD000001"],
          periodOfDataUse: { startDate: "2023-01-01", endDate: "2024-01-01" },
        },
      ]

      const result = matchControlledAccessUsers(jaUsers, enUsers)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-both")
    })

    it("should match users by datasetIds only", () => {
      const jaUsers: TransformedPerson[] = [
        {
          name: { text: "山田太郎", rawHtml: "" },
          datasetIds: ["JGAD000001"],
          periodOfDataUse: null,
        },
      ]
      const enUsers: TransformedPerson[] = [
        {
          name: { text: "Taro Yamada", rawHtml: "" },
          datasetIds: ["JGAD000001"],
          periodOfDataUse: null,
        },
      ]

      const result = matchControlledAccessUsers(jaUsers, enUsers)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-datasetIds")
    })

    it("should match users by position as fallback", () => {
      const jaUsers: TransformedPerson[] = [
        { name: { text: "山田太郎", rawHtml: "" } },
      ]
      const enUsers: TransformedPerson[] = [
        { name: { text: "Taro Yamada", rawHtml: "" } },
      ]

      const result = matchControlledAccessUsers(jaUsers, enUsers)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should handle unmatched users", () => {
      const jaUsers: TransformedPerson[] = [
        { name: { text: "山田", rawHtml: "" }, datasetIds: ["JGAD000001"] },
        { name: { text: "佐藤", rawHtml: "" } },
      ]
      const enUsers: TransformedPerson[] = [
        { name: { text: "Yamada", rawHtml: "" }, datasetIds: ["JGAD000001"] },
      ]

      const result = matchControlledAccessUsers(jaUsers, enUsers)

      expect(result).toHaveLength(2)
      expect(result[0].matchType).toBe("exact-datasetIds")
      expect(result[1].matchType).toBe("unmatched-ja")
    })

    it("should handle empty user lists", () => {
      const result = matchControlledAccessUsers([], [])
      expect(result).toHaveLength(0)
    })
  })

  describe("matchResearchProjects", () => {
    it("should match projects by URL", () => {
      const jaProjects: TransformedResearchProject[] = [
        {
          name: { text: "プロジェクト名", rawHtml: "" },
          url: { text: "リンク", url: "https://example.com/project" },
        },
      ]
      const enProjects: TransformedResearchProject[] = [
        {
          name: { text: "Project Name", rawHtml: "" },
          url: { text: "Link", url: "https://example.com/project" },
        },
      ]

      const result = matchResearchProjects(jaProjects, enProjects)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("exact-url")
    })

    it("should match projects by name similarity", () => {
      const jaProjects: TransformedResearchProject[] = [
        { name: { text: "Genomic Medicine Research Project", rawHtml: "" }, url: null },
      ]
      const enProjects: TransformedResearchProject[] = [
        { name: { text: "Genomic Medicine Research Project Phase 2", rawHtml: "" }, url: null },
      ]

      const result = matchResearchProjects(jaProjects, enProjects)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("fuzzy-name")
    })

    it("should match projects by position as fallback", () => {
      const jaProjects: TransformedResearchProject[] = [
        { name: { text: "異なるプロジェクト", rawHtml: "" }, url: null },
      ]
      const enProjects: TransformedResearchProject[] = [
        { name: { text: "Different Project", rawHtml: "" }, url: null },
      ]

      const result = matchResearchProjects(jaProjects, enProjects)

      expect(result).toHaveLength(1)
      expect(result[0].matchType).toBe("position")
    })

    it("should handle unmatched projects", () => {
      const jaProjects: TransformedResearchProject[] = [
        { name: { text: "プロジェクトA", rawHtml: "" }, url: { text: "", url: "http://a.com" } },
        { name: { text: "プロジェクトB", rawHtml: "" }, url: null },
      ]
      const enProjects: TransformedResearchProject[] = [
        { name: { text: "Project A", rawHtml: "" }, url: { text: "", url: "http://a.com" } },
      ]

      const result = matchResearchProjects(jaProjects, enProjects)

      expect(result).toHaveLength(2)
      expect(result[0].matchType).toBe("exact-url")
      expect(result[1].matchType).toBe("unmatched-ja")
    })

    it("should handle empty project lists", () => {
      const result = matchResearchProjects([], [])
      expect(result).toHaveLength(0)
    })
  })
})
