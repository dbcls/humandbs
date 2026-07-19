/**
 * OpenAPI components.schemas registration.
 *
 * Surfaces the Zod-derived domain models in the generated OpenAPI document so
 * Swagger UI renders a "Schemas" section with descriptions and field types.
 *
 * Registration is a side-effect: each call adds an entry under
 * `components.schemas[name]`. Operations continue to inline their bodies (we
 * don't rewire `$ref`), so this is purely additive — useful for readers who
 * want a single place to browse the data model without drilling into every
 * route.
 */
import type { OpenAPIHono } from "@hono/zod-openapi"

import { ProblemDetailsSchema } from "@/api/types/errors"
import {
  DatasetSearchBodySchema,
  ResearchSearchBodySchema,
} from "@/api/types/filters"
import { ResearchSummarySchema } from "@/api/types/query-params"
import {
  CreateDatasetForResearchRequestSchema,
  CreateResearchRequestSchema,
  CreateVersionRequestSchema,
  UpdateDatasetRequestSchema,
  UpdateResearchRequestSchema,
} from "@/api/types/request-response"
import {
  PaginationSchema,
  ResponseMetaReadOnlySchema,
  ResponseMetaWithLockSchema,
  ResponseMetaWithPaginationSchema,
  ResponseMetaWithBatchSchema,
} from "@/api/types/response"
import {
  DatasetTemplateDataSchema,
  RelatedAccessionsSchema,
  ResearchTemplateDataSchema,
} from "@/api/types/templates"
import {
  DatasetDocWithMergedSchema,
  DatasetVersionItemSchema,
  MergedSearchableSchema,
  ResearchDetailSchema,
} from "@/api/types/views"
import {
  AddressSchema,
  CollaboratorSchema,
  ControlSchema,
  DsApplicationTransformedSchema,
  DuApplicationTransformedSchema,
  HeadSchema,
  JgaBilingualTextSchema,
  MemberSchema,
  PiSchema,
  PublicKeySchema,
  ReportSchema,
  ReviewSchema,
  ServerSchema,
  StatusHistoryEntrySchema,
  SubmitterSchema,
  UploadedFileSchema,
  UseDatasetSchema,
  UsePeriodSchema,
  UseReviewSchema,
} from "@/crawler/types/jga-shinsei"
import {
  AgeGroupSchema,
  BilingualTextSchema,
  BilingualTextValueSchema,
  BilingualUrlValueSchema,
  CrawlerDatasetSchema,
  CrawlerResearchSchema,
  CrawlerResearchVersionSchema,
  CriteriaCanonicalSchema,
  DatasetRefSchema,
  DiseaseInfoSchema,
  EsDatasetSchema,
  EsResearchSchema,
  ExperimentSchema,
  GrantSchema,
  HealthStatusSchema,
  IsTumorSchema,
  NormalizedPolicySchema,
  PeriodOfDataUseSchema,
  PersonSchema,
  PlatformInfoSchema,
  PolicyCanonicalSchema,
  PublicationSchema,
  ReadTypeSchema,
  ResearchProjectSchema,
  ResearchStatusSchema,
  SearchableDatasetSchema,
  SearchableExperimentFieldsSchema,
  SexSchema,
  SubjectCountTypeSchema,
  SummarySchema,
  TextValueSchema,
  UrlValueSchema,
  VariantCountsSchema,
} from "@/es/types"

