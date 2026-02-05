/**
 * Dataset API Routes
 *
 * Handles CRUD operations and versioning for Dataset resources.
 * Dataset visibility is determined by linked Research status.
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import { canAccessResearchDoc } from "@/api/es-client/auth"
import {
  deleteDataset,
  getDataset,
  getDatasetWithSeqNo,
  getResearchByDatasetId,
  listDatasetVersions,
  updateDataset,
} from "@/api/es-client/dataset"
import { getResearchDoc } from "@/api/es-client/research"
import { searchDatasets } from "@/api/es-client/search"
import {
  listResponse,
  searchResponse,
  singleReadOnlyResponse,
  singleResponse,
} from "@/api/helpers/response"
import { canDeleteResource, optionalAuth } from "@/api/middleware/auth"
import {
  ErrorSpec401,
  ErrorSpec403,
  ErrorSpec404,
  ErrorSpec409,
  ErrorSpec500,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/api/routes/errors"
import {
  createUnifiedListResponseSchema,
  createUnifiedSearchResponseSchema,
  createUnifiedSingleReadOnlyResponseSchema,
  createUnifiedSingleResponseSchema,
  DatasetIdParamsSchema,
  DatasetListingQuerySchema,
  DatasetVersionItemSchema,
  DatasetVersionParamsSchema,
  DatasetWithMetadataSchema,
  EsDatasetDocSchema,
  EsDatasetDocWithMergedSchema,
  EsResearchDetailSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  UpdateDatasetRequestSchema,
} from "@/api/types"
import { createPagination } from "@/api/types/response"
import { addMergedSearchable } from "@/api/utils/merge-searchable"
import { maybeStripRawHtml } from "@/api/utils/strip-raw-html"

// === Unified Response Schemas ===

// Dataset search/list response
const DatasetSearchUnifiedResponseSchema = createUnifiedSearchResponseSchema(EsDatasetDocSchema)

// Dataset detail with optimistic locking
const DatasetDetailResponseSchema = createUnifiedSingleResponseSchema(EsDatasetDocWithMergedSchema)

// Dataset update response with optimistic locking
const DatasetUpdateResponseSchema = createUnifiedSingleResponseSchema(DatasetWithMetadataSchema)

// Dataset versions list response
const DatasetVersionsListResponseSchema = createUnifiedListResponseSchema(DatasetVersionItemSchema)

// Dataset version detail (read-only - historical versions)
const DatasetVersionDetailResponseSchema = createUnifiedSingleReadOnlyResponseSchema(EsDatasetDocWithMergedSchema)

// Linked researches list response
const LinkedResearchesListResponseSchema = createUnifiedListResponseSchema(EsResearchDetailSchema)

// === Route Definitions ===

const listDatasetsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Dataset"],
  summary: "List Datasets",
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
      content: { "application/json": { schema: DatasetSearchUnifiedResponseSchema } },
      description: "List of datasets with optional facets",
    },
    500: ErrorSpec500,
  },
})

const getDatasetRoute = createRoute({
  method: "get",
  path: "/{datasetId}",
  tags: ["Dataset"],
  summary: "Get Dataset Detail",
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
      content: { "application/json": { schema: DatasetDetailResponseSchema } },
      description: "Dataset detail with merged searchable fields",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const updateDatasetRoute = createRoute({
  method: "put",
  path: "/{datasetId}/update",
  tags: ["Dataset"],
  summary: "Update Dataset",
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
    body: { content: { "application/json": { schema: UpdateDatasetRequestSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetUpdateResponseSchema } },
      description: "Dataset updated successfully",
    },
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
  summary: "Delete Dataset",
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
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listVersionsRoute = createRoute({
  method: "get",
  path: "/{datasetId}/versions",
  tags: ["Dataset Versions"],
  summary: "List Dataset Versions",
  description: `List all versions of a Dataset.

Dataset versions are tied to Research versions. Each time a Research is published, the current Dataset versions are finalized.`,
  request: {
    params: DatasetIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetVersionsListResponseSchema } },
      description: "List of versions",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const getVersionRoute = createRoute({
  method: "get",
  path: "/{datasetId}/versions/{version}",
  tags: ["Dataset Versions"],
  summary: "Get Specific Version",
  description: `Get a specific version of a Dataset.

Version format: v1, v2, v3, etc.

Response includes \`mergedSearchable\` field which aggregates all experiment searchable fields.`,
  request: {
    params: DatasetVersionParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: DatasetVersionDetailResponseSchema } },
      description: "Version detail with merged searchable fields",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listLinkedResearchesRoute = createRoute({
  method: "get",
  path: "/{datasetId}/research",
  tags: ["Dataset"],
  summary: "Get Parent Research",
  description: `Get the parent Research that this Dataset belongs to.

A Dataset belongs to exactly one Research (1:N relationship). Returns an array with a single Research element.`,
  request: {
    params: DatasetIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: LinkedResearchesListResponseSchema } },
      description: "Parent Research",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

// === Router ===

export const datasetRouter = new OpenAPIHono()

datasetRouter.use("*", optionalAuth)

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
datasetRouter.openapi(updateDatasetRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    throw new UnauthorizedError()
  }

  const { datasetId } = c.req.valid("param")
  const query = c.req.valid("query")
  const version = query.version ?? "v1"

  // Get dataset with sequence number for optimistic locking (used as fallback)
  const result = await getDatasetWithSeqNo(datasetId, version)
  if (!result) {
    throw new NotFoundError(`Dataset ${datasetId} version ${version} not found`)
  }

  const { doc, seqNo: currentSeqNo, primaryTerm: currentPrimaryTerm } = result

  // Check if user has access to parent Research
  const research = await getResearchDoc(doc.humId)
  if (!research) {
    throw new NotFoundError(`Parent Research ${doc.humId} not found`)
  }

  // Deleted research is not accessible
  if (research.status === "deleted") {
    throw new NotFoundError(`Parent Research ${doc.humId} not found`)
  }

  // Check permission (owner or admin can update)
  if (!canAccessResearchDoc(authUser, research)) {
    throw new ForbiddenError("Not authorized to update this dataset")
  }

  // D1: Check that parent Research is in draft status
  if (research.status !== "draft") {
    throw new ForbiddenError("Cannot update dataset: parent Research is not in draft status")
  }

  const body = c.req.valid("json")

  // Use optimistic lock values from request body (per api-spec.md)
  // If not provided, fall back to current values for backwards compatibility
  const seqNo = body._seq_no ?? currentSeqNo
  const primaryTerm = body._primary_term ?? currentPrimaryTerm

  const updated = await updateDataset(datasetId, version, {
    releaseDate: body.releaseDate,
    criteria: body.criteria,
    typeOfData: body.typeOfData,
    experiments: body.experiments,
    humId: body.humId,
    humVersionId: body.humVersionId,
  }, seqNo, primaryTerm)

  if (!updated) {
    throw new ConflictError()
  }

  // Get updated seqNo/primaryTerm
  const updatedWithSeqNo = await getDatasetWithSeqNo(datasetId, version)
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
datasetRouter.openapi(deleteDatasetRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    throw new UnauthorizedError()
  }
  if (!canDeleteResource(authUser)) {
    throw new ForbiddenError("Admin access required")
  }

  const { datasetId } = c.req.valid("param")
  const query = c.req.valid("query")
  const version = query.version ?? undefined // If undefined, deletes all versions

  // Check if dataset exists
  const dataset = await getDataset(datasetId, { version })
  if (!dataset) {
    // Already deleted or doesn't exist - idempotent success
    return c.body(null, 204)
  }

  // D2: Check that parent Research is in draft status
  const research = await getResearchDoc(dataset.humId)
  if (!research) {
    throw new NotFoundError(`Parent Research ${dataset.humId} not found`)
  }
  if (research.status === "deleted") {
    throw new NotFoundError(`Parent Research ${dataset.humId} not found`)
  }
  if (research.status !== "draft") {
    throw new ForbiddenError("Cannot delete dataset: parent Research is not in draft status")
  }

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
