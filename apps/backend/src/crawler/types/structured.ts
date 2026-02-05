/**
 * Output type definitions (ja/en integrated structure)
 *
 * These types represent the final bilingual output after merging ja/en data,
 * including searchable fields for search functionality.
 *
 * ES で使う型は Zod スキーマで定義し、TypeScript 型を推論する。
 */
import { z } from "zod"

import {
  TextValueSchema,
  BilingualTextSchema,
  BilingualTextValueSchema,
  BilingualUrlValueSchema,
  CriteriaCanonicalSchema,
  NormalizedPolicySchema,
  PeriodOfDataUseSchema,
  UrlValueSchema,
} from "./common"
import type {
  UrlValue,
} from "./common"

// === Searchable types (extracted via LLM + rule-based for search functionality) ===
// These are Zod schemas as they are stored in ES
// Note: Defined first because ExperimentSchema depends on SearchableExperimentFieldsSchema

/** Subject count type */
export const SubjectCountTypeSchema = z.enum(["individual", "sample", "mixed"])
export type SubjectCountType = z.infer<typeof SubjectCountTypeSchema>

/** Health status */
export const HealthStatusSchema = z.enum(["healthy", "affected", "mixed"])
export type HealthStatus = z.infer<typeof HealthStatusSchema>

/** Read type */
export const ReadTypeSchema = z.enum(["single-end", "paired-end"])
export type ReadType = z.infer<typeof ReadTypeSchema>

/** Disease information (icd10 is nullable in crawler output, but required after icd10-normalize) */
export const DiseaseInfoSchema = z.object({
  label: z.string(),
  icd10: z.string().nullable(),
})
export type DiseaseInfo = z.infer<typeof DiseaseInfoSchema>

/** Platform information */
export const PlatformInfoSchema = z.object({
  vendor: z.string(),
  model: z.string(),
})
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>

/** Sex */
export const SexSchema = z.enum(["male", "female", "mixed"])
export type Sex = z.infer<typeof SexSchema>

/** Age group */
export const AgeGroupSchema = z.enum(["infant", "child", "adult", "elderly", "mixed"])
export type AgeGroup = z.infer<typeof AgeGroupSchema>

/** Variant counts */
export const VariantCountsSchema = z.object({
  snv: z.number().nullable(),
  indel: z.number().nullable(),
  cnv: z.number().nullable(),
  sv: z.number().nullable(),
  total: z.number().nullable(),
})
export type VariantCounts = z.infer<typeof VariantCountsSchema>

/** Experiment-level searchable fields (extracted via LLM + rule-based) */
export const SearchableExperimentFieldsSchema = z.object({
  // Subject/sample info
  subjectCount: z.number().nullable(),
  subjectCountType: SubjectCountTypeSchema.nullable(),
  healthStatus: HealthStatusSchema.nullable(),

  // Disease info (multiple diseases supported)
  diseases: z.array(DiseaseInfoSchema),

  // Biological sample info
  tissues: z.array(z.string()),
  isTumor: z.boolean().nullable(),
  cellLine: z.array(z.string()),
  population: z.array(z.string()),

  // Demographics
  sex: SexSchema.nullable(),
  ageGroup: AgeGroupSchema.nullable(),

  // Experimental method
  assayType: z.array(z.string()),
  libraryKits: z.array(z.string()),

  // Platform
  platforms: z.array(PlatformInfoSchema),
  readType: ReadTypeSchema.nullable(),
  readLength: z.number().nullable(),

  // Sequencing quality
  sequencingDepth: z.number().nullable(),
  targetCoverage: z.number().nullable(),
  referenceGenome: z.array(z.string()),

  // Variant data
  variantCounts: VariantCountsSchema.nullable(),
  hasPhenotypeData: z.boolean().nullable(),

  // Target region
  targets: z.string().nullable(),

  // Data info
  fileTypes: z.array(z.string()),
  processedDataTypes: z.array(z.string()),
  dataVolumeGb: z.number().nullable(),

  // Policies (rule-based, not LLM)
  policies: z.array(NormalizedPolicySchema),
})
export type SearchableExperimentFields = z.infer<typeof SearchableExperimentFieldsSchema>