export const registerOpenAPISchemas = (app: OpenAPIHono): void => {
  const r = app.openAPIRegistry

  // --- Primitives / value objects ---
  r.register("TextValue", TextValueSchema)
  r.register("UrlValue", UrlValueSchema)
  r.register("BilingualText", BilingualTextSchema)
  r.register("BilingualTextValue", BilingualTextValueSchema)
  r.register("BilingualUrlValue", BilingualUrlValueSchema)
  r.register("PeriodOfDataUse", PeriodOfDataUseSchema)

  // --- Enums / canonical lists ---
  r.register("CriteriaCanonical", CriteriaCanonicalSchema)
  r.register("PolicyCanonical", PolicyCanonicalSchema)
  r.register("NormalizedPolicy", NormalizedPolicySchema)
  r.register("ResearchStatus", ResearchStatusSchema)
  r.register("SubjectCountType", SubjectCountTypeSchema)
  r.register("HealthStatus", HealthStatusSchema)
  r.register("ReadType", ReadTypeSchema)
  r.register("Sex", SexSchema)
  r.register("AgeGroup", AgeGroupSchema)
  r.register("IsTumor", IsTumorSchema)

  // --- Searchable sub-structures ---
  r.register("DiseaseInfo", DiseaseInfoSchema)
  r.register("PlatformInfo", PlatformInfoSchema)
  r.register("VariantCounts", VariantCountsSchema)
  r.register("SearchableExperimentFields", SearchableExperimentFieldsSchema)

  // --- Research / Dataset composing objects ---
  r.register("Experiment", ExperimentSchema)
  r.register("Summary", SummarySchema)
  r.register("Person", PersonSchema)
  r.register("ResearchProject", ResearchProjectSchema)
  r.register("Grant", GrantSchema)
  r.register("Publication", PublicationSchema)
  r.register("DatasetRef", DatasetRefSchema)

  // --- Core domain (crawler / ES) ---
  // `Research` / `Dataset` = crawler 由来の base shape (LLM 抽出が確定した時点の構造)。
  // `EsResearch` / `EsDataset` = ES 文書実体で、`Research` に `versionIds` 等 ES 運用フィールドを足したもの。
  // API レスポンスの view (`ResearchDetail`, `DatasetDocWithMerged`) は `EsResearch` / `EsDataset` をベースに組み立てる。
  // 両方とも components に並ぶのは「crawler 出力の正規形」と「ES 上の実体」を区別したい読み手向けの参考情報。
  r.register("Research", CrawlerResearchSchema)
  r.register("ResearchVersion", CrawlerResearchVersionSchema)
  r.register("Dataset", CrawlerDatasetSchema)
  r.register("SearchableDataset", SearchableDatasetSchema)
  r.register("EsResearch", EsResearchSchema)
  r.register("EsDataset", EsDatasetSchema)

  // --- API views ---
  r.register("ResearchDetail", ResearchDetailSchema)
  r.register("ResearchSummary", ResearchSummarySchema)
  r.register("DatasetVersionItem", DatasetVersionItemSchema)
  r.register("MergedSearchable", MergedSearchableSchema)
  r.register("DatasetDocWithMerged", DatasetDocWithMergedSchema)

  // --- Response envelopes ---
  r.register("Pagination", PaginationSchema)
  r.register("ResponseMetaReadOnly", ResponseMetaReadOnlySchema)
  r.register("ResponseMetaWithLock", ResponseMetaWithLockSchema)
  r.register("ResponseMetaWithPagination", ResponseMetaWithPaginationSchema)
  r.register("ResponseMetaWithBatch", ResponseMetaWithBatchSchema)

  // --- Errors (RFC 7807) ---
  r.register("ProblemDetails", ProblemDetailsSchema)

  // --- Request bodies ---
  r.register("CreateResearchRequest", CreateResearchRequestSchema)
  r.register("UpdateResearchRequest", UpdateResearchRequestSchema)
  r.register("CreateVersionRequest", CreateVersionRequestSchema)
  r.register("CreateDatasetForResearchRequest", CreateDatasetForResearchRequestSchema)
  r.register("UpdateDatasetRequest", UpdateDatasetRequestSchema)
  r.register("ResearchSearchBody", ResearchSearchBodySchema)
  r.register("DatasetSearchBody", DatasetSearchBodySchema)

  // --- JGA Shinsei ---
  r.register("JgaBilingualText", JgaBilingualTextSchema)
  r.register("JgaAddress", AddressSchema)
  r.register("JgaHead", HeadSchema)
  r.register("JgaPi", PiSchema)
  r.register("JgaSubmitter", SubmitterSchema)
  r.register("JgaCollaborator", CollaboratorSchema)
  r.register("JgaMember", MemberSchema)
  r.register("JgaUploadedFile", UploadedFileSchema)
  r.register("JgaControl", ControlSchema)
  r.register("JgaStatusHistoryEntry", StatusHistoryEntrySchema)
  r.register("JgaReview", ReviewSchema)
  r.register("JgaUseDataset", UseDatasetSchema)
  r.register("JgaUsePeriod", UsePeriodSchema)
  r.register("JgaUseReview", UseReviewSchema)
  r.register("JgaServer", ServerSchema)
  r.register("JgaPublicKey", PublicKeySchema)
  r.register("JgaReport", ReportSchema)
  r.register("DsApplication", DsApplicationTransformedSchema)
  r.register("DuApplication", DuApplicationTransformedSchema)

  // --- Templates ---
  r.register("TemplateRelatedAccessions", RelatedAccessionsSchema)
  r.register("ResearchTemplateData", ResearchTemplateDataSchema)
  r.register("DatasetTemplateData", DatasetTemplateDataSchema)
}
