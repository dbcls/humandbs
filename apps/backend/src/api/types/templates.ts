/**
 * Template endpoints schemas
 *
 * Response shape for GET /templates/research/{jdsId} and
 * GET /templates/dataset/{externalId}. The data payload is fully compatible
 * with POST /research/new and POST /research/{humId}/dataset/new request
 * bodies, so admins can fetch a draft, edit it, and post it back without
 * field-level transformation.
 *
 * Extra fields beyond the create request schemas:
 *   - relatedAccessions (research only): JGAD accessions from J-DS for follow-up
 *     calls to GET /templates/dataset/{externalId}
 *   - warnings: non-fatal notices (e.g., existing hum_id, partial DRX fetch failures)
 */
import "@hono/zod-openapi"
import { z } from "zod"

import {
  createSingleReadOnlyResponseSchema,
  CreateDatasetForResearchRequestSchema,
  CreateResearchRequestSchema,
} from "./request-response"

// === Common sub-schemas ===

export const RelatedAccessionsSchema = z.object({
  jgad: z
    .array(z.string())
    .describe(
      "JGAD accessions linked to this J-DS application (jds.jgaIds filtered by JGAD prefix). Use these IDs as the externalId for GET /templates/dataset/{externalId}.",
    ),
})
export type RelatedAccessions = z.infer<typeof RelatedAccessionsSchema>

// === Path parameter schema ===

/**
 * externalId accepts JGAD or DRA Submission accessions only.
 * Other DDBJ accession prefixes (JGAS / JGAN / JGAX / JGAR / DRP / DRX / DRS /
 * DRR / PRJDB / SAMD) are rejected with 400 VALIDATION_ERROR so the unit of
 * "1 Dataset" remains unambiguous.
 */
export const EXTERNAL_ID_REGEX = /^(JGAD|DRA)\d+$/

export const TemplateDatasetParamsSchema = z.object({
  externalId: z
    .string()
    .regex(
      EXTERNAL_ID_REGEX,
      "externalId must be a JGAD accession (e.g., 'JGAD000001') or a DRA Submission accession (e.g., 'DRA000001')",
    )
    .describe(
      "External dataset accession. Accepted prefixes: 'JGAD' (controlled-access) or 'DRA' (submission, unrestricted).",
    ),
})
export type TemplateDatasetParams = z.infer<typeof TemplateDatasetParamsSchema>

// === Response data schemas ===

/**
 * Research template payload: superset of CreateResearchRequest.
 *
 * NOTE: extend({...}) keeps all CreateResearchRequest fields optional. Admins
 * post the same JSON back to /research/new after editing.
 */
export const ResearchTemplateDataSchema = CreateResearchRequestSchema.extend({
  relatedAccessions: RelatedAccessionsSchema.describe(
    "External accessions referenced by the J-DS application",
  ),
  warnings: z
    .array(z.string())
    .describe(
      "Non-fatal warnings produced while assembling the template (e.g., the suggested humId already exists)",
    ),
})
export type ResearchTemplateData = z.infer<typeof ResearchTemplateDataSchema>

export const ResearchTemplateResponseSchema =
  createSingleReadOnlyResponseSchema(ResearchTemplateDataSchema)
export type ResearchTemplateResponse = z.infer<
  typeof ResearchTemplateResponseSchema
>

/**
 * Dataset template payload: superset of CreateDatasetForResearchRequest.
 */
export const DatasetTemplateDataSchema =
  CreateDatasetForResearchRequestSchema.extend({
    warnings: z
      .array(z.string())
      .describe(
        "Non-fatal warnings produced while assembling the template (e.g., individual DRX entries that failed to fetch from DDBJ Search API)",
      ),
  })
export type DatasetTemplateData = z.infer<typeof DatasetTemplateDataSchema>

export const DatasetTemplateResponseSchema =
  createSingleReadOnlyResponseSchema(DatasetTemplateDataSchema)
export type DatasetTemplateResponse = z.infer<
  typeof DatasetTemplateResponseSchema
>
