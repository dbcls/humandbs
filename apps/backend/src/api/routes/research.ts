/**
 * Research API Routes
 *
 * Handles CRUD operations, versioning, status transitions, and dataset linking
 * for Research resources.
 */
import { createRoute, OpenAPIHono } from "@hono/zod-openapi"

import {
  canPerformTransition,
  getResearchDetail,
  getResearchWithSeqNo,
  listResearchVersionsSorted,
  searchResearches,
  updateResearchStatus,
  validateStatusTransition,
} from "@/api/es-client"
import { canDeleteResource, optionalAuth } from "@/api/middleware/auth"
import { ErrorSpec401, ErrorSpec403, ErrorSpec404, ErrorSpec409, ErrorSpec500 } from "@/api/routes/errors"
import {
  CreateResearchRequestSchema,
  CreateVersionRequestSchema,
  EsResearchDetailSchema,
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  LinkParamsSchema,
  LinkedDatasetsResponseSchema,
  ResearchResponseSchema,
  ResearchSearchQuerySchema,
  ResearchSearchResponseSchema,
  ResearchVersionsResponseSchema,
  StatusTransitionResponseSchema,
  UpdateResearchRequestSchema,
  VersionParamsSchema,
  VersionResponseSchema,
} from "@/api/types"
import type { HumIdParams, LangVersionQuery, LinkParams, ResearchSearchQuery, VersionParams } from "@/api/types"

// === Route Definitions ===

const listResearchRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Research"],
  summary: "List Research",
  description: "Get a paginated list of research with search and filtering. Public users see only published research. Supports keyword search, date range filters, and filtering by dataset attributes.",
  request: {
    query: ResearchSearchQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchSearchResponseSchema } },
      description: "List of research with optional facets",
    },
    500: ErrorSpec500,
  },
})

