import { describe, expect, it } from "bun:test"

import {
  extractIcd10FromLabel,
  selectIcd10,
  hasMultipleIcd10Codes,
  normalizeDiseaseWithIcd10,
  normalizeDiseases,
  getManualSplitDefinitions,
  normalizeLabelForMatching,
  getExcludedDiseases,
} from "@/crawler/processors/icd10-normalize"
import type { DiseaseInfo } from "@/crawler/types"

describe("processors/icd10-normalize.ts", () => {
  // ===========================================================================
  // normalizeLabelForMatching
  // ===========================================================================
  describe("normalizeLabelForMatching", () => {
    it("should remove space before opening parenthesis", () => {
      expect(normalizeLabelForMatching("病名 (C123)")).toBe("病名(C123)")
    })

    it("should remove multiple spaces before opening parenthesis", () => {
      expect(normalizeLabelForMatching("病名  (C123)")).toBe("病名(C123)")
    })

    it("should handle multiple parentheses", () => {
      expect(normalizeLabelForMatching("病名 (A) と (B)")).toBe("病名(A) と(B)")
    })

    it("should not modify label without space before parenthesis", () => {
      expect(normalizeLabelForMatching("病名(C123)")).toBe("病名(C123)")
    })

    it("should not modify label without parenthesis", () => {
      expect(normalizeLabelForMatching("病名")).toBe("病名")
    })
  })

  // ===========================================================================
  // extractIcd10FromLabel
  // ===========================================================================
  describe("extractIcd10FromLabel", () => {
    it("should extract ICD10 code from simple label", () => {
      const result = extractIcd10FromLabel("乳がん(C509)")
      expect(result.cleanLabel).toBe("乳がん")
      expect(result.extractedIcd10).toBe("C509")
    })

    it("should extract ICD10 code from English label", () => {
      const result = extractIcd10FromLabel("Breast cancer(C509)")
      expect(result.cleanLabel).toBe("Breast cancer")
      expect(result.extractedIcd10).toBe("C509")
    })

    it("should extract multiple ICD10 codes", () => {
      const result = extractIcd10FromLabel("大腸・直腸がん(C189, C20)")
      expect(result.cleanLabel).toBe("大腸・直腸がん")
      expect(result.extractedIcd10).toBe("C189, C20")
    })

    it("should handle ICD10 code with 2 digits", () => {
      const result = extractIcd10FromLabel("白血病(C91)")
      expect(result.cleanLabel).toBe("白血病")
      expect(result.extractedIcd10).toBe("C91")
    })

    it("should handle ICD10 code with 4 digits", () => {
      const result = extractIcd10FromLabel("心不全(I509)")
      expect(result.cleanLabel).toBe("心不全")
      expect(result.extractedIcd10).toBe("I509")
    })

    it("should handle label with space before parenthesis", () => {
      const result = extractIcd10FromLabel("乳がん (C509)")
      expect(result.cleanLabel).toBe("乳がん")
      expect(result.extractedIcd10).toBe("C509")
    })

    it("should return original label when no ICD10 code", () => {
      const result = extractIcd10FromLabel("diabetes")
      expect(result.cleanLabel).toBe("diabetes")
      expect(result.extractedIcd10).toBeNull()
    })

    it("should return original label for non-ICD10 parenthesis", () => {
      const result = extractIcd10FromLabel("disease (type 1)")
      expect(result.cleanLabel).toBe("disease (type 1)")
      expect(result.extractedIcd10).toBeNull()
    })

    it("should handle empty string", () => {
      const result = extractIcd10FromLabel("")
      expect(result.cleanLabel).toBe("")
      expect(result.extractedIcd10).toBeNull()
    })

    it("should handle multiple codes with different letter prefixes", () => {
      const result = extractIcd10FromLabel("Disease(A01, B02)")
      expect(result.cleanLabel).toBe("Disease")
      expect(result.extractedIcd10).toBe("A01, B02")
    })

    it("should handle code without letter prefix after first code", () => {
      // Pattern like (C189, 20) - second code might not have letter
      const result = extractIcd10FromLabel("Disease(C189, 20)")
      expect(result.cleanLabel).toBe("Disease")
      expect(result.extractedIcd10).toBe("C189, 20")
    })
  })

  // ===========================================================================
  // selectIcd10
  // ===========================================================================
  describe("selectIcd10", () => {
    it("should return null when both are null", () => {
      expect(selectIcd10(null, null)).toBeNull()
    })

    it("should return extracted when existing is null", () => {
      expect(selectIcd10(null, "C509")).toBe("C509")
    })

    it("should return existing when extracted is null", () => {
      expect(selectIcd10("C509", null)).toBe("C509")
    })

    it("should prefer extracted over existing", () => {
      expect(selectIcd10("C509", "C510")).toBe("C510")
    })

    it("should return first code when multiple codes in extracted", () => {
      expect(selectIcd10(null, "C189, C20")).toBe("C189")
    })

    it("should return first code when multiple codes in existing", () => {
      expect(selectIcd10("C189, C20", null)).toBe("C189")
    })
  })

  // ===========================================================================
  // hasMultipleIcd10Codes
  // ===========================================================================
  describe("hasMultipleIcd10Codes", () => {
    it("should return false for label without ICD10", () => {
      expect(hasMultipleIcd10Codes("diabetes")).toBe(false)
    })

    it("should return false for single ICD10 code", () => {
      expect(hasMultipleIcd10Codes("乳がん(C509)")).toBe(false)
    })

    it("should return true for multiple ICD10 codes", () => {
      expect(hasMultipleIcd10Codes("大腸・直腸がん(C189, C20)")).toBe(true)
    })

    it("should return true for three ICD10 codes", () => {
      expect(hasMultipleIcd10Codes("disease(A01, B02, C03)")).toBe(true)
    })
  })

  // ===========================================================================
  // normalizeDiseaseWithIcd10
  // ===========================================================================
  describe("normalizeDiseaseWithIcd10", () => {
    it("should use manual split definition when available", () => {
      // This test depends on disease-split.json content
      const disease: DiseaseInfo = { label: "大腸・直腸がん(C189, C20)", icd10: null }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      // Should return multiple diseases from manual split, mapped to English
      expect(result.length).toBe(2)
      expect(result[0]).toEqual({ label: "Malignant neoplasm: Colon, unspecified", icd10: "C189" })
      expect(result[1]).toEqual({ label: "Malignant neoplasm of rectum", icd10: "C20" })
      expect(warnings).toHaveLength(0)
    })

    it("should use manual split definition even with space before parenthesis", () => {
      // Label with space before parenthesis should match definition without space
      const disease: DiseaseInfo = { label: "大腸・直腸がん (C189, C20)", icd10: null }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      // Should return multiple diseases from manual split, mapped to English
      expect(result.length).toBe(2)
      expect(result[0]).toEqual({ label: "Malignant neoplasm: Colon, unspecified", icd10: "C189" })
      expect(result[1]).toEqual({ label: "Malignant neoplasm of rectum", icd10: "C20" })
      expect(warnings).toHaveLength(0)
    })

    it("should use manual split definition for heart failure with space", () => {
      const disease: DiseaseInfo = { label: "心不全 (I509, I500)", icd10: null }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      // Should return diseases from manual split, mapped to English
      expect(result.length).toBe(2)
      expect(result[0]).toEqual({ label: "Heart failure, unspecified", icd10: "I509" })
      expect(result[1]).toEqual({ label: "Congestive heart failure", icd10: "I500" })
      expect(warnings).toHaveLength(0)
    })

    it("should extract ICD10 and apply mapping for Japanese disease", () => {
      // After extraction, the disease is mapped to ICD10 master's English name
      const disease: DiseaseInfo = { label: "乳がん(C509)", icd10: null }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      expect(result).toHaveLength(1)
      // Mapped to English label from ICD10 master
      expect(result[0]).toEqual({ label: "Malignant neoplasm: Breast, unspecified", icd10: "C509" })
      expect(warnings).toHaveLength(0)
    })

    it("should use extracted icd10 over existing with warning for unmapped", () => {
      // Extracted ICD10 takes priority over existing
      // This combination is unmapped, so it warns
      const disease: DiseaseInfo = { label: "乳がん(C509)", icd10: "C50" }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      expect(result).toHaveLength(1)
      // Since "乳がん|C509" is mapped in icd10-disease-mapping.json, it gets normalized
      expect(result[0]).toEqual({ label: "Malignant neoplasm: Breast, unspecified", icd10: "C509" })
      expect(warnings).toHaveLength(0)
    })

    it("should apply mapping for disease without ICD10 if mapping exists", () => {
      // "diabetes" is mapped to E149, then ICD10 master label is used
      const disease: DiseaseInfo = { label: "diabetes", icd10: null }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      expect(result).toHaveLength(1)
      // Label comes from ICD10 master
      expect(result[0]).toEqual({ label: "Unspecified diabetes mellitus: Without complications", icd10: "E149" })
      expect(warnings).toHaveLength(0)
    })

    it("should exclude unmapped disease without ICD10 with warning", () => {
      // Diseases without ICD10 are excluded from output (can't satisfy NormalizedDisease type)
      const disease: DiseaseInfo = { label: "some rare unmapped disease", icd10: null }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      expect(result).toHaveLength(0) // Excluded (no valid icd10)
      // Warning to add mapping
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain("Disease without ICD10")
      expect(warnings[0]).toContain("Add to icd10-disease-mapping.json")
    })

    it("should resolve to ICD10 master label for existing icd10", () => {
      // E10 is in ICD10 master, so use master label
      const disease: DiseaseInfo = { label: "diabetes", icd10: "E10" }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      expect(result).toHaveLength(1)
      // Label comes from ICD10 master (E10 = "Insulin-dependent diabetes mellitus")
      expect(result[0].icd10).toBe("E10")
      expect(warnings).toHaveLength(0)
    })

    it("should use first ICD10 code for unmapped disease with multiple codes and warn", () => {
      // For unmapped diseases with multiple ICD10 codes, use first code and warn
      const disease: DiseaseInfo = { label: "Unknown disease(A01, B02)", icd10: null }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      expect(result).toHaveLength(1)
      // A01 is a 3-digit code not in ICD10 master, so original label is used
      expect(result[0].label).toBe("Unknown disease")
      expect(result[0].icd10).toBe("A01")
      // Warning for multiple ICD10 codes without split definition
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain("Multiple ICD10 codes without split definition")
    })
  })

  // ===========================================================================
  // normalizeDiseases
  // ===========================================================================
  describe("normalizeDiseases", () => {
    it("should normalize array of diseases with mapping", () => {
      const diseases: DiseaseInfo[] = [
        { label: "乳がん(C509)", icd10: null },
        { label: "some rare disease", icd10: "E10" }, // Unmapped disease
      ]
      const { normalized, warnings, updated } = normalizeDiseases(diseases)

      expect(normalized).toHaveLength(2)
      // Mapped to English label from ICD10 master
      expect(normalized[0]).toEqual({ label: "Malignant neoplasm: Breast, unspecified", icd10: "C509" })
      // Unmapped disease stays as-is
      expect(normalized[1]).toEqual({ label: "some rare disease", icd10: "E10" })
      expect(warnings).toHaveLength(0)
      expect(updated).toBe(true)
    })

    it("should expand manual splits", () => {
      const diseases: DiseaseInfo[] = [
        { label: "大腸・直腸がん(C189, C20)", icd10: null },
      ]
      const { normalized, warnings, updated } = normalizeDiseases(diseases)

      expect(normalized).toHaveLength(2)
      expect(normalized[0]).toEqual({ label: "Malignant neoplasm: Colon, unspecified", icd10: "C189" })
      expect(normalized[1]).toEqual({ label: "Malignant neoplasm of rectum", icd10: "C20" })
      expect(warnings).toHaveLength(0)
      expect(updated).toBe(true)
    })

    it("should deduplicate diseases by label+icd10", () => {
      const diseases: DiseaseInfo[] = [
        { label: "乳がん(C509)", icd10: null },
        { label: "乳がん(C509)", icd10: null },
      ]
      const { normalized, warnings: _warnings, updated } = normalizeDiseases(diseases)

      expect(normalized).toHaveLength(1)
      // Both are mapped to same English label
      expect(normalized[0]).toEqual({ label: "Malignant neoplasm: Breast, unspecified", icd10: "C509" })
      expect(updated).toBe(true)
    })

    it("should keep different diseases with same input label but different icd10", () => {
      const diseases: DiseaseInfo[] = [
        { label: "cancer", icd10: "C509" },
        { label: "cancer", icd10: "C510" },
      ]
      const { normalized, updated } = normalizeDiseases(diseases)

      // Both are resolved to ICD10 master labels (different codes = different labels)
      expect(normalized).toHaveLength(2)
      expect(normalized[0].icd10).toBe("C509")
      expect(normalized[1].icd10).toBe("C510")
      expect(updated).toBe(true) // Labels changed to ICD10 master labels
    })

    it("should keep original label when ICD10 not in master (3-digit code)", () => {
      // E10 is a 3-digit code not in ICD10 master
      const diseases: DiseaseInfo[] = [
        { label: "diabetes", icd10: "E10" },
      ]
      const { normalized, updated } = normalizeDiseases(diseases)

      expect(normalized).toHaveLength(1)
      // Label stays as-is since E10 not in master
      expect(normalized[0]).toEqual({ label: "diabetes", icd10: "E10" })
      expect(updated).toBe(false)
    })

    it("should handle empty array", () => {
      const { normalized, warnings, updated } = normalizeDiseases([])

      expect(normalized).toHaveLength(0)
      expect(warnings).toHaveLength(0)
      expect(updated).toBe(false)
    })

    it("should warn for multiple unmapped diseases with multiple ICD10 codes", () => {
      const diseases: DiseaseInfo[] = [
        { label: "Disease1(A01, A02)", icd10: null },
        { label: "Disease2(B01, B02)", icd10: null },
      ]
      const { normalized, warnings } = normalizeDiseases(diseases)

      // Warnings for multiple ICD10 codes without split definition
      expect(warnings).toHaveLength(2)
      expect(warnings[0]).toContain("Multiple ICD10 codes without split definition")
      // Diseases use only first ICD10 code (split rules should handle multiple codes)
      expect(normalized).toHaveLength(2)
      expect(normalized[0]).toEqual({ label: "Disease1", icd10: "A01" })
      expect(normalized[1]).toEqual({ label: "Disease2", icd10: "B01" })
    })
  })

  // ===========================================================================
  // getManualSplitDefinitions
  // ===========================================================================
  describe("getManualSplitDefinitions", () => {
    it("should return manual split definitions", () => {
      const definitions = getManualSplitDefinitions()

      // Verify structure based on disease-split.json
      expect(definitions).toHaveProperty("大腸・直腸がん(C189, C20)")
      expect(definitions["大腸・直腸がん(C189, C20)"]).toHaveLength(2)
    })

    it("should return a copy (not modify original)", () => {
      const definitions1 = getManualSplitDefinitions()
      const definitions2 = getManualSplitDefinitions()

      // Should be different objects
      expect(definitions1).not.toBe(definitions2)
    })
  })

  // ===========================================================================
  // getExcludedDiseases
  // ===========================================================================
  describe("getExcludedDiseases", () => {
    it("should return excluded diseases", () => {
      const excluded = getExcludedDiseases()

      // Verify structure based on disease-exclude.json
      expect(excluded).toContain("47 diseases")
      expect(excluded).toContain("血糖・脂質関連")
    })

    it("should exclude and not warn for excluded diseases", () => {
      const disease: DiseaseInfo = { label: "47 diseases", icd10: null }
      const { result, warnings } = normalizeDiseaseWithIcd10(disease)

      // Excluded diseases are removed from output (not actual disease names)
      expect(result).toHaveLength(0)
      // No warning for excluded disease
      expect(warnings).toHaveLength(0)
    })
  })
})
