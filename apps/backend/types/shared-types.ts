import { z } from "zod"

// === Original Types ===

export const langType = ["ja", "en"] as const
export type LangType = typeof langType[number]

export const AddressSchema = z.object({
  country: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
}).strict()
export type Address = z.infer<typeof AddressSchema>

export const OrganizationSchema = z.object({
  name: z.string(),
  abbreviation: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  type: z.enum([
    "institution",
    "company",
    "government",
    "non-profit",
    "consortium",
    "agency",
    "other",
  ]).nullable().optional(),
  address: AddressSchema.nullable().optional(),
  rorId: z.string().nullable().optional(),
}).strict()
export type Organization = z.infer<typeof OrganizationSchema>

export const PersonSchema = z.object({
  name: z.string(),
  email: z.string().nullable().optional(),
  orcid: z.string().nullable().optional(),
  organization: OrganizationSchema.nullable().optional(),
  datasetIds: z.array(z.string()).optional(), // IDs of datasets related to this person
  researchTitle: z.string().nullable().optional(), // Title of the research this person is involved in
  periodOfDataUse: z.string().nullable().optional(), // Period during which the person can access the data
}).strict()
export type Person = z.infer<typeof PersonSchema>

export const ResearchProjectSchema = z.object({
  name: z.string(),
  url: z.string().nullable().optional(),
}).strict()
export type ResearchProject = z.infer<typeof ResearchProjectSchema>

export const GrantSchema = z.object({
  id: z.string(),
  title: z.string(),
  agency: OrganizationSchema,
}).strict()
export type Grant = z.infer<typeof GrantSchema>

export const PublicationSchema = z.object({
  title: z.string(),
  authors: z.array(PersonSchema),
  consortiums: z.array(OrganizationSchema),
  status: z.enum(["published", "unpublished", "in-press"]),
  year: z.number(),
  journal: z.string().nullable().optional(),
  volume: z.string().nullable().optional(),
  issue: z.string().nullable().optional(),
  startPage: z.string().nullable().optional(),
  endPage: z.string().nullable().optional(),
  datePublished: z.string().nullable().optional(), // ISO 8601 format (e.g., "2023-10-01")
  doi: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  pubMedId: z.string().nullable().optional(),
  datasetIds: z.array(z.string()).optional(), // IDs of datasets related to this publication
}).strict()
export type Publication = z.infer<typeof PublicationSchema>

// Table の中身 (現状は Record<string, string> で定義しているが、将来的にはもっと詳細な型にする)
// 解析手法ごと
export const ExperimentSchema = z.object({
  header: z.string(),
  data: z.record(z.string(), z.string().nullable()),
  footers: z.array(z.string()),
}).strict()
export type Experiment = z.infer<typeof ExperimentSchema>

// es entry: /dataset/{datasetId}-{version}-{lang}
export const DatasetSchema = z.object({
  datasetId: z.string(), // e.g., "JGAD", "DRA", "E-GEAD", "MTBK", "hum.v1.rna-seq.v1", "PRJDB10452"
  lang: z.enum(langType),
  version: z.string(),
  typeOfData: z.array(z.string()).nullable().optional(),
  criteria: z.array(z.string()).nullable().optional(),
  releaseDate: z.array(z.string()).nullable().optional(),
  experiments: z.array(ExperimentSchema),
}).strict()
export type Dataset = z.infer<typeof DatasetSchema>

// es entry: /researchVersion/{humId}-{version}-{lang}
export const ResearchVersionSchema = z.object({
  humId: z.string(),
  lang: z.enum(langType),
  version: z.string(),
  humVersionId: z.string(),
  datasets: z.array(DatasetSchema),
  releaseDate: z.string(), // ISO 8601 format (e.g., "2023-10-01")
  releaseNote: z.array(z.string()),
}).strict()
export type ResearchVersion = z.infer<typeof ResearchVersionSchema>

// es entry: /research/{humId}-{lang}
export const ResearchSchema = z.object({
  humId: z.string(),
  lang: z.enum(langType),
  title: z.string(),
  url: z.string(),
  dataProvider: z.array(PersonSchema),
  researchProject: z.array(ResearchProjectSchema),
  grant: z.array(GrantSchema),
  relatedPublication: z.array(PublicationSchema),
  controlledAccessUser: z.array(PersonSchema),
  summary: z.object({
    aims: z.string(),
    methods: z.string(),
    targets: z.string(),
    url: z.array(z.object({
      url: z.string(),
      text: z.string(),
    })),
  }),
  versions: z.array(ResearchVersionSchema),
}).strict()
export type Research = z.infer<typeof ResearchSchema>

// === ES Types ===

export const DatasetDocSchema = DatasetSchema
export type DatasetDoc = z.infer<typeof DatasetDocSchema>

