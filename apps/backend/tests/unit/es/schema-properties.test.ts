/**
 * Property-Based Testing for ES schemas
 *
 * Uses fast-check to generate random inputs and verify properties.
 * This can discover edge cases that example-based tests miss.
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import {
  normVersion,
  idResearch,
  idResearchVersion,
  idDataset,
} from "@/es/load-docs"
import {
  NormalizedDiseaseSchema,
} from "@/es/types"

describe("es/schema-properties (PBT)", () => {
  // ===========================================================================
  // normVersion properties
  // ===========================================================================
  describe("normVersion properties", () => {
    it("should always return string starting with 'v' for valid numeric input", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000000 }), (num) => {
          const result = normVersion(num)
          expect(result.startsWith("v")).toBe(true)
          expect(result).toBe(`v${num}`)
        }),
        { numRuns: 100 },
      )
    })

    it("should always return string starting with 'v' for valid string input", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000000 }), (num) => {
          // Test with numeric string
          const result1 = normVersion(String(num))
          expect(result1.startsWith("v")).toBe(true)

          // Test with v-prefixed string
          const result2 = normVersion(`v${num}`)
          expect(result2.startsWith("v")).toBe(true)
        }),
        { numRuns: 100 },
      )
    })

    it("should be idempotent for v-prefixed versions", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (num) => {
          const versionStr = `v${num}`
          expect(normVersion(versionStr)).toBe(versionStr)
        }),
        { numRuns: 50 },
      )
    })

    it("should throw for non-numeric strings", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !/^v?\d/.test(s.trim()) && s.trim().length > 0),
          (invalidStr) => {
            expect(() => normVersion(invalidStr)).toThrow()
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  // ===========================================================================
  // ID generation properties
  // ===========================================================================
  describe("idResearch properties", () => {
    it("should always return input unchanged", () => {
      fc.assert(
        fc.property(fc.string(), (humId) => {
          expect(idResearch(humId)).toBe(humId)
        }),
        { numRuns: 100 },
      )
    })
  })

  describe("idResearchVersion properties", () => {
    it("should always contain hyphen separator", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => s.length > 0),
          fc.integer({ min: 1, max: 100 }),
          (humId, versionNum) => {
            const result = idResearchVersion(humId, String(versionNum))
            expect(result).toContain("-v")
          },
        ),
        { numRuns: 100 },
      )
    })

    it("should generate unique IDs for different versions", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => s.length > 0 && !s.includes("-v")),
          fc.integer({ min: 1, max: 50 }),
          fc.integer({ min: 1, max: 50 }).filter((n) => n !== 1),
          (humId, v1, v2) => {
            if (v1 !== v2) {
              const id1 = idResearchVersion(humId, String(v1))
              const id2 = idResearchVersion(humId, String(v2))
              expect(id1).not.toBe(id2)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe("idDataset properties", () => {
    it("should always contain hyphen-v separator", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => s.length > 0),
          fc.integer({ min: 1, max: 100 }),
          (datasetId, versionNum) => {
            const result = idDataset(datasetId, String(versionNum))
            expect(result).toContain("-v")
          },
        ),
        { numRuns: 100 },
      )
    })

    it("should generate unique IDs for different datasets with same version", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => s.length > 0 && !s.includes("-v")),
          fc.string().filter((s) => s.length > 0 && !s.includes("-v")),
          fc.integer({ min: 1, max: 100 }),
          (datasetId1, datasetId2, version) => {
            if (datasetId1 !== datasetId2) {
              const id1 = idDataset(datasetId1, String(version))
              const id2 = idDataset(datasetId2, String(version))
              expect(id1).not.toBe(id2)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  // ===========================================================================
  // Schema validation properties
  // ===========================================================================
  describe("NormalizedDiseaseSchema properties", () => {
    it("should accept valid disease objects", () => {
      fc.assert(
        fc.property(
          fc.record({
            label: fc.string({ minLength: 1 }),
            icd10: fc.string({ minLength: 1 }),
          }),
          (disease) => {
            const result = NormalizedDiseaseSchema.safeParse(disease)
            expect(result.success).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it("should reject objects without required fields", () => {
      // Missing icd10
      const result1 = NormalizedDiseaseSchema.safeParse({ label: "test" })
      expect(result1.success).toBe(false)

      // Missing label
      const result2 = NormalizedDiseaseSchema.safeParse({ icd10: "A00" })
      expect(result2.success).toBe(false)
    })
  })

  // ===========================================================================
  // Roundtrip properties
  // ===========================================================================
  describe("Version normalization roundtrip", () => {
    it("should maintain version number through normalization", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10000 }), (num) => {
          const normalized = normVersion(num)
          const extracted = parseInt(normalized.slice(1), 10)
          expect(extracted).toBe(num)
        }),
        { numRuns: 100 },
      )
    })
  })

  // ===========================================================================
  // ID uniqueness across types
  // ===========================================================================
  describe("ID generation uniqueness", () => {
    it("should generate distinct patterns for research vs dataset IDs", () => {
      // This tests that our ID scheme allows distinguishing document types
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 100 }),
          (num, version) => {
            const humId = `hum${String(num).padStart(4, "0")}`
            const datasetId = `JGAD${String(num).padStart(6, "0")}`

            const researchId = idResearch(humId)
            const datasetDocId = idDataset(datasetId, String(version))

            // These should be distinguishable by prefix
            expect(researchId.startsWith("hum")).toBe(true)
            expect(datasetDocId.startsWith("JGAD")).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
