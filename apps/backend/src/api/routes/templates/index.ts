/**
 * Templates API Router
 *
 * Admin-only endpoints that build draft JSON for POST /research/new and
 * POST /research/{humId}/dataset/new from external accessions (J-DS, JGAD,
 * DRA Submission). The output is shape-compatible with the corresponding
 * create requests so admins paste it back after editing.
 *
 * Source unit mapping:
 *   Research = J-DS application (= JGAS)
 *   Dataset  = JGAD or DRA Submission
 *   Experiment = DRX (per DRX = one experiment row, only for DRA input)
 */
import { createRoute } from "@hono/zod-openapi"

import { getDsApplication } from "@/api/db-client/jga-shinsei"
import { NotFoundError } from "@/api/errors"
import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import { singleReadOnlyResponse } from "@/api/helpers/response"
import { requireAdmin, requireAuth } from "@/api/middleware/auth"
import { getRequestId } from "@/api/middleware/request-id"
import { SECURITY_REQUIRES_AUTH } from "@/api/openapi/document"
import {
  ErrorSpec400,
  ErrorSpec401,
  ErrorSpec403,
  ErrorSpec404,
  ErrorSpec500,
} from "@/api/routes/errors"
import {
  DatasetTemplateResponseSchema,
  JdsIdParamsSchema,
  ResearchTemplateResponseSchema,
  TemplateDatasetParamsSchema,
} from "@/api/types"

import { mapDraSubmissionToDatasetTemplate } from "./mapping-dataset-dra"
import { mapJgadToDatasetTemplate } from "./mapping-dataset-jgad"
import { mapDsApplicationToResearchTemplate } from "./mapping-research"

const getResearchTemplateRoute = createRoute({
  method: "get",
  path: "/research/{jdsId}",
  tags: ["Templates"],
  operationId: "getResearchTemplate",
  summary: "Get Research draft from a J-DS application",
  description:
    "**Authorization:** Admin only.\n\n" +
    "Build a Research draft from the JGA-Shinsei DB record identified by `jdsId`. " +
    "The response payload is shape-compatible with `POST /research/new` request " +
    "body so the admin can edit and post it back without field-level " +
    "transformation. JGAD accessions linked to this J-DS appear under " +
    "`relatedAccessions.jgad` so the admin can follow up with " +
    "`GET /templates/dataset/{externalId}` for each Dataset.",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  request: {
    params: JdsIdParamsSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: ResearchTemplateResponseSchema },
      },
      description: "Research template payload",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const getDatasetTemplateRoute = createRoute({
  method: "get",
  path: "/dataset/{externalId}",
  tags: ["Templates"],
  operationId: "getDatasetTemplate",
  summary: "Get Dataset draft from a JGAD or DRA Submission accession",
  description:
    "**Authorization:** Admin only.\n\n" +
    "Build a Dataset draft from an external accession. Accepted prefixes:\n\n" +
    "- `JGAD` (controlled-access): mapped to a draft with `criteria = " +
    "'Controlled-access (Type II)'` and empty `experiments` (JGAD's public " +
    "metadata does not expose per-sample attributes — admins fill in `experiments` " +
    "manually).\n" +
    "- `DRA` (DRA Submission, e.g. `DRA000001`): the submission is traversed " +
    "to DRP -> DRX -> DRS/BioSample and 1 experiment row per DRX is emitted. " +
    "BioSample attributes are merged into `experiments[].data` keyed by " +
    "`harmonized_name` (snake_case INSDC vocab).\n\n" +
    "Partial fetch failures during DRX traversal surface in `warnings[]`; the " +
    "root submission must be reachable or the response is 404 / 502.",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  request: {
    params: TemplateDatasetParamsSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: DatasetTemplateResponseSchema },
      },
      description: "Dataset template payload",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

// === Router ===

export const templatesRouter = createOpenAPIHono()

// All routes require admin auth
templatesRouter.use("*", requireAuth)
templatesRouter.use("*", requireAdmin)

templatesRouter.openapi(getResearchTemplateRoute, async (c) => {
  const { jdsId } = c.req.valid("param")
  // getDsApplication throws NotFoundError if J-DS is not in the JGA-Shinsei DB
  const jds = await getDsApplication(jdsId)
  const data = mapDsApplicationToResearchTemplate(jds)
  return singleReadOnlyResponse(c, data)
})

templatesRouter.openapi(getDatasetTemplateRoute, async (c) => {
  const { externalId } = c.req.valid("param")
  const requestId = getRequestId(c)

  const isJgad = externalId.startsWith("JGAD")
  const data = isJgad
    ? await mapJgadToDatasetTemplate(externalId, requestId)
    : await mapDraSubmissionToDatasetTemplate(externalId, requestId)

  if (!data) {
    throw NotFoundError.forResource(
      isJgad ? "JGAD" : "DRA Submission",
      externalId,
    )
  }
  return singleReadOnlyResponse(c, data)
})
