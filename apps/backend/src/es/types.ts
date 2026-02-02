/**
 * Elasticsearch document types and zod schemas
 *
 * This module provides:
 * 1. Zod schemas for ES document validation
 * 2. TypeScript types inferred from zod schemas
 * 3. Re-exports of crawler types for convenience
 */
import { z } from "zod"

// === Common Zod Schemas ===

export const BilingualTextSchema = z.object({
  ja: z.string().nullable(),
  en: z.string().nullable(),
})

export const TextValueSchema = z.object({
  text: z.string(),
  rawHtml: z.string(),
})

export const UrlValueSchema = z.object({
  text: z.string(),
  url: z.string(),
})

export const BilingualTextValueSchema = z.object({
  ja: TextValueSchema.nullable(),
  en: TextValueSchema.nullable(),
})

export const BilingualUrlValueSchema = z.object({
  ja: UrlValueSchema.nullable(),
  en: UrlValueSchema.nullable(),
})

// === SearchableExperimentFields Zod Schema ===

/**
 * Disease info schema for ES documents
 * Note: icd10 is required (not nullable) because icd10-normalize step
 * ensures all diseases have a valid ICD10 code before ES indexing
 */
export const DiseaseInfoSchema = z.object({
  label: z.string(),
  icd10: z.string(),
})

export const DataVolumeSchema = z.object({
  value: z.number(),
  unit: z.enum(["KB", "MB", "GB", "TB"]),
})

export const NormalizedPolicySchema = z.object({
  id: z.string(),
  name: BilingualTextSchema,
  url: z.string().nullable(),
})

export const PlatformInfoSchema = z.object({
  vendor: z.string(),
  model: z.string(),
})

export const VariantCountsSchema = z.object({
  snv: z.number().nullable(),
  indel: z.number().nullable(),
  cnv: z.number().nullable(),
  sv: z.number().nullable(),
  total: z.number().nullable(),
})

export const SearchableExperimentFieldsSchema = z.object({
  // Subject/sample info
  subjectCount: z.number().nullable(),
  subjectCountType: z.enum(["individual", "sample", "mixed"]).nullable(),
  healthStatus: z.enum(["healthy", "affected", "mixed"]).nullable(),

  // Disease info (multiple diseases supported)
  diseases: z.array(DiseaseInfoSchema),

  // Biological sample info
  tissues: z.array(z.string()),
  isTumor: z.boolean().nullable(),
  cellLine: z.array(z.string()),
  population: z.array(z.string()),

  // Demographics
  sex: z.enum(["male", "female", "mixed"]).nullable(),
  ageGroup: z.enum(["infant", "child", "adult", "elderly", "mixed"]).nullable(),

  // Experimental method
  assayType: z.array(z.string()),
  libraryKits: z.array(z.string()),

  // Platform
  platforms: z.array(PlatformInfoSchema),
  // Flattened for ES facet aggregation
  platformVendor: z.string().nullable().optional(),
  platformModel: z.string().nullable().optional(),
  readType: z.enum(["single-end", "paired-end"]).nullable(),
  readLength: z.number().nullable(),

  // Sequencing quality
  sequencingDepth: z.number().nullable(),
  targetCoverage: z.number().nullable(),
  referenceGenome: z.array(z.string()),

  // Target region
  targets: z.string().nullable(),

  // Variant data
  variantCounts: VariantCountsSchema.nullable(),
  hasPhenotypeData: z.boolean().nullable(),

  // Data info
  fileTypes: z.array(z.string()),
  processedDataTypes: z.array(z.string()),
  dataVolume: DataVolumeSchema.nullable(),
  dataVolumeGb: z.number().nullable(), // Converted from dataVolume for easy range filtering

  // Policies (rule-based, not LLM)
  policies: z.array(NormalizedPolicySchema),
})

// === ES Experiment Schema ===

export const EsExperimentSchema = z.object({
  experimentKey: z.string().optional(),
  header: BilingualTextValueSchema,
  data: z.record(z.string(), BilingualTextValueSchema.nullable()),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
  searchable: SearchableExperimentFieldsSchema.optional(),
})

export type EsExperiment = z.infer<typeof EsExperimentSchema>

// === ES Dataset Schema ===