// === Output Types (Zod schemas for ES storage) ===

/** Experiment (ja/en pairs) */
export const ExperimentSchema = z.object({
  header: BilingualTextValueSchema,
  data: z.record(z.string(), BilingualTextValueSchema.nullable()),
  footers: z.object({
    ja: z.array(TextValueSchema),
    en: z.array(TextValueSchema),
  }),
  searchable: SearchableExperimentFieldsSchema.optional(),
})
export type Experiment = z.infer<typeof ExperimentSchema>

/** Dataset (language-integrated) */
export const DatasetSchema = z.object({
  // Language-independent
  datasetId: z.string(),
  version: z.string(),
  versionReleaseDate: z.string(),
  humId: z.string(),
  humVersionId: z.string(),
  releaseDate: z.string(),
  criteria: CriteriaCanonicalSchema, // must not be null, single value

  // Language-dependent - at least one of ja/en must be non-null
  typeOfData: z.object({
    ja: z.string().nullable(),
    en: z.string().nullable(),
  }),

  // Experiments (ja/en pairs)
  experiments: z.array(ExperimentSchema),
})
export type Dataset = z.infer<typeof DatasetSchema>

/** Summary (language-integrated) */
export const SummarySchema = z.object({
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
export type Summary = z.infer<typeof SummarySchema>
export type { UrlValue }

/** Person (data provider or controlled access user) */
export const PersonSchema = z.object({
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
  periodOfDataUse: PeriodOfDataUseSchema.nullable().optional(),
})
export type Person = z.infer<typeof PersonSchema>

/** Research project */
export const ResearchProjectSchema = z.object({
  name: BilingualTextValueSchema,
  url: BilingualUrlValueSchema.nullable().optional(),
})
export type ResearchProject = z.infer<typeof ResearchProjectSchema>

/** Grant */
export const GrantSchema = z.object({
  id: z.array(z.string()),
  title: BilingualTextSchema,
  agency: z.object({ name: BilingualTextSchema }),
})
export type Grant = z.infer<typeof GrantSchema>

/** Publication */
export const PublicationSchema = z.object({
  title: BilingualTextSchema,
  doi: z.string().nullable().optional(),
  datasetIds: z.array(z.string()).optional(),
})
export type Publication = z.infer<typeof PublicationSchema>

/** Research (language-integrated) */
export const ResearchSchema = z.object({
  // Language-independent
  humId: z.string(),
  url: BilingualTextSchema,

  // Language-dependent
  title: BilingualTextSchema,
  summary: SummarySchema,

  // Data provider
  dataProvider: z.array(PersonSchema),

  // Research project
  researchProject: z.array(ResearchProjectSchema),

  // Grant information
  grant: z.array(GrantSchema),

  // Publications (accumulated)
  relatedPublication: z.array(PublicationSchema),

  // Controlled access users (accumulated)
  controlledAccessUser: z.array(PersonSchema),

  // Version references
  versionIds: z.array(z.string()),
  latestVersion: z.string(),

  // Timestamps
  datePublished: z.string(),
  dateModified: z.string(),
})
export type Research = z.infer<typeof ResearchSchema>

/** Dataset reference with version */
export const DatasetRefSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
})
export type DatasetRef = z.infer<typeof DatasetRefSchema>

/** Research version (language-integrated) */
export const ResearchVersionSchema = z.object({
  // Language-independent
  humId: z.string(),
  humVersionId: z.string(),
  version: z.string(),
  versionReleaseDate: z.string(),
  datasets: z.array(DatasetRefSchema),

  // Language-dependent
  releaseNote: BilingualTextValueSchema,
})
export type ResearchVersion = z.infer<typeof ResearchVersionSchema>

/** Dataset with additional metadata for LLM extraction */
export const SearchableDatasetSchema = DatasetSchema.extend({
  originalMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
})
export type SearchableDataset = z.infer<typeof SearchableDatasetSchema>