export const ResearchVersionDocSchema = ResearchVersionSchema.omit({ datasets: true }).extend({
  datasets: z.array(z.string()), // Store dataset IDs instead of full objects
}).strict()
export type ResearchVersionDoc = z.infer<typeof ResearchVersionDocSchema>

export const ResearchDocSchema = ResearchSchema.omit({ versions: true }).extend({
  versions: z.array(z.string()), // Store version IDs instead of full objects
}).strict()
export type ResearchDoc = z.infer<typeof ResearchDocSchema>

// === API Requests/Responses ===

// Response of GET /health
export const HealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(), // ISO 8601 format (e.g., "2023-10-01T12:00:00Z")
}).strict()
export type HealthResponse = z.infer<typeof HealthResponseSchema>

// Response of GET /users/is-admin
export const IsAdminResponseSchema = z.object({
  isAdmin: z.boolean(),
}).strict()
export type IsAdminResponse = z.infer<typeof IsAdminResponseSchema>

export const ResearchSummarySchema = z.object({
  humId: z.string(),
  lang: z.enum(langType),
  title: z.string(),
  versions: z.array(z.object({
    version: z.string(),
    releaseDate: z.string(), // ISO 8601 format (e.g., "2023-10-01")
  })),
  methods: z.string(),
  datasetIds: z.array(z.string()),
  typeOfData: z.array(z.string()),
  platforms: z.array(z.string()),
  targets: z.string(),
  dataProvider: z.array(z.string()),
  criteria: z.string(),
}).strict()
export type ResearchSummary = z.infer<typeof ResearchSummarySchema>

export const ResearchDetailSchema = ResearchDocSchema
  .omit({ versions: true })
  .extend({
    humVersionId: z.string(),
    version: z.string(),
    releaseDate: z.string(), // ISO 8601 format (e.g., "2023-10-01")
    releaseNote: z.array(z.string()),
    datasets: z.array(DatasetSchema),
  }).strict()
export type ResearchDetail = z.infer<typeof ResearchDetailSchema>

// Query parameters for GET /researches
export const ResearchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  lang: z.enum(langType).default("en"),
  sort: z.enum(["humId", "title"]).default("humId"),
  order: z.enum(["asc", "desc"]).default("asc"),
}).strict()
export type ResearchesQuery = z.infer<typeof ResearchesQuerySchema>

// Response of GET /researches
export const ResearchesResponseSchema = z.object({
  data: z.array(ResearchSummarySchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
}).strict()
export type ResearchesResponse = z.infer<typeof ResearchesResponseSchema>

export const HumIdParamsSchema = z.object({
  humId: z.string(),
}).strict()
export type HumIdParams = z.infer<typeof HumIdParamsSchema>

// Query parameter for GET /researches/{humId}/versions
export const LangQuerySchema = z.object({
  lang: z.enum(langType).default("en"),
}).strict()
export type LangQuery = z.infer<typeof LangQuerySchema>

// Response of GET /researches/{humId}/versions
export const ResearchVersionsResponseSchema = z.object({
  data: z.array(ResearchVersionDocSchema),
}).strict()
export type ResearchVersionsResponse = z.infer<typeof ResearchVersionsResponseSchema>

// Query parameter for GET /researches/{humId} and /datasets/{datasetId}
export const LangVersionQuerySchema = z.object({
  lang: z.enum(langType).default("en"),
  version: z.string().regex(/^v\d+$/).nullable().optional(),
}).strict()
export type LangVersionQuery = z.infer<typeof LangVersionQuerySchema>

export const DatasetIdParamsSchema = z.object({
  datasetId: z.string(),
}).strict()
export type DatasetIdParams = z.infer<typeof DatasetIdParamsSchema>

// Query parameters for GET /datasets
export const DatasetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  lang: z.enum(langType).default("en"),
  sort: z.enum(["humId", "title"]).default("humId"),
  order: z.enum(["asc", "desc"]).default("asc"),
}).strict()
export type DatasetsQuery = z.infer<typeof DatasetsQuerySchema>

// Response of GET /datasets
export const DatasetsResponseSchema = z.object({
  data: z.array(DatasetSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
}).strict()
export type DatasetsResponse = z.infer<typeof DatasetsResponseSchema>

// Response of GET /datasets/{datasetId}/versions
export const DatasetVersionItem = DatasetSchema.pick({
  "version": true,
  "typeOfData": true,
  "criteria": true,
  "releaseDate": true,
})
export const DatasetVersionsResponseSchema = z.object({
  data: z.array(DatasetVersionItem),
}).strict()
export type DatasetVersionItem = z.infer<typeof DatasetVersionItem>
export type DatasetVersionsResponse = z.infer<typeof DatasetVersionsResponseSchema>

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().nullable().optional(),
}).strict()
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
