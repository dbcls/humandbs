/**
 * Dataset API Routes
 *
 * Handles CRUD operations and versioning for Dataset resources.
 * Dataset visibility is determined by linked Research status.
 */
import { createRoute } from "@hono/zod-openapi"

import { ConflictError, NotFoundError, ValidationError } from "@/api/errors"
import {
  deleteDataset,
  getDataset,
  getDatasetWithSeqNo,
  getResearchByDatasetId,
  listDatasetVersions,
  updateDataset,
} from "@/api/es-client/dataset"
import { searchDatasets } from "@/api/es-client/search"
import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import {
  listResponse,
  searchResponse,
  singleReadOnlyResponse,
  singleResponse,
} from "@/api/helpers/response"
import { optionalAuth } from "@/api/middleware/auth"
import { loadDatasetAndAuthorize } from "@/api/middleware/resource-auth"
import { SECURITY_OPTIONAL_AUTH, SECURITY_REQUIRES_AUTH } from "@/api/openapi/document"
import {
  exampleDatasetDetailResponse,
  exampleDatasetSearchResponse,
  exampleDatasetUpdateResponse,
  exampleDatasetVersionDetailResponse,
  exampleDatasetVersionsListResponse,
  exampleLinkedResearchesListResponse,
  exampleUpdateDatasetRequest,
} from "@/api/openapi/examples"
import {
  ErrorSpec400,
  ErrorSpec401,
  ErrorSpec403,
  ErrorSpec404,
  ErrorSpec409,
  ErrorSpec500,
} from "@/api/routes/errors"
import {
  DatasetDetailResponseSchema,
  DatasetIdParamsSchema,
  DatasetListingQuerySchema,
  DatasetSearchResponseSchema,
  DatasetUpdateResponseSchema,
  DatasetVersionDetailResponseSchema,
  DatasetVersionParamsSchema,
  DatasetVersionsListResponseSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  LinkedResearchesListResponseSchema,
  UpdateDatasetRequestSchema,
} from "@/api/types"
import { createPagination } from "@/api/types/response"
import { addMergedSearchable } from "@/api/utils/merge-searchable"
import { maybeStripRawHtml } from "@/api/utils/strip-raw-html"

// === Route Definitions ===

const listDatasetsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Dataset"],
  operationId: "listDatasets",
  summary: "List Datasets",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Get a paginated list of Dataset resources.

**Visibility by role:**
- **public**: Only Datasets linked to published Research
- **authenticated**: Published + Datasets linked to own Research (where user is in uids)
- **admin**: All Datasets

