/**
 * Schema consistency tests
 *
 * Verifies that Zod schemas and ES mappings are consistent.
 * This catches typos, missing fields, and type mismatches.
 */
import { describe, expect, it } from "bun:test"

import { datasetSchema, datasetMapping } from "@/es/dataset-schema"
import type { FieldDef } from "@/es/generate-mapping"
import { researchSchema, researchMapping } from "@/es/research-schema"
import { researchVersionSchema, researchVersionMapping } from "@/es/research-version-schema"
import {
  EsResearchSchema,
  EsDatasetSchema,
  EsResearchVersionSchema,
} from "@/es/types"

/**
 * Extract top-level field names from a schema object
 */
function getSchemaFieldNames(schema: Record<string, FieldDef>): string[] {
  return Object.keys(schema)
}

/**
 * Extract top-level field names from an ES mapping
 */
function getMappingFieldNames(mapping: {
  mappings: { properties: Record<string, unknown> }
}): string[] {
  return Object.keys(mapping.mappings.properties)
}

/**
 * Extract field names from Zod schema shape
 */
function getZodFieldNames(schema: { shape: Record<string, unknown> }): string[] {
  return Object.keys(schema.shape)
}

describe("es/schema-consistency", () => {
  // ===========================================================================
  // Schema definition validation
  // ===========================================================================
  describe("researchSchema definition", () => {
    it("should have all required top-level fields", () => {
      const requiredFields = [
        "humId",
        "url",
        "title",
        "versionIds",
        "latestVersion",
        "datePublished",
        "dateModified",
        "status",
        "uids",
        "summary",
        "dataProvider",
        "researchProject",
        "grant",
        "relatedPublication",
        "controlledAccessUser",
      ]

      const schemaFields = getSchemaFieldNames(researchSchema)
      for (const field of requiredFields) {
        expect(schemaFields).toContain(field)
      }
    })

    it("should generate mapping with same fields", () => {
      const schemaFields = getSchemaFieldNames(researchSchema)
      const mappingFields = getMappingFieldNames(researchMapping)

      expect(schemaFields.sort()).toEqual(mappingFields.sort())
    })
  })

  describe("datasetSchema definition", () => {
    it("should have all required top-level fields", () => {
      const requiredFields = [
        "datasetId",
        "version",
        "humId",
        "humVersionId",
        "versionReleaseDate",
        "releaseDate",
        "criteria",
        "typeOfData",
        "experiments",
      ]

      const schemaFields = getSchemaFieldNames(datasetSchema)
      for (const field of requiredFields) {
        expect(schemaFields).toContain(field)
      }
    })

    it("should generate mapping with same fields", () => {
      const schemaFields = getSchemaFieldNames(datasetSchema)
      const mappingFields = getMappingFieldNames(datasetMapping)

      expect(schemaFields.sort()).toEqual(mappingFields.sort())
    })
  })

  describe("researchVersionSchema definition", () => {
    it("should have all required top-level fields", () => {
      const requiredFields = [
        "humId",
        "humVersionId",
        "version",
        "versionReleaseDate",
        "datasetIds",
        "releaseNote",
      ]

      const schemaFields = getSchemaFieldNames(researchVersionSchema)
      for (const field of requiredFields) {
        expect(schemaFields).toContain(field)
      }
    })

    it("should generate mapping with same fields", () => {
      const schemaFields = getSchemaFieldNames(researchVersionSchema)
      const mappingFields = getMappingFieldNames(researchVersionMapping)

      expect(schemaFields.sort()).toEqual(mappingFields.sort())
    })
  })

  // ===========================================================================
  // Zod schema vs ES schema field comparison
  // ===========================================================================
  describe("EsResearchSchema vs researchSchema", () => {
    it("should have matching top-level fields", () => {
      const zodFields = getZodFieldNames(EsResearchSchema)
      const esSchemaFields = getSchemaFieldNames(researchSchema)

      // Check that all Zod fields exist in ES schema
      for (const field of zodFields) {
        expect(esSchemaFields).toContain(field)
      }

      // Check that all ES schema fields exist in Zod
      for (const field of esSchemaFields) {
        expect(zodFields).toContain(field)
      }
    })
  })

  describe("EsDatasetSchema vs datasetSchema", () => {
    it("should have matching top-level fields", () => {
      const zodFields = getZodFieldNames(EsDatasetSchema)
      const esSchemaFields = getSchemaFieldNames(datasetSchema)

      // Check that all Zod fields exist in ES schema
      for (const field of zodFields) {
        expect(esSchemaFields).toContain(field)
      }

      // Check that all ES schema fields exist in Zod
      for (const field of esSchemaFields) {
        expect(zodFields).toContain(field)
      }
    })
  })

  describe("EsResearchVersionSchema vs researchVersionSchema", () => {
    it("should have matching top-level fields", () => {
      const zodFields = getZodFieldNames(EsResearchVersionSchema)
      const esSchemaFields = getSchemaFieldNames(researchVersionSchema)

      // Compare field sets
      const zodFieldSet = new Set(zodFields)
      const esSchemaFieldSet = new Set(esSchemaFields)

      // Check fields in Zod but not in ES schema
      for (const field of zodFields) {
        if (!esSchemaFieldSet.has(field)) {
          // datasets in Zod maps to datasetIds in ES schema
          if (field === "datasets") {
            expect(esSchemaFieldSet.has("datasetIds")).toBe(true)
          } else {
            // This will fail with a clear message
            expect(esSchemaFields).toContain(field)
          }
        }
      }

      // Check fields in ES schema but not in Zod
      for (const field of esSchemaFields) {
        if (!zodFieldSet.has(field)) {
          // datasetIds in ES schema maps to datasets in Zod
          if (field === "datasetIds") {
            expect(zodFieldSet.has("datasets")).toBe(true)
          } else {
            // This will fail with a clear message
            expect(zodFields).toContain(field)
          }
        }
      }
    })
  })

  // ===========================================================================
  // Mapping structure validation
  // ===========================================================================
  describe("researchMapping structure", () => {
    it("should have dynamic: false", () => {
      expect(researchMapping.mappings.dynamic).toBe(false)
    })

    it("should have properties object", () => {
      expect(typeof researchMapping.mappings.properties).toBe("object")
    })

    it("should have keyword type for humId", () => {
      const humId = researchMapping.mappings.properties.humId as { type: string }
      expect(humId.type).toBe("keyword")
    })

    it("should have date type for datePublished", () => {
      const datePublished = researchMapping.mappings.properties.datePublished as { type: string }
      expect(datePublished.type).toBe("date")
    })

    it("should have nested type for dataProvider", () => {
      const dataProvider = researchMapping.mappings.properties.dataProvider as { type: string }
      expect(dataProvider.type).toBe("nested")
    })
  })

  describe("datasetMapping structure", () => {
    it("should have dynamic: false", () => {
      expect(datasetMapping.mappings.dynamic).toBe(false)
    })

    it("should have keyword type for datasetId", () => {
      const datasetId = datasetMapping.mappings.properties.datasetId as { type: string }
      expect(datasetId.type).toBe("keyword")
    })

    it("should have nested type for experiments", () => {
      const experiments = datasetMapping.mappings.properties.experiments as { type: string }
      expect(experiments.type).toBe("nested")
    })

    it("should have flattened type for experiments.data", () => {
      const experiments = datasetMapping.mappings.properties.experiments as {
        type: string
        properties: Record<string, { type: string }>
      }
      expect(experiments.properties.data.type).toBe("flattened")
    })
  })

  describe("researchVersionMapping structure", () => {
    it("should have dynamic: false", () => {
      expect(researchVersionMapping.mappings.dynamic).toBe(false)
    })

    it("should have keyword type for version", () => {
      const version = researchVersionMapping.mappings.properties.version as { type: string }
      expect(version.type).toBe("keyword")
    })
  })

  // ===========================================================================
  // Type consistency checks
  // ===========================================================================
  describe("type consistency", () => {
    it("should use keyword type for ID fields", () => {
      // Research
      const researchProps = researchMapping.mappings.properties as Record<
        string,
        { type: string }
      >
      expect(researchProps.humId.type).toBe("keyword")

      // Dataset
      const datasetProps = datasetMapping.mappings.properties as Record<
        string,
        { type: string }
      >
      expect(datasetProps.datasetId.type).toBe("keyword")
      expect(datasetProps.humId.type).toBe("keyword")
      expect(datasetProps.humVersionId.type).toBe("keyword")

      // ResearchVersion
      const rvProps = researchVersionMapping.mappings.properties as Record<
        string,
        { type: string }
      >
      expect(rvProps.humId.type).toBe("keyword")
      expect(rvProps.humVersionId.type).toBe("keyword")
    })

    it("should use date type for date fields", () => {
      // Research
      const researchProps = researchMapping.mappings.properties as Record<
        string,
        { type: string }
      >
      expect(researchProps.datePublished.type).toBe("date")
      expect(researchProps.dateModified.type).toBe("date")

      // Dataset
      const datasetProps = datasetMapping.mappings.properties as Record<
        string,
        { type: string }
      >
      expect(datasetProps.versionReleaseDate.type).toBe("date")
      expect(datasetProps.releaseDate.type).toBe("date")

      // ResearchVersion
      const rvProps = researchVersionMapping.mappings.properties as Record<
        string,
        { type: string }
      >
      expect(rvProps.versionReleaseDate.type).toBe("date")
    })
  })
})
