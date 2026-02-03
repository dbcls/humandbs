import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  validateAndCorrectCriteria,
  convertCriteriaToDisplay,
  expandDatasetIds,
  mergeExperiments,
  mergeDataset,
  mergeSummary,
  mergeDataProvider,
  mergeGrants,
  mergePublications,
  mergeResearch,
  mergeResearchVersion,
  toBilingualText,
  toBilingualTextValue,
} from "@/crawler/processors/structure"
import type {
  SingleLangExperiment,
  SingleLangDataset,
  SingleLangResearch,
  SingleLangResearchVersion,
  SingleLangPerson,
  SingleLangGrant,
  SingleLangPublication,
  TextValue,
} from "@/crawler/types"

const createTextValue = (text: string): TextValue => ({
  text,
  rawHtml: `<span>${text}</span>`,
})

describe("processors/structure.ts", () => {
  // ===========================================================================
  // validateAndCorrectCriteria
  // ===========================================================================
  describe("validateAndCorrectCriteria", () => {
    it("should return criteria unchanged when valid", () => {
      const result = validateAndCorrectCriteria("hum0001", "JGAD000001", "Controlled-access (Type I)")

      expect(result.criteria).toBe("Controlled-access (Type I)")
      expect(result.warnings).toHaveLength(0)
    })

    it("should return warning for empty criteria with JGA dataset", () => {
      const result = validateAndCorrectCriteria("hum0001", "JGAD000001", null)

      expect(result.criteria).toBe("Controlled-access (Type I)")
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain("criteria is empty")
    })

    it("should return warning for empty criteria with non-JGA dataset", () => {
      const result = validateAndCorrectCriteria("hum0001", "DRA001234", null)

      expect(result.criteria).toBe("Unrestricted-access")
      expect(result.warnings).toHaveLength(1)
    })

    it("should return warning for JGA dataset with Unrestricted-access", () => {
      const result = validateAndCorrectCriteria("hum0001", "JGAD000001", "Unrestricted-access")

      expect(result.criteria).toBe("Unrestricted-access")
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain("should not be Unrestricted-access")
    })

    it("should return warning for DRA dataset with Controlled-access", () => {
      const result = validateAndCorrectCriteria("hum0001", "DRA001234", "Controlled-access (Type I)")

      expect(result.criteria).toBe("Controlled-access (Type I)")
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain("Expected Unrestricted-access")
    })

    it("should handle E-GEAD prefix correctly", () => {
      const result = validateAndCorrectCriteria("hum0001", "E-GEAD-123", "Controlled-access (Type I)")

      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain("Expected Unrestricted-access")
    })

    // バグ発見テスト: 境界値・異常系
    describe("boundary values and error cases", () => {
      it("should handle empty datasetId", () => {
        const result = validateAndCorrectCriteria("hum0001", "", null)
        expect(result.criteria).toBe("Unrestricted-access") // 空はJGA以外として扱われる
      })

      it("should handle Type II criteria", () => {
        const result = validateAndCorrectCriteria("hum0001", "JGAD000001", "Controlled-access (Type II)")
        expect(result.criteria).toBe("Controlled-access (Type II)")
        expect(result.warnings).toHaveLength(0)
      })

      it("should handle JGAS prefix (not JGAD)", () => {
        const result = validateAndCorrectCriteria("hum0001", "JGAS000001", "Controlled-access (Type I)")
        expect(result.warnings).toHaveLength(0) // JGAS も JGA の一種
      })

      it("should handle special characters in humId", () => {
        const result = validateAndCorrectCriteria("hum-0001", "JGAD000001", "Controlled-access (Type I)")
        expect(result.criteria).toBe("Controlled-access (Type I)")
      })
    })
  })

  // ===========================================================================
  // convertCriteriaToDisplay
  // ===========================================================================
  describe("convertCriteriaToDisplay", () => {
    it("should convert Type I to Japanese display", () => {
      const result = convertCriteriaToDisplay("Controlled-access (Type I)", "ja")
      expect(result).toBe("制限公開 (Type I)")
    })

    it("should convert Type I to English display", () => {
      const result = convertCriteriaToDisplay("Controlled-access (Type I)", "en")
      expect(result).toBe("Controlled-access (Type I)")
    })

    it("should convert Unrestricted-access to Japanese display", () => {
      const result = convertCriteriaToDisplay("Unrestricted-access", "ja")
      expect(result).toBe("非制限公開")
    })

    it("should return null for null input", () => {
      expect(convertCriteriaToDisplay(null, "ja")).toBeNull()
    })
  })

  // ===========================================================================
  // expandDatasetIds
  // ===========================================================================
  describe("expandDatasetIds", () => {
    it("should expand dataset IDs using expansion map", () => {
      const expansionMap = new Map<string, Set<string>>()
      expansionMap.set("JGAS000001", new Set(["JGAD000001", "JGAD000002"]))

      const result = expandDatasetIds(["JGAS000001"], expansionMap)

      expect(result).toContain("JGAD000001")
      expect(result).toContain("JGAD000002")
    })

    it("should return original ID when no expansion exists", () => {
      const expansionMap = new Map<string, Set<string>>()

      const result = expandDatasetIds(["JGAD000001"], expansionMap)

      expect(result).toEqual(["JGAD000001"])
    })

    it("should sort expanded IDs", () => {
      const expansionMap = new Map<string, Set<string>>()
      expansionMap.set("JGAS000001", new Set(["JGAD000003", "JGAD000001", "JGAD000002"]))

      const result = expandDatasetIds(["JGAS000001"], expansionMap)

      expect(result).toEqual(["JGAD000001", "JGAD000002", "JGAD000003"])
    })

    it("should handle multiple input IDs", () => {
      const expansionMap = new Map<string, Set<string>>()
      expansionMap.set("JGAS000001", new Set(["JGAD000001"]))
      expansionMap.set("JGAS000002", new Set(["JGAD000002"]))

      const result = expandDatasetIds(["JGAS000001", "JGAS000002"], expansionMap)

      expect(result).toContain("JGAD000001")
      expect(result).toContain("JGAD000002")
    })

    it("should deduplicate expanded IDs", () => {
      const expansionMap = new Map<string, Set<string>>()
      expansionMap.set("JGAS000001", new Set(["JGAD000001"]))
      expansionMap.set("JGAS000002", new Set(["JGAD000001"]))

      const result = expandDatasetIds(["JGAS000001", "JGAS000002"], expansionMap)

      expect(result).toEqual(["JGAD000001"])
    })

    // バグ発見テスト: 境界値・PBT
    describe("boundary values and properties", () => {
      it("should handle empty input array", () => {
        const expansionMap = new Map<string, Set<string>>()
        expansionMap.set("JGAS000001", new Set(["JGAD000001"]))

        const result = expandDatasetIds([], expansionMap)
        expect(result).toEqual([])
      })

      it("should handle empty expansion map", () => {
        const result = expandDatasetIds(["JGAS000001", "JGAD000002"], new Map())
        expect(result).toEqual(["JGAD000002", "JGAS000001"]) // ソートされる
      })

      it("should handle large expansion set", () => {
        const expansionMap = new Map<string, Set<string>>()
        const largeSet = new Set<string>()
        for (let i = 1; i <= 100; i++) {
          largeSet.add(`JGAD${i.toString().padStart(6, "0")}`)
        }
        expansionMap.set("JGAS000001", largeSet)

        const result = expandDatasetIds(["JGAS000001"], expansionMap)
        expect(result).toHaveLength(100)
        // Should be sorted
        expect(result[0]).toBe("JGAD000001")
        expect(result[99]).toBe("JGAD000100")
      })

      it("(PBT) should always return sorted unique array", () => {
        fc.assert(
          fc.property(
            fc.array(fc.string(), { minLength: 0, maxLength: 10 }),
            (ids) => {
              const result = expandDatasetIds(ids, new Map())
              // Result should be sorted
              const sorted = [...result].sort()
              expect(result).toEqual(sorted)
              // Result should have no duplicates
              const unique = [...new Set(result)]
              expect(result).toEqual(unique)
            },
          ),
          { numRuns: 50 },
        )
      })
    })
  })

  // ===========================================================================
  // toBilingualText / toBilingualTextValue
  // ===========================================================================
  describe("toBilingualText", () => {
    it("should create bilingual text from ja and en strings", () => {
      const result = toBilingualText("日本語", "English")
      expect(result).toEqual({ ja: "日本語", en: "English" })
    })

    it("should handle null values", () => {
      const result = toBilingualText(null, "English")
      expect(result).toEqual({ ja: null, en: "English" })
    })

    // バグ発見テスト
    describe("boundary values", () => {
      it("should handle both null values", () => {
        const result = toBilingualText(null, null)
        expect(result).toEqual({ ja: null, en: null })
      })

      it("should handle empty strings", () => {
        const result = toBilingualText("", "")
        expect(result).toEqual({ ja: "", en: "" })
      })

      it("should handle special characters", () => {
        const result = toBilingualText("<script>alert('xss')</script>", "a\tb\nc")
        expect(result.ja).toBe("<script>alert('xss')</script>")
        expect(result.en).toBe("a\tb\nc")
      })

      it("should handle very long strings", () => {
        const longJa = "あ".repeat(10000)
        const longEn = "a".repeat(10000)
        const result = toBilingualText(longJa, longEn)
        expect(result.ja?.length).toBe(10000)
        expect(result.en?.length).toBe(10000)
      })
    })
  })

  describe("toBilingualTextValue", () => {
    it("should create bilingual text value from ja and en TextValues", () => {
      const ja = createTextValue("日本語")
      const en = createTextValue("English")
      const result = toBilingualTextValue(ja, en)

      expect(result.ja?.text).toBe("日本語")
      expect(result.en?.text).toBe("English")
    })

    it("should handle null values", () => {
      const en = createTextValue("English")
      const result = toBilingualTextValue(null, en)

      expect(result.ja).toBeNull()
      expect(result.en?.text).toBe("English")
    })
  })

  // ===========================================================================
  // mergeExperiments
  // ===========================================================================
  describe("mergeExperiments", () => {
    it("should merge ja and en experiments", () => {
      const jaExps: SingleLangExperiment[] = [
        {
          header: createTextValue("JGAD000001"),
          data: { "サンプル数": createTextValue("100") },
          footers: [],
        },
      ]
      const enExps: SingleLangExperiment[] = [
        {
          header: createTextValue("JGAD000001"),
          data: { "Sample Size": createTextValue("100") },
          footers: [],
        },
      ]

      const result = mergeExperiments(jaExps, enExps)

      expect(result).toHaveLength(1)
      expect(result[0].header.ja?.text).toBe("JGAD000001")
      expect(result[0].header.en?.text).toBe("JGAD000001")
      expect(result[0].data["サンプル数"]?.ja?.text).toBe("100")
      expect(result[0].data["Sample Size"]?.en?.text).toBe("100")
    })

    it("should handle empty arrays", () => {
      const result = mergeExperiments([], [])
      expect(result).toEqual([])
    })

    it("should handle unmatched experiments", () => {
      const jaExps: SingleLangExperiment[] = [
        { header: createTextValue("JA only"), data: {}, footers: [] },
      ]
      const enExps: SingleLangExperiment[] = []

      const result = mergeExperiments(jaExps, enExps)

      expect(result).toHaveLength(1)
      expect(result[0].header.ja?.text).toBe("JA only")
      expect(result[0].header.en).toBeNull()
    })

    // バグ発見テスト
    describe("boundary values and error cases", () => {
      it("should handle only en experiments (ja is empty)", () => {
        const jaExps: SingleLangExperiment[] = []
        const enExps: SingleLangExperiment[] = [
          { header: createTextValue("EN only"), data: {}, footers: [] },
        ]

        const result = mergeExperiments(jaExps, enExps)

        expect(result).toHaveLength(1)
        expect(result[0].header.ja).toBeNull()
        expect(result[0].header.en?.text).toBe("EN only")
      })

      it("should handle experiments with empty data objects", () => {
        const jaExps: SingleLangExperiment[] = [
          { header: createTextValue("JGAD000001"), data: {}, footers: [] },
        ]
        const enExps: SingleLangExperiment[] = [
          { header: createTextValue("JGAD000001"), data: {}, footers: [] },
        ]

        const result = mergeExperiments(jaExps, enExps)
        expect(result).toHaveLength(1)
        expect(Object.keys(result[0].data)).toHaveLength(0)
      })

      it("should handle many experiments", () => {
        const jaExps: SingleLangExperiment[] = []
        const enExps: SingleLangExperiment[] = []
        for (let i = 1; i <= 50; i++) {
          const id = `JGAD${i.toString().padStart(6, "0")}`
          jaExps.push({ header: createTextValue(id), data: {}, footers: [] })
          enExps.push({ header: createTextValue(id), data: {}, footers: [] })
        }

        const result = mergeExperiments(jaExps, enExps)
        expect(result).toHaveLength(50)
      })

      it("should handle different number of ja and en experiments", () => {
        const jaExps: SingleLangExperiment[] = [
          { header: createTextValue("A"), data: {}, footers: [] },
          { header: createTextValue("B"), data: {}, footers: [] },
          { header: createTextValue("C"), data: {}, footers: [] },
        ]
        const enExps: SingleLangExperiment[] = [
          { header: createTextValue("A"), data: {}, footers: [] },
        ]

        const result = mergeExperiments(jaExps, enExps)
        expect(result.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  // ===========================================================================
  // mergeDataset
  // ===========================================================================
  describe("mergeDataset", () => {
    it("should merge ja and en datasets", () => {
      const jaDataset: SingleLangDataset = {
        datasetId: "JGAD000001",
        version: "v1",
        versionReleaseDate: "2024-01-15",
        humId: "hum0001",
        humVersionId: "hum0001-v1",
        releaseDate: "2024-01-15",
        criteria: "Controlled-access (Type I)",
        typeOfData: "WGS",
        experiments: [],
      }
      const enDataset: SingleLangDataset = {
        datasetId: "JGAD000001",
        version: "v1",
        versionReleaseDate: "2024-01-15",
        humId: "hum0001",
        humVersionId: "hum0001-v1",
        releaseDate: "2024-01-15",
        criteria: "Controlled-access (Type I)",
        typeOfData: "Whole Genome Sequencing",
        experiments: [],
      }

      const result = mergeDataset(
        "JGAD000001",
        "v1",
        "2024-01-15",
        "hum0001",
        "hum0001-v1",
        jaDataset,
        enDataset,
      )

      expect(result.datasetId).toBe("JGAD000001")
      expect(result.version).toBe("v1")
      expect(result.criteria).toBe("Controlled-access (Type I)")
      expect(result.typeOfData.ja).toBe("WGS")
      expect(result.typeOfData.en).toBe("Whole Genome Sequencing")
    })

    it("should handle null ja dataset", () => {
      const enDataset: SingleLangDataset = {
        datasetId: "JGAD000001",
        version: "v1",
        versionReleaseDate: "2024-01-15",
        humId: "hum0001",
        humVersionId: "hum0001-v1",
        releaseDate: "2024-01-15",
        criteria: "Controlled-access (Type I)",
        typeOfData: "WGS",
        experiments: [],
      }

      const result = mergeDataset(
        "JGAD000001",
        "v1",
        "2024-01-15",
        "hum0001",
        "hum0001-v1",
        null,
        enDataset,
      )

      expect(result.criteria).toBe("Controlled-access (Type I)")
      expect(result.typeOfData.ja).toBeNull()
      expect(result.typeOfData.en).toBe("WGS")
    })
  })

  // ===========================================================================
  // mergeSummary
  // ===========================================================================
  describe("mergeSummary", () => {
    it("should merge ja and en summaries", () => {
      const jaSummary: SingleLangResearch["summary"] = {
        aims: createTextValue("目的"),
        methods: createTextValue("方法"),
        targets: createTextValue("対象"),
        url: [{ text: "サイト", url: "https://example.com" }],
        footers: [],
      }
      const enSummary: SingleLangResearch["summary"] = {
        aims: createTextValue("Aims"),
        methods: createTextValue("Methods"),
        targets: createTextValue("Targets"),
        url: [{ text: "Site", url: "https://example.com" }],
        footers: [],
      }

      const result = mergeSummary(jaSummary, enSummary)

      expect(result.aims.ja?.text).toBe("目的")
      expect(result.aims.en?.text).toBe("Aims")
      expect(result.methods.ja?.text).toBe("方法")
      expect(result.methods.en?.text).toBe("Methods")
      expect(result.url.ja).toHaveLength(1)
      expect(result.url.en).toHaveLength(1)
    })

    it("should handle null summaries", () => {
      const result = mergeSummary(null, null)

      expect(result.aims.ja).toBeNull()
      expect(result.aims.en).toBeNull()
    })
  })

  // ===========================================================================
  // mergeDataProvider
  // ===========================================================================
  describe("mergeDataProvider", () => {
    it("should merge ja and en data providers", () => {
      const jaProviders: SingleLangPerson[] = [
        {
          name: createTextValue("山田太郎"),
          organization: { name: createTextValue("東京大学") },
        },
      ]
      const enProviders: SingleLangPerson[] = [
        {
          name: createTextValue("Taro Yamada"),
          organization: { name: createTextValue("University of Tokyo") },
        },
      ]

      const result = mergeDataProvider(jaProviders, enProviders)

      expect(result).toHaveLength(1)
      expect(result[0].name.ja?.text).toBe("山田太郎")
      expect(result[0].name.en?.text).toBe("Taro Yamada")
      expect(result[0].organization?.name.ja?.text).toBe("東京大学")
      expect(result[0].organization?.name.en?.text).toBe("University of Tokyo")
    })

    it("should handle different lengths", () => {
      const jaProviders: SingleLangPerson[] = [
        { name: createTextValue("山田太郎"), organization: null },
        { name: createTextValue("鈴木一郎"), organization: null },
      ]
      const enProviders: SingleLangPerson[] = [
        { name: createTextValue("Taro Yamada"), organization: null },
      ]

      const result = mergeDataProvider(jaProviders, enProviders)

      expect(result).toHaveLength(2)
      expect(result[1].name.ja?.text).toBe("鈴木一郎")
      expect(result[1].name.en).toBeNull()
    })
  })

  // ===========================================================================
  // mergeGrants
  // ===========================================================================
  describe("mergeGrants", () => {
    it("should merge ja and en grants by grantId", () => {
      const jaGrants: SingleLangGrant[] = [
        { id: ["JP12345"], title: "ゲノム研究", agency: { name: "JSPS" } },
      ]
      const enGrants: SingleLangGrant[] = [
        { id: ["JP12345"], title: "Genome Research", agency: { name: "JSPS" } },
      ]

      const result = mergeGrants(jaGrants, enGrants)

      expect(result).toHaveLength(1)
      expect(result[0].id).toContain("JP12345")
      expect(result[0].title.ja).toBe("ゲノム研究")
      expect(result[0].title.en).toBe("Genome Research")
    })

    it("should handle unmatched grants", () => {
      const jaGrants: SingleLangGrant[] = [
        { id: ["JP11111"], title: "研究A", agency: { name: "機関A" } },
      ]
      const enGrants: SingleLangGrant[] = [
        { id: ["JP22222"], title: "Research B", agency: { name: "Agency B" } },
      ]

      const result = mergeGrants(jaGrants, enGrants)

      expect(result).toHaveLength(1)
    })
  })

  // ===========================================================================
  // mergePublications
  // ===========================================================================
  describe("mergePublications", () => {
    it("should merge ja and en publications by DOI", () => {
      const jaPubs: SingleLangPublication[] = [
        { title: "論文タイトル", doi: "10.1234/test", datasetIds: ["JGAD000001"] },
      ]
      const enPubs: SingleLangPublication[] = [
        { title: "Paper Title", doi: "10.1234/test", datasetIds: ["JGAD000001"] },
      ]

      const result = mergePublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].title.ja).toBe("論文タイトル")
      expect(result[0].title.en).toBe("Paper Title")
      expect(result[0].doi).toBe("10.1234/test")
    })

    it("should handle publications without DOI", () => {
      const jaPubs: SingleLangPublication[] = [
        { title: "日本語の論文", doi: null, datasetIds: ["JGAD000001"] },
      ]
      const enPubs: SingleLangPublication[] = [
        { title: "English paper completely different", doi: null, datasetIds: ["JGAD000001"] },
      ]

      const result = mergePublications(jaPubs, enPubs)

      expect(result).toHaveLength(1)
      expect(result[0].datasetIds).toContain("JGAD000001")
    })
  })

  // ===========================================================================
  // mergeResearch
  // ===========================================================================
  describe("mergeResearch", () => {
    it("should merge ja and en research", () => {
      const jaResearch: SingleLangResearch = {
        humId: "hum0001",
        url: "https://humandbs.dbcls.jp/hum0001",
        title: "研究タイトル",
        summary: {
          aims: createTextValue("目的"),
          methods: createTextValue("方法"),
          targets: createTextValue("対象"),
          url: [],
          footers: [],
        },
        dataProvider: [],
        researchProject: [],
        grant: [],
        relatedPublication: [],
        controlledAccessUser: [],
        versionIds: ["hum0001-v1"],
        latestVersion: "v1",
        datePublished: "2024-01-15",
        dateModified: "2024-01-15",
      }
      const enResearch: SingleLangResearch = {
        humId: "hum0001",
        url: "https://humandbs.dbcls.jp/en/hum0001",
        title: "Research Title",
        summary: {
          aims: createTextValue("Aims"),
          methods: createTextValue("Methods"),
          targets: createTextValue("Targets"),
          url: [],
          footers: [],
        },
        dataProvider: [],
        researchProject: [],
        grant: [],
        relatedPublication: [],
        controlledAccessUser: [],
        versionIds: ["hum0001-v1"],
        latestVersion: "v1",
        datePublished: "2024-01-15",
        dateModified: "2024-01-15",
      }

      const result = mergeResearch("hum0001", jaResearch, enResearch)

      expect(result.humId).toBe("hum0001")
      expect(result.title.ja).toBe("研究タイトル")
      expect(result.title.en).toBe("Research Title")
      expect(result.summary.aims.ja?.text).toBe("目的")
      expect(result.summary.aims.en?.text).toBe("Aims")
    })

    it("should handle null research", () => {
      const result = mergeResearch("hum0001", null, null)

      expect(result.humId).toBe("hum0001")
      expect(result.title.ja).toBeNull()
      expect(result.title.en).toBeNull()
    })
  })

  // ===========================================================================
  // mergeResearchVersion
  // ===========================================================================
  describe("mergeResearchVersion", () => {
    it("should merge ja and en research versions", () => {
      const jaVersion: SingleLangResearchVersion = {
        humId: "hum0001",
        humVersionId: "hum0001-v1",
        version: "v1",
        versionReleaseDate: "2024-01-15",
        releaseDate: "2024-01-15",
        releaseNote: createTextValue("初回リリース"),
      }
      const enVersion: SingleLangResearchVersion = {
        humId: "hum0001",
        humVersionId: "hum0001-v1",
        version: "v1",
        versionReleaseDate: "2024-01-15",
        releaseDate: "2024-01-15",
        releaseNote: createTextValue("Initial release"),
      }
      const datasets = [{ datasetId: "JGAD000001", version: "v1" }]

      const result = mergeResearchVersion("hum0001-v1", jaVersion, enVersion, datasets)

      expect(result.humVersionId).toBe("hum0001-v1")
      expect(result.version).toBe("v1")
      expect(result.releaseNote.ja?.text).toBe("初回リリース")
      expect(result.releaseNote.en?.text).toBe("Initial release")
      expect(result.datasets).toHaveLength(1)
      expect(result.datasets[0].datasetId).toBe("JGAD000001")
      expect(result.datasets[0].version).toBe("v1")
    })

    it("should use provided datasets array", () => {
      const jaVersion: SingleLangResearchVersion = {
        humId: "hum0001",
        humVersionId: "hum0001-v1",
        version: "v1",
        versionReleaseDate: "2024-01-15",
        releaseDate: "2024-01-15",
        releaseNote: createTextValue(""),
      }
      const enVersion: SingleLangResearchVersion = {
        humId: "hum0001",
        humVersionId: "hum0001-v1",
        version: "v1",
        versionReleaseDate: "2024-01-15",
        releaseDate: "2024-01-15",
        releaseNote: createTextValue(""),
      }
      const datasets = [
        { datasetId: "JGAD000001", version: "v1" },
        { datasetId: "JGAD000002", version: "v1" },
        { datasetId: "JGAD000003", version: "v2" },
      ]

      const result = mergeResearchVersion("hum0001-v1", jaVersion, enVersion, datasets)

      expect(result.datasets).toHaveLength(3)
      expect(result.datasets[0].datasetId).toBe("JGAD000001")
      expect(result.datasets[1].datasetId).toBe("JGAD000002")
      expect(result.datasets[2].datasetId).toBe("JGAD000003")
      expect(result.datasets[2].version).toBe("v2")
    })

    it("should handle null versions", () => {
      const result = mergeResearchVersion("hum0001-v1", null, null, [])

      expect(result.humVersionId).toBe("hum0001-v1")
      expect(result.humId).toBe("")
      expect(result.version).toBe("")
      expect(result.datasets).toHaveLength(0)
    })
  })
})