**Note:** For complex searches with filters, use POST /dataset/search instead.`,
  request: {
    query: DatasetListingQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetSearchResponseSchema, example: exampleDatasetSearchResponse } },
      description: "List of datasets with optional facets",
    },
    400: ErrorSpec400,
    500: ErrorSpec500,
  },
})

const getDatasetRoute = createRoute({
  method: "get",
  path: "/{datasetId}",
  tags: ["Dataset"],
  operationId: "getDataset",
  summary: "Get Dataset Detail",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Get detailed information about a specific Dataset.

**Visibility:**
- public: Only if parent Research is published
- authenticated: Published + Datasets linked to own Research
- admin: All Datasets

Returns the latest version by default. Use GET /dataset/{datasetId}/versions/{version} for a specific version.

Response includes \`mergedSearchable\` field which aggregates all experiment searchable fields.`,
  request: {
    params: DatasetIdParamsSchema,
    query: LangVersionQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetDetailResponseSchema, example: exampleDatasetDetailResponse } },
      description: "Dataset detail with merged searchable fields",
    },
    400: ErrorSpec400,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const updateDatasetRoute = createRoute({
  method: "put",
  path: "/{datasetId}/update",
  tags: ["Dataset"],
  operationId: "updateDataset",
  summary: "Update Dataset",
  security: SECURITY_REQUIRES_AUTH,
  description: `Update a Dataset (full replacement).

**Authorization:** Owner (user in parent Research's uids) or admin

**Precondition:** Parent Research must be in draft status

**Optimistic Locking:** Include _seq_no and _primary_term from GET response to detect concurrent edits.

**Versioning behavior:**
- First update in a draft cycle creates a new Dataset version
- Subsequent updates modify the same version until Research is published`,
  request: {
    params: DatasetIdParamsSchema,
    query: LangVersionQuerySchema,
    body: { content: { "application/json": { schema: UpdateDatasetRequestSchema, example: exampleUpdateDatasetRequest } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetUpdateResponseSchema, example: exampleDatasetUpdateResponse } },
      description: "Dataset updated successfully",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

const deleteDatasetRoute = createRoute({
  method: "post",
  path: "/{datasetId}/delete",
  tags: ["Dataset"],
  operationId: "deleteDataset",
  summary: "Delete Dataset",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  description: `Delete a Dataset (physical deletion).

**Authorization:** Admin only

**Precondition:** Parent Research must be in draft status

**Behavior:**
- Physically removes the Dataset from the database
- Automatically removed from parent Research's dataset list
- Use version query parameter to delete a specific version only`,
  request: {
    params: DatasetIdParamsSchema,
    query: LangVersionQuerySchema,
  },
  responses: {
    204: { description: "Dataset deleted successfully" },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

const listVersionsRoute = createRoute({
  method: "get",
  path: "/{datasetId}/versions",
  tags: ["Dataset Versions"],
  operationId: "listDatasetVersions",
  summary: "List Dataset Versions",
  security: SECURITY_OPTIONAL_AUTH,
  description: `List all versions of a Dataset.

Dataset versions are tied to Research versions. Each time a Research is published, the current Dataset versions are finalized.`,
  request: {
    params: DatasetIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetVersionsListResponseSchema, example: exampleDatasetVersionsListResponse } },
      description: "List of versions",
    },
    400: ErrorSpec400,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const getVersionRoute = createRoute({
  method: "get",
  path: "/{datasetId}/versions/{version}",
  tags: ["Dataset Versions"],
  operationId: "getDatasetVersion",
  summary: "Get Specific Version",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Get a specific version of a Dataset.

Version format: v1, v2, v3, etc.

Response includes \`mergedSearchable\` field which aggregates all experiment searchable fields.`,
  request: {
    params: DatasetVersionParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetVersionDetailResponseSchema, example: exampleDatasetVersionDetailResponse } },
      description: "Version detail with merged searchable fields",
    },
    400: ErrorSpec400,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listLinkedResearchesRoute = createRoute({
  method: "get",
  path: "/{datasetId}/research",
  tags: ["Dataset"],
  operationId: "listLinkedResearches",
  summary: "Get Parent Research",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Get the parent Research that this Dataset belongs to.

A Dataset belongs to exactly one Research (1:N relationship). Returns an array with a single Research element.`,
  request: {
    params: DatasetIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: LinkedResearchesListResponseSchema, example: exampleLinkedResearchesListResponse } },
      description: "Parent Research",
    },
    400: ErrorSpec400,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

// === Router ===

export const datasetRouter = createOpenAPIHono()

datasetRouter.use("*", optionalAuth)

// Path-specific middleware: run BEFORE zod validators so unauthenticated /
// non-owner / non-draft-parent callers get 401/403/404 instead of a 400 that
// would leak the body schema (security).
datasetRouter.use(
  "/:datasetId/update",
  loadDatasetAndAuthorize({ requireOwnership: true, requireParentDraft: true }),
)
datasetRouter.use(
  "/:datasetId/delete",
  loadDatasetAndAuthorize({ requireAdmin: true, requireParentDraft: true }),
)

// GET /dataset
datasetRouter.openapi(listDatasetsRoute, async (c) => {
  const query = c.req.valid("query")
  const authUser = c.get("authUser")

  // Convert listing query to search query format
  const result = await searchDatasets({
    page: query.page,
    limit: query.limit,
    lang: query.lang,
    sort: query.sort,
    order: query.order,
    humId: query.humId,
    includeFacets: query.includeFacets,
    includeRawHtml: query.includeRawHtml,
  }, authUser)

  const strippedData = maybeStripRawHtml(result.data, query.includeRawHtml ?? false)
  const pagination = createPagination(result.pagination.total, result.pagination.page, result.pagination.limit)

  return searchResponse(c, strippedData, pagination, result.facets)
})

// GET /dataset/{datasetId}
datasetRouter.openapi(getDatasetRoute, async (c) => {
  const { datasetId } = c.req.valid("param")
  const query = c.req.valid("query")
  const authUser = c.get("authUser")

  const dataset = await getDataset(datasetId, { version: query.version ?? undefined }, authUser)
  if (dataset === null) {
    throw NotFoundError.forResource("Dataset", datasetId)
  }

  // Get seqNo for the response
  const datasetWithSeqNo = await getDatasetWithSeqNo(datasetId, dataset.version)
  if (!datasetWithSeqNo) {
    throw NotFoundError.forResource("Dataset", datasetId)
  }

  // Add mergedSearchable (aggregates all experiment searchable fields)
  const datasetWithMerged = addMergedSearchable(dataset)
  const strippedDataset = maybeStripRawHtml(datasetWithMerged, query.includeRawHtml ?? false)

  return singleResponse(c, strippedDataset, datasetWithSeqNo.seqNo, datasetWithSeqNo.primaryTerm)
})

// PUT /dataset/{datasetId}/update
// auth / ownership / parent-draft are validated by loadDatasetAndAuthorize before validators run.
datasetRouter.openapi(updateDatasetRoute, async (c) => {
  const preloaded = c.get("dataset")
  const { datasetId, version } = preloaded

  const body = c.req.valid("json")
  const seqNo = body._seq_no
  const primaryTerm = body._primary_term

  // body.humId must match the dataset's existing parent linkage. Without
  // this check, an owner of Research A could try to repoint Dataset X to
  // Research B via the body. The ES layer (`updateDataset`) is a second
  // backstop — it ignores humId / humVersionId in updates outright — but this
  // 400 short-circuits the call so the client gets a clear error.
  //
  // body.humVersionId is NOT compared because the value rotates across draft
  // cycles (v1 → v2 when a new Research version is created). Pinning the
  // correct humVersionId is the ES layer's job (`bumpDatasetVersion` derives
  // it from `currentDoc.humId` + `parentResearch.draftVersion`).
  if (body.humId !== preloaded.humId) {
    throw new ValidationError(
      "body.humId must match the dataset's parent Research",
    )
  }

  const updated = await updateDataset(datasetId, version, {
    releaseDate: body.releaseDate,
    criteria: body.criteria,
    typeOfData: body.typeOfData,
    experiments: body.experiments,
  }, seqNo, primaryTerm)

  if (!updated) {
    throw new ConflictError()
  }

  // Get updated seqNo/primaryTerm — use the post-update version, which may
  // differ from `version` (the URL-resolved current version) when a draft-cycle
  // bump created a new Dataset version document.
  const updatedWithSeqNo = await getDatasetWithSeqNo(datasetId, updated.version)
  if (!updatedWithSeqNo) {
    throw new NotFoundError("Updated dataset not found")
  }

  const responseData = {
    ...updated,
    updatedAt: new Date().toISOString(),
  }

  return singleResponse(c, responseData, updatedWithSeqNo.seqNo, updatedWithSeqNo.primaryTerm)
})

// POST /dataset/{datasetId}/delete
// auth / admin / parent-draft are validated by loadDatasetAndAuthorize.
// Missing dataset surfaces as 404 from the middleware (architecture.md § Dataset 削除).
datasetRouter.openapi(deleteDatasetRoute, async (c) => {
  const { datasetId } = c.get("dataset")
  const query = c.req.valid("query")
  const version = query.version ?? undefined // If undefined, deletes all versions

  await deleteDataset(datasetId, version)

  return c.body(null, 204)
})

// GET /dataset/{datasetId}/versions
datasetRouter.openapi(listVersionsRoute, async (c) => {
  const { datasetId } = c.req.valid("param")
  const authUser = c.get("authUser")

  const versions = await listDatasetVersions(datasetId, authUser)
  if (versions === null) {
    throw NotFoundError.forResource("Dataset", datasetId)
  }

  // Versions list has no pagination (returns all versions)
  const pagination = createPagination(versions.length, 1, versions.length || 1)

  return listResponse(c, versions, pagination)
})

// GET /dataset/{datasetId}/versions/{version}
datasetRouter.openapi(getVersionRoute, async (c) => {
  const { datasetId, version } = c.req.valid("param")
  const authUser = c.get("authUser")

  const dataset = await getDataset(datasetId, { version }, authUser)
  if (dataset === null) {
    throw new NotFoundError(`Dataset version ${version} not found`)
  }

  // Add mergedSearchable (aggregates all experiment searchable fields)
  const datasetWithMerged = addMergedSearchable(dataset)

  // Historical versions are read-only
  return singleReadOnlyResponse(c, datasetWithMerged)
})

// GET /dataset/{datasetId}/research
datasetRouter.openapi(listLinkedResearchesRoute, async (c) => {
  const { datasetId } = c.req.valid("param")
  const authUser = c.get("authUser")

  // Get the parent Research for this Dataset
  const research = await getResearchByDatasetId(datasetId, authUser)
  if (!research) {
    throw new NotFoundError(`Dataset ${datasetId} not found or no linked research`)
  }

  // Return as list response (single Research wrapped in array)
  const pagination = createPagination(1, 1, 1)

  return listResponse(c, [research], pagination)
})