export const CriteriaCanonicalSchema = z.enum([
  "Controlled-access (Type I)",
  "Controlled-access (Type II)",
  "Unrestricted-access",
])

export const EsDatasetSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
  humId: z.string(),
  humVersionId: z.string(),
  versionReleaseDate: z.string(),
  releaseDate: z.string(),
  criteria: CriteriaCanonicalSchema,
  typeOfData: BilingualTextSchema,
  experiments: z.array(EsExperimentSchema),
  originalMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export type EsDataset = z.infer<typeof EsDatasetSchema>

// === ES Person Schema (for Research) ===

export const EsPersonSchema = z.object({
  name: BilingualTextValueSchema,
  email: z.string().nullable().optional(),
  orcid: z.string().nullable().optional(),
  organization: z.object({
    name: BilingualTextValueSchema,
    address: z.object({
      country: z.string().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
  researchTitle: BilingualTextSchema.optional(),
  periodOfDataUse: z.object({
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
  }).nullable().optional(),
})

export type EsPerson = z.infer<typeof EsPersonSchema>

// === ES Research Project Schema ===

export const EsResearchProjectSchema = z.object({
  name: BilingualTextValueSchema,
  url: BilingualUrlValueSchema.nullable().optional(),
})

export type EsResearchProject = z.infer<typeof EsResearchProjectSchema>

// === ES Grant Schema ===

export const EsGrantSchema = z.object({
  id: z.array(z.string()),
  title: BilingualTextSchema,
  agency: z.object({
    name: BilingualTextSchema,
  }),
})

export type EsGrant = z.infer<typeof EsGrantSchema>

// === ES Publication Schema ===

export const EsPublicationSchema = z.object({
  title: BilingualTextSchema,
  doi: z.string().nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
})

export type EsPublication = z.infer<typeof EsPublicationSchema>

// === ES Summary Schema ===

export const EsSummarySchema = z.object({
  aims: BilingualTextValueSchema,
  methods: BilingualTextValueSchema,
  targets: BilingualTextValueSchema,
  url: z.object({
    ja: z.array(UrlValueSchema),
    en: z.array(UrlValueSchema),
  }),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
})

export type EsSummary = z.infer<typeof EsSummarySchema>

// === ES Research Schema ===

export const ResearchStatusSchema = z.enum(["draft", "review", "published", "deleted"])

export type ResearchStatus = z.infer<typeof ResearchStatusSchema>

export const EsResearchSchema = z.object({
  humId: z.string(),
  url: BilingualTextSchema,
  title: BilingualTextSchema,
  summary: EsSummarySchema,
  dataProvider: z.array(EsPersonSchema),
  researchProject: z.array(EsResearchProjectSchema),
  grant: z.array(EsGrantSchema),
  relatedPublication: z.array(EsPublicationSchema),
  controlledAccessUser: z.array(EsPersonSchema),
  versionIds: z.array(z.string()),
  latestVersion: z.string(),
  datePublished: z.string(),
  dateModified: z.string(),
  status: ResearchStatusSchema,
  uids: z.array(z.string()),
})

export type EsResearch = z.infer<typeof EsResearchSchema>

// === ES Research Version Schema ===

export const DatasetRefSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
})

export type DatasetRef = z.infer<typeof DatasetRefSchema>

export const EsResearchVersionSchema = z.object({
  humId: z.string(),
  humVersionId: z.string(),
  version: z.string(),
  versionReleaseDate: z.string(),
  datasets: z.array(DatasetRefSchema),
  releaseNote: BilingualTextValueSchema,
})

export type EsResearchVersion = z.infer<typeof EsResearchVersionSchema>

// === Re-export crawler types for convenience ===

export type {
  // Common types
  LangType,
  TextValue,
  UrlValue,
  BilingualText,
  BilingualTextValue,
  BilingualUrlValue,
  CriteriaCanonical,
  NormalizedPolicy,
  // Structured types
  Experiment,
  Dataset,
  Summary,
  Person,
  ResearchProject,
  Grant,
  Publication,
  Research,
  ResearchVersion,
  // Searchable types
  SubjectCountType,
  HealthStatus,
  ReadType,
  DiseaseInfo,
  SearchableExperimentFields,
  SearchableDataset,
} from "@/crawler/types"
