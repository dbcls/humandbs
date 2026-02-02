/**
 * Research API Routes
 *
 * Handles CRUD operations, versioning, status transitions, and dataset linking
 * for Research resources.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"

import { PAGINATION } from "@/api/constants"
import {
  canAccessResearchDoc,
  createDataset,
  createResearch,
  createResearchVersion,
  deleteResearch,
  getResearchDetail,
  getResearchDoc,
  getResearchVersion,
  listResearchVersionsSorted,
  searchResearches,
  updateResearch,
  updateResearchStatus,
  updateResearchUids,
  validateStatusTransition,
} from "@/api/es-client"
import { optionalAuth } from "@/api/middleware/auth"
import { loadResearchAndAuthorize } from "@/api/middleware/resource-auth"
import {
  ErrorSpec401,
  ErrorSpec403,
  ErrorSpec404,
  ErrorSpec409,
  ErrorSpec500,
  conflictResponse,
  forbiddenResponse,
  notFoundResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@/api/routes/errors"
import {
  CreateResearchRequestSchema,
  CreateVersionRequestSchema,
  EsDatasetDocSchema,
  EsResearchDetailSchema,
  ExperimentSchemaBase,
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchListingQuerySchema,
  ResearchResponseSchema,
  ResearchSearchResponseSchema,
  ResearchVersionsResponseSchema,
  UpdateResearchRequestSchema,
  WorkflowResponseSchema,
  UpdateUidsRequestSchema,
  UpdateUidsResponseSchema,
  VersionParamsSchema,
  VersionResponseSchema,
} from "@/api/types"
import type { HumIdParams, LangVersionQuery, ResearchListingQuery, UpdateUidsRequest, VersionParams } from "@/api/types"
import { maybeStripRawHtml } from "@/api/utils/strip-raw-html"

// === Route Definitions ===

const listResearchRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Research"],
  summary: "List Research",
  description: "Get a paginated list of research. Public users see only published research. For complex searches with filters, use POST /research/search instead.",
  request: {
    query: ResearchListingQuerySchema,
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
    409: ErrorSpec409,
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
    409: ErrorSpec409,
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
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

const listLinkedDatasetsRoute = createRoute({
  method: "get",
  path: "/{humId}/dataset",
  tags: ["Research Datasets"],
  summary: "List Linked Datasets",
  description: "List all datasets linked to this research with pagination",
  request: {
    params: HumIdParamsSchema,
    query: z.object({
      lang: z.enum(["ja", "en"]).default("ja"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(EsDatasetDocSchema),
            pagination: z.object({
              page: z.number(),
              limit: z.number(),
              total: z.number(),
              totalPages: z.number(),
              hasNext: z.boolean(),
              hasPrev: z.boolean(),
            }),
          }),
        },
      },
      description: "List of linked datasets with pagination",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

const createDatasetForResearchRoute = createRoute({
  method: "post",
  path: "/{humId}/dataset/new",
  tags: ["Research Datasets"],
  summary: "Create Dataset for Research",
  description: "Create a new dataset and link it to this research. Requires owner or admin. Parent Research must be in draft status.",
  request: {
    params: HumIdParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            datasetId: z.string().optional(),
            releaseDate: z.string().optional(),
            criteria: z.enum([
              "Controlled-access (Type I)",
              "Controlled-access (Type II)",
              "Unrestricted-access",
            ]).optional(),
            typeOfData: z.object({
              ja: z.string().nullable(),
              en: z.string().nullable(),
            }).optional(),
            experiments: z.array(ExperimentSchemaBase).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: EsDatasetDocSchema } },
      description: "Dataset created and linked successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
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
      content: { "application/json": { schema: WorkflowResponseSchema } },
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
      content: { "application/json": { schema: WorkflowResponseSchema } },
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
      content: { "application/json": { schema: WorkflowResponseSchema } },
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
      content: { "application/json": { schema: WorkflowResponseSchema } },
      description: "Status changed to draft",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

const updateUidsRoute = createRoute({
  method: "put",
  path: "/{humId}/uids",
  tags: ["Research"],
  summary: "Update Research UIDs",
  description: "Update the UIDs (owner list) of a research. Requires admin.",
  request: {
    params: HumIdParamsSchema,
    body: { content: { "application/json": { schema: UpdateUidsRequestSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: UpdateUidsResponseSchema } },
      description: "UIDs updated successfully",
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

// Apply resource authorization middleware to routes that modify research
// These routes require authentication and ownership check
researchRouter.use("/:humId/update", loadResearchAndAuthorize({ requireOwnership: true }))
researchRouter.use("/:humId/delete", loadResearchAndAuthorize({ adminOnly: true }))
researchRouter.use("/:humId/versions/new", loadResearchAndAuthorize({ requireOwnership: true }))
researchRouter.use("/:humId/submit", loadResearchAndAuthorize({ requireOwnership: true }))
researchRouter.use("/:humId/approve", loadResearchAndAuthorize({ adminOnly: true }))
researchRouter.use("/:humId/reject", loadResearchAndAuthorize({ adminOnly: true }))
researchRouter.use("/:humId/unpublish", loadResearchAndAuthorize({ adminOnly: true }))
researchRouter.use("/:humId/uids", loadResearchAndAuthorize({ adminOnly: true }))

// GET /research
researchRouter.openapi(listResearchRoute, async (c) => {
  try {
    const query = c.req.query() as unknown as ResearchListingQuery
    const authUser = c.get("authUser")
    // Convert listing query to search query format
    const researches = await searchResearches({
      page: query.page,
      limit: query.limit,
      lang: query.lang,
      sort: query.sort,
      order: query.order,
      status: query.status,
      includeFacets: query.includeFacets,
      includeRawHtml: query.includeRawHtml,
    }, authUser)
    return c.json(maybeStripRawHtml(researches, query.includeRawHtml ?? false), 200)
  } catch (error) {
    console.error("Error fetching research list:", error)
    return serverErrorResponse(c, error)
  }
})

// POST /research/new (admin only - admin creates research and assigns researcherUids)
researchRouter.openapi(createResearchRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return unauthorizedResponse(c)
  }
  if (!authUser.isAdmin) {
    return forbiddenResponse(c, "Admin access required")
  }
  try {
    const body = await c.req.json()

    const result = await createResearch({
      humId: body.humId,
      title: body.title,
      summary: body.summary,
      dataProvider: body.dataProvider,
      researchProject: body.researchProject,
      grant: body.grant,
      relatedPublication: body.relatedPublication,
      uids: body.uids,
      initialReleaseNote: body.initialReleaseNote,
    })

    // Return the created research with status
    // Note: createResearch always returns status="draft", but TypeScript needs explicit cast
    const { status, ...rest } = result.research
    return c.json({
      ...rest,
      status: status as "draft" | "review" | "published",
      datasets: [],
    }, 201)
  } catch (error) {
    console.error("Error creating research:", error)
    return serverErrorResponse(c, error)
  }
})

// GET /research/{humId}
researchRouter.openapi(getResearchRoute, async (c) => {
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const query = c.req.query() as unknown as LangVersionQuery
    const authUser = c.get("authUser")
    const detail = await getResearchDetail(humId, { version: query.version ?? undefined }, authUser)
    if (!detail) return notFoundResponse(c, `Research with humId ${humId} not found`)
    return c.json(maybeStripRawHtml(detail, query.includeRawHtml ?? false), 200)
  } catch (error) {
    console.error("Error fetching research detail:", error)
    return serverErrorResponse(c, error)
  }
})

// PUT /research/{humId}/update
// Middleware: loadResearchAndAuthorize({ requireOwnership: true })
researchRouter.openapi(updateResearchRoute, async (c) => {
  try {
    // Research is preloaded by middleware with auth/ownership checks
    const research = c.get("research")!
    const { humId, seqNo, primaryTerm } = research

    const body = await c.req.json()

    const updated = await updateResearch(humId, {
      title: body.title,
      summary: body.summary,
      dataProvider: body.dataProvider,
      researchProject: body.researchProject,
      grant: body.grant,
      relatedPublication: body.relatedPublication,
      controlledAccessUser: body.controlledAccessUser,
    }, seqNo, primaryTerm)

    if (!updated) {
      return conflictResponse(c)
    }

    // Note: updateResearch returns docs that should not have status="deleted", but TypeScript needs explicit cast
    const { status: updatedStatus, ...restUpdated } = updated
    return c.json({
      ...restUpdated,
      status: updatedStatus as "draft" | "review" | "published",
      datasets: [],
    }, 200)
  } catch (error) {
    console.error("Error updating research:", error)
    return serverErrorResponse(c, error)
  }
})

// POST /research/{humId}/delete
// Middleware: loadResearchAndAuthorize({ adminOnly: true })
researchRouter.openapi(deleteResearchRoute, async (c) => {
  try {
    // Research is preloaded by middleware with admin check
    const research = c.get("research")!
    const { humId, seqNo, primaryTerm } = research

    const deleted = await deleteResearch(humId, seqNo, primaryTerm)
    if (!deleted) {
      return conflictResponse(c)
    }

    return c.body(null, 204)
  } catch (error) {
    console.error("Error deleting research:", error)
    return serverErrorResponse(c, error)
  }
})

// GET /research/{humId}/versions
researchRouter.openapi(listVersionsRoute, async (c) => {
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const authUser = c.get("authUser")
    const versions = await listResearchVersionsSorted(humId, authUser)
    if (versions === null) return notFoundResponse(c, `Research with humId ${humId} not found`)
    return c.json({ data: versions }, 200)
  } catch (error) {
    console.error("Error fetching research versions:", error)
    return serverErrorResponse(c, error)
  }
})

// GET /research/{humId}/versions/{version}
researchRouter.openapi(getVersionRoute, async (c) => {
  try {
    const { humId, version } = c.req.param() as unknown as VersionParams
    const authUser = c.get("authUser")

    // Use getResearchDetail with specific version
    const detail = await getResearchDetail(humId, { version }, authUser)
    if (!detail) return notFoundResponse(c, `Research version ${humId}/${version} not found`)

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
    return serverErrorResponse(c, error)
  }
})

// POST /research/{humId}/versions/new
// Middleware: loadResearchAndAuthorize({ requireOwnership: true })
researchRouter.openapi(createVersionRoute, async (c) => {
  try {
    // Research is preloaded by middleware with auth/ownership checks
    const research = c.get("research")!
    const { humId, seqNo, primaryTerm } = research

    const body = await c.req.json()

    const newVersion = await createResearchVersion(
      humId,
      body.releaseNote ?? { ja: null, en: null },
      undefined, // datasets are auto-copied from previous version
      seqNo,
      primaryTerm,
    )

    if (!newVersion) {
      return conflictResponse(c)
    }

    return c.json({
      humId: newVersion.humId,
      humVersionId: newVersion.humVersionId,
      version: newVersion.version,
      versionReleaseDate: newVersion.versionReleaseDate,
      releaseNote: newVersion.releaseNote,
      datasets: [], // Empty initially, datasets can be linked later
    }, 201)
  } catch (error) {
    console.error("Error creating version:", error)
    return serverErrorResponse(c, error)
  }
})

// GET /research/{humId}/dataset
researchRouter.openapi(listLinkedDatasetsRoute, async (c) => {
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const query = c.req.query()
    const page = Number(query.page) || 1
    const limit = Number(query.limit) || PAGINATION.DEFAULT_LIMIT
    const authUser = c.get("authUser")

    const detail = await getResearchDetail(humId, {}, authUser)
    if (!detail) return notFoundResponse(c, `Research with humId ${humId} not found`)

    const datasets = detail.datasets ?? []
    const total = datasets.length
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit)
    const start = (page - 1) * limit
    const paginatedData = datasets.slice(start, start + limit)

    return c.json({
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    }, 200)
  } catch (error) {
    console.error("Error fetching linked datasets:", error)
    return serverErrorResponse(c, error)
  }
})

// POST /research/{humId}/dataset/new
researchRouter.openapi(createDatasetForResearchRoute, async (c) => {
  const authUser = c.get("authUser")
  if (!authUser) {
    return unauthorizedResponse(c)
  }
  try {
    const { humId } = c.req.param() as unknown as HumIdParams
    const body = await c.req.json()

    // Get research to check permissions and status
    const research = await getResearchDoc(humId)
    if (!research) {
      return notFoundResponse(c, `Research ${humId} not found`)
    }

    // Deleted research is not accessible
    if (research.status === "deleted") {
      return notFoundResponse(c, `Research ${humId} not found`)
    }

    // Check permission (owner or admin can create datasets)
    if (!canAccessResearchDoc(authUser, research)) {
      return forbiddenResponse(c, "Not authorized to create datasets for this research")
    }

    // Check that Research is in draft status
    if (research.status !== "draft") {
      return forbiddenResponse(c, "Cannot create dataset: parent Research is not in draft status")
    }

    // Get latest ResearchVersion to determine humVersionId
    const latestVersion = await getResearchVersion(humId, {})
    if (!latestVersion) {
      return serverErrorResponse(c, `Research ${humId} has no version`)
    }

    // Create dataset with defaults for optional fields
    const dataset = await createDataset({
      datasetId: body.datasetId,
      humId,
      humVersionId: latestVersion.humVersionId,
      releaseDate: body.releaseDate ?? new Date().toISOString().split("T")[0],
      criteria: body.criteria ?? "Controlled-access (Type I)",
      typeOfData: body.typeOfData ?? { ja: null, en: null },
      experiments: body.experiments ?? [],
    })

    return c.json(dataset, 201)
  } catch (error) {
    console.error("Error creating dataset for research:", error)
    return serverErrorResponse(c, error)
  }
})

// POST /research/{humId}/submit
// Middleware: loadResearchAndAuthorize({ requireOwnership: true })
researchRouter.openapi(submitRoute, async (c) => {
  try {
    // Research is preloaded by middleware with auth/ownership checks
    const research = c.get("research")!
    const { humId, seqNo, primaryTerm, status } = research

    // Validate transition
    const validationError = validateStatusTransition(status, "submit")
    if (validationError) {
      return conflictResponse(c, validationError)
    }

    // Update status
    const updated = await updateResearchStatus(humId, "review", seqNo, primaryTerm)
    if (!updated) {
      return conflictResponse(c)
    }

    return c.json({
      humId,
      status: "review" as const,
      dateModified: updated.dateModified,
      _seq_no: updated.seqNo,
      _primary_term: updated.primaryTerm,
    }, 200)
  } catch (error) {
    console.error("Error submitting research:", error)
    return serverErrorResponse(c, error)
  }
})

// POST /research/{humId}/approve
// Middleware: loadResearchAndAuthorize({ adminOnly: true })
researchRouter.openapi(approveRoute, async (c) => {
  try {
    // Research is preloaded by middleware with admin check
    const research = c.get("research")!
    const { humId, seqNo, primaryTerm, status } = research

    // Validate transition
    const validationError = validateStatusTransition(status, "approve")
    if (validationError) {
      return conflictResponse(c, validationError)
    }

    // Update status
    const updated = await updateResearchStatus(humId, "published", seqNo, primaryTerm)
    if (!updated) {
      return conflictResponse(c)
    }

    return c.json({
      humId,
      status: "published" as const,
      dateModified: updated.dateModified,
      _seq_no: updated.seqNo,
      _primary_term: updated.primaryTerm,
    }, 200)
  } catch (error) {
    console.error("Error approving research:", error)
    return serverErrorResponse(c, error)
  }
})

// POST /research/{humId}/reject
// Middleware: loadResearchAndAuthorize({ adminOnly: true })
researchRouter.openapi(rejectRoute, async (c) => {
  try {
    // Research is preloaded by middleware with admin check
    const research = c.get("research")!
    const { humId, seqNo, primaryTerm, status } = research

    // Validate transition
    const validationError = validateStatusTransition(status, "reject")
    if (validationError) {
      return conflictResponse(c, validationError)
    }

    // Update status
    const updated = await updateResearchStatus(humId, "draft", seqNo, primaryTerm)
    if (!updated) {
      return conflictResponse(c)
    }

    return c.json({
      humId,
      status: "draft" as const,
      dateModified: updated.dateModified,
      _seq_no: updated.seqNo,
      _primary_term: updated.primaryTerm,
    }, 200)
  } catch (error) {
    console.error("Error rejecting research:", error)
    return serverErrorResponse(c, error)
  }
})

// POST /research/{humId}/unpublish
// Middleware: loadResearchAndAuthorize({ adminOnly: true })
researchRouter.openapi(unpublishRoute, async (c) => {
  try {
    // Research is preloaded by middleware with admin check
    const research = c.get("research")!
    const { humId, seqNo, primaryTerm, status } = research

    // Validate transition
    const validationError = validateStatusTransition(status, "unpublish")
    if (validationError) {
      return conflictResponse(c, validationError)
    }

    // Update status
    const updated = await updateResearchStatus(humId, "draft", seqNo, primaryTerm)
    if (!updated) {
      return conflictResponse(c)
    }

    return c.json({
      humId,
      status: "draft" as const,
      dateModified: updated.dateModified,
      _seq_no: updated.seqNo,
      _primary_term: updated.primaryTerm,
    }, 200)
  } catch (error) {
    console.error("Error unpublishing research:", error)
    return serverErrorResponse(c, error)
  }
})

// PUT /research/{humId}/uids
// Middleware: loadResearchAndAuthorize({ adminOnly: true })
researchRouter.openapi(updateUidsRoute, async (c) => {
  try {
    // Research is preloaded by middleware with admin check
    const research = c.get("research")!
    const { humId } = research

    const body = await c.req.json() as UpdateUidsRequest

    // Use optimistic lock values from request body
    const updatedUids = await updateResearchUids(humId, body.uids, body._seq_no, body._primary_term)
    if (!updatedUids) {
      return conflictResponse(c)
    }

    return c.json({
      humId,
      uids: updatedUids,
    }, 200)
  } catch (error) {
    console.error("Error updating research uids:", error)
    return serverErrorResponse(c, error)
  }
})