const createResearchRoute = createRoute({
  method: "post",
  path: "/new",
  tags: ["Research"],
  summary: "Create Research",
  description: "Create a new research entry with initial version (v1). Requires admin role. Admin assigns researcherUids to grant edit access.",
  request: {
    body: { content: { "application/json": { schema: CreateResearchRequestSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ResearchResponseSchema } },
      description: "Research created successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

const getResearchRoute = createRoute({
  method: "get",
  path: "/{humId}",
  tags: ["Research"],
  summary: "Get Research Detail",
  description: "Get detailed information about a specific research by its humId",
  request: {
    params: HumIdParamsSchema,
    query: LangVersionQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: EsResearchDetailSchema } },
      description: "Research detail",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const updateResearchRoute = createRoute({
  method: "put",
  path: "/{humId}/update",
  tags: ["Research"],
  summary: "Update Research",
  description: "Fully update a research entry. Requires owner or admin.",
  request: {
    params: HumIdParamsSchema,
    body: { content: { "application/json": { schema: UpdateResearchRequestSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchResponseSchema } },
      description: "Research updated successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const deleteResearchRoute = createRoute({
  method: "post",
  path: "/{humId}/delete",
  tags: ["Research"],
  summary: "Delete Research",
  description: "Delete a research entry. Requires admin role.",
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    204: { description: "Research deleted successfully" },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listVersionsRoute = createRoute({
  method: "get",
  path: "/{humId}/versions",
  tags: ["Research Versions"],
  summary: "List Research Versions",
  description: "List all versions of a research entry",
  request: {
    params: HumIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchVersionsResponseSchema } },
      description: "List of versions",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const getVersionRoute = createRoute({
  method: "get",
  path: "/{humId}/versions/{version}",
  tags: ["Research Versions"],
  summary: "Get Specific Version",
  description: "Get a specific version of a research entry",
  request: {
    params: VersionParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: VersionResponseSchema } },
      description: "Version detail",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const createVersionRoute = createRoute({
  method: "post",
  path: "/{humId}/versions/new",
  tags: ["Research Versions"],
  summary: "Create New Version",
  description: "Create a new version of a research entry. Requires owner or admin.",
  request: {
    params: HumIdParamsSchema,
    body: { content: { "application/json": { schema: CreateVersionRequestSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: VersionResponseSchema } },
      description: "Version created successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const listLinkedDatasetsRoute = createRoute({
  method: "get",
  path: "/{humId}/dataset",
  tags: ["Research Datasets"],
  summary: "List Linked Datasets",
  description: "List all datasets linked to this research",
  request: {
    params: HumIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: LinkedDatasetsResponseSchema } },
      description: "List of linked datasets",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const linkDatasetRoute = createRoute({
  method: "post",
  path: "/{humId}/dataset/{datasetId}/new",
  tags: ["Research Datasets"],
  summary: "Link Dataset",
  description: "Link a dataset to this research. Requires owner or admin.",
  request: {
    params: LinkParamsSchema,
  },
  responses: {
    201: {
      content: { "application/json": { schema: LinkedDatasetsResponseSchema } },
      description: "Dataset linked successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const unlinkDatasetRoute = createRoute({
  method: "post",
  path: "/{humId}/dataset/{datasetId}/delete",
  tags: ["Research Datasets"],
  summary: "Unlink Dataset",
  description: "Remove a dataset link from this research. Requires owner or admin.",
  request: {
    params: LinkParamsSchema,
  },
  responses: {
    204: { description: "Dataset unlinked successfully" },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const submitRoute = createRoute({
  method: "post",
  path: "/{humId}/submit",
  tags: ["Research Status"],
  summary: "Submit for Review",
  description: "Submit a draft research for review. Requires owner.",
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: StatusTransitionResponseSchema } },
      description: "Status changed to review",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

const approveRoute = createRoute({
  method: "post",
  path: "/{humId}/approve",
  tags: ["Research Status"],
  summary: "Approve Research",
  description: "Approve a research in review status. Requires admin.",
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: StatusTransitionResponseSchema } },
      description: "Status changed to published",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

const rejectRoute = createRoute({
  method: "post",
  path: "/{humId}/reject",
  tags: ["Research Status"],
  summary: "Reject Research",
  description: "Reject a research in review status. Requires admin.",
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: StatusTransitionResponseSchema } },
      description: "Status changed to draft",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

const unpublishRoute = createRoute({
  method: "post",
  path: "/{humId}/unpublish",
  tags: ["Research Status"],
  summary: "Unpublish Research",
  description: "Unpublish a published research. Requires admin.",
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: StatusTransitionResponseSchema } },
      description: "Status changed to draft",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

// === Router ===

export const researchRouter = new OpenAPIHono()

researchRouter.use("*", optionalAuth)

// GET /research
researchRouter.openapi(listResearchRoute, async (c) => {
  try {
    const query = c.req.query() as unknown as ResearchSearchQuery
    const authUser = c.get("authUser")
    const researches = await searchResearches(query, authUser)
    return c.json(researches, 200)
  } catch (error) {
    console.error("Error fetching research list:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/new (admin only - admin creates research and assigns researcherUids)
researchRouter.openapi(createResearchRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  if (!authUser.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }
  try {
    // TODO: Implement create research logic
    // Requires type mapping between API schema and ES document structure
    return c.json({ error: "Not Implemented", message: "Create research not yet implemented" }, 500)
  } catch (error) {
    console.error("Error creating research:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /research/{humId}
researchRouter.openapi(getResearchRoute, async (c) => {
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const query = c.req.query() as unknown as LangVersionQuery
    const authUser = c.get("authUser")
    const detail = await getResearchDetail(humId, { version: query.version ?? undefined }, authUser)
    if (!detail) return c.json({ error: `Research with humId ${humId} not found` }, 404)
    return c.json(detail, 200)
  } catch (error) {
    console.error("Error fetching research detail:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// PUT /research/{humId}/update
researchRouter.openapi(updateResearchRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  try {
    const { humId: _humId } = c.req.param() as unknown as HumIdParams
    // TODO: Implement update logic
    // Requires type mapping between API schema and ES document structure
    return c.json({ error: "Not Implemented", message: "Update research not yet implemented" }, 500)
  } catch (error) {
    console.error("Error updating research:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/{humId}/delete
researchRouter.openapi(deleteResearchRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  if (!canDeleteResource(authUser)) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }
  try {
    const { humId: _humId } = c.req.param() as unknown as HumIdParams
    // TODO: Implement delete logic
    return c.json({ error: "Not Implemented", message: "Delete research not yet implemented" }, 500)
  } catch (error) {
    console.error("Error deleting research:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /research/{humId}/versions
researchRouter.openapi(listVersionsRoute, async (c) => {
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const authUser = c.get("authUser")
    const versions = await listResearchVersionsSorted(humId, authUser)
    if (versions === null) return c.json({ error: `Research with humId ${humId} not found` }, 404)
    return c.json({ data: versions }, 200)
  } catch (error) {
    console.error("Error fetching research versions:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /research/{humId}/versions/{version}
researchRouter.openapi(getVersionRoute, async (c) => {
  try {
    const { humId, version } = c.req.param() as unknown as VersionParams
    const authUser = c.get("authUser")

    // Use getResearchDetail with specific version
    const detail = await getResearchDetail(humId, { version }, authUser)
    if (!detail) return c.json({ error: `Research version ${humId}/${version} not found` }, 404)

    // Return version-specific response
    return c.json({
      humId: detail.humId,
      humVersionId: detail.humVersionId,
      version: detail.version,
      versionReleaseDate: detail.versionReleaseDate,
      releaseNote: detail.releaseNote,
      datasets: detail.datasets,
    }, 200)
  } catch (error) {
    console.error("Error fetching version:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/{humId}/versions/new
researchRouter.openapi(createVersionRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  try {
    const { humId: _humId } = c.req.param() as unknown as HumIdParams
    // TODO: Implement create version logic
    return c.json({ error: "Not Implemented", message: "Create version not yet implemented" }, 500)
  } catch (error) {
    console.error("Error creating version:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// GET /research/{humId}/dataset
researchRouter.openapi(listLinkedDatasetsRoute, async (c) => {
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const authUser = c.get("authUser")
    const detail = await getResearchDetail(humId, {}, authUser)
    if (!detail) return c.json({ error: `Research with humId ${humId} not found` }, 404)
    return c.json({ data: detail.datasets ?? [] }, 200)
  } catch (error) {
    console.error("Error fetching linked datasets:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/{humId}/dataset/{datasetId}/new
researchRouter.openapi(linkDatasetRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  try {
    const { humId: _humId, datasetId: _datasetId } = c.req.param() as unknown as LinkParams
    // TODO: Implement link dataset logic
    return c.json({ error: "Not Implemented", message: "Link dataset not yet implemented" }, 500)
  } catch (error) {
    console.error("Error linking dataset:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/{humId}/dataset/{datasetId}/delete
researchRouter.openapi(unlinkDatasetRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  try {
    const { humId: _humId, datasetId: _datasetId } = c.req.param() as unknown as LinkParams
    // TODO: Implement unlink dataset logic
    return c.json({ error: "Not Implemented", message: "Unlink dataset not yet implemented" }, 500)
  } catch (error) {
    console.error("Error unlinking dataset:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/{humId}/submit
researchRouter.openapi(submitRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  try {
    const { humId } = c.req.param() as unknown as HumIdParams

    // Get research with sequence number for optimistic locking
    const result = await getResearchWithSeqNo(humId)
    if (!result) return c.json({ error: `Research ${humId} not found` }, 404)

    const { doc, seqNo, primaryTerm } = result

    // Deleted research is not accessible
    if (doc.status === "deleted") {
      return c.json({ error: `Research ${humId} not found` }, 404)
    }

    // Check permission (owner or admin can submit)
    if (!canPerformTransition(authUser, doc, "submit")) {
      return c.json({ error: "Forbidden", message: "Not authorized to submit this research" }, 403)
    }

    // Validate transition
    const validationError = validateStatusTransition(doc.status, "submit")
    if (validationError) {
      return c.json({ error: "Conflict", message: validationError }, 409)
    }

    // Update status
    const updated = await updateResearchStatus(humId, "review", seqNo, primaryTerm)
    if (!updated) {
      return c.json({ error: "Conflict", message: "Resource was modified by another request" }, 409)
    }

    // doc.status is validated to be "draft" by validateStatusTransition
    const previousStatus = doc.status as "draft" | "review" | "published"

    return c.json({
      humId,
      previousStatus,
      currentStatus: "review" as const,
      action: "submit" as const,
      timestamp: new Date().toISOString(),
    }, 200)
  } catch (error) {
    console.error("Error submitting research:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/{humId}/approve
researchRouter.openapi(approveRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  if (!authUser.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }
  try {
    const { humId } = c.req.param() as unknown as HumIdParams

    // Get research with sequence number for optimistic locking
    const result = await getResearchWithSeqNo(humId)
    if (!result) return c.json({ error: `Research ${humId} not found` }, 404)

    const { doc, seqNo, primaryTerm } = result

    // Deleted research is not accessible
    if (doc.status === "deleted") {
      return c.json({ error: `Research ${humId} not found` }, 404)
    }

    // Validate transition
    const validationError = validateStatusTransition(doc.status, "approve")
    if (validationError) {
      return c.json({ error: "Conflict", message: validationError }, 409)
    }

    // Update status
    const updated = await updateResearchStatus(humId, "published", seqNo, primaryTerm)
    if (!updated) {
      return c.json({ error: "Conflict", message: "Resource was modified by another request" }, 409)
    }

    // doc.status is validated to be "review" by validateStatusTransition
    const previousStatus = doc.status as "draft" | "review" | "published"

    return c.json({
      humId,
      previousStatus,
      currentStatus: "published" as const,
      action: "approve" as const,
      timestamp: new Date().toISOString(),
    }, 200)
  } catch (error) {
    console.error("Error approving research:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/{humId}/reject
researchRouter.openapi(rejectRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  if (!authUser.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }
  try {
    const { humId } = c.req.param() as unknown as HumIdParams

    // Get research with sequence number for optimistic locking
    const result = await getResearchWithSeqNo(humId)
    if (!result) return c.json({ error: `Research ${humId} not found` }, 404)

    const { doc, seqNo, primaryTerm } = result

    // Deleted research is not accessible
    if (doc.status === "deleted") {
      return c.json({ error: `Research ${humId} not found` }, 404)
    }

    // Validate transition
    const validationError = validateStatusTransition(doc.status, "reject")
    if (validationError) {
      return c.json({ error: "Conflict", message: validationError }, 409)
    }

    // Update status
    const updated = await updateResearchStatus(humId, "draft", seqNo, primaryTerm)
    if (!updated) {
      return c.json({ error: "Conflict", message: "Resource was modified by another request" }, 409)
    }

    // doc.status is validated to be "review" by validateStatusTransition
    const previousStatus = doc.status as "draft" | "review" | "published"

    return c.json({
      humId,
      previousStatus,
      currentStatus: "draft" as const,
      action: "reject" as const,
      timestamp: new Date().toISOString(),
    }, 200)
  } catch (error) {
    console.error("Error rejecting research:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})

// POST /research/{humId}/unpublish
researchRouter.openapi(unpublishRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return c.json({ error: "Unauthorized", message: "Authentication required" }, 401)
  }
  if (!authUser.isAdmin) {
    return c.json({ error: "Forbidden", message: "Admin access required" }, 403)
  }
  try {
    const { humId } = c.req.param() as unknown as HumIdParams

    // Get research with sequence number for optimistic locking
    const result = await getResearchWithSeqNo(humId)
    if (!result) return c.json({ error: `Research ${humId} not found` }, 404)

    const { doc, seqNo, primaryTerm } = result

    // Deleted research is not accessible
    if (doc.status === "deleted") {
      return c.json({ error: `Research ${humId} not found` }, 404)
    }

    // Validate transition
    const validationError = validateStatusTransition(doc.status, "unpublish")
    if (validationError) {
      return c.json({ error: "Conflict", message: validationError }, 409)
    }

    // Update status
    const updated = await updateResearchStatus(humId, "draft", seqNo, primaryTerm)
    if (!updated) {
      return c.json({ error: "Conflict", message: "Resource was modified by another request" }, 409)
    }

    // doc.status is validated to be "published" by validateStatusTransition
    const previousStatus = doc.status as "draft" | "review" | "published"

    return c.json({
      humId,
      previousStatus,
      currentStatus: "draft" as const,
      action: "unpublish" as const,
      timestamp: new Date().toISOString(),
    }, 200)
  } catch (error) {
    console.error("Error unpublishing research:", error)
    return c.json({ error: "Internal Server Error", message: String(error) }, 500)
  }
})
