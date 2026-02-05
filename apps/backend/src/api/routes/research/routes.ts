/**
 * Research Route Definitions
 *
 * OpenAPI route specifications for Research API endpoints.
 * Uses unified response schemas with data + meta structure.
 */
import { createRoute, z } from "@hono/zod-openapi"

import {
  ErrorSpec401,
  ErrorSpec403,
  ErrorSpec404,
  ErrorSpec409,
  ErrorSpec500,
} from "@/api/routes/errors"
import {
  CreateResearchRequestSchema,
  CreateVersionRequestSchema,
  EsDatasetDocSchema,
  EsResearchDetailSchema,
  EsResearchVersionDocSchema,
  ExperimentSchemaBase,
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  ResearchListingQuerySchema,
  ResearchResponseSchema,
  ResearchSummarySchema,
  UpdateResearchRequestSchema,
  UpdateUidsRequestSchema,
  VersionParamsSchema,
  VersionResponseSchema,
  createUnifiedListResponseSchema,
  createUnifiedSearchResponseSchema,
  createUnifiedSingleReadOnlyResponseSchema,
  createUnifiedSingleResponseSchema,
} from "@/api/types"
import { RESEARCH_STATUS } from "@/api/types/workflow"

// === Unified Response Schemas ===

// Research detail with optimistic locking
const ResearchDetailResponseSchema = createUnifiedSingleResponseSchema(
  EsResearchDetailSchema.omit({ _seq_no: true, _primary_term: true }),
)

// Research response with optimistic locking (for create/update)
const ResearchWithLockResponseSchema = createUnifiedSingleResponseSchema(ResearchResponseSchema)

// Research search/list response
const ResearchSearchUnifiedResponseSchema = createUnifiedSearchResponseSchema(ResearchSummarySchema)

// Research versions list response
const ResearchVersionsListResponseSchema = createUnifiedListResponseSchema(EsResearchVersionDocSchema)

// Version detail (read-only - historical versions)
const VersionDetailResponseSchema = createUnifiedSingleReadOnlyResponseSchema(VersionResponseSchema)

// Version create response (with lock)
const VersionCreateResponseSchema = createUnifiedSingleResponseSchema(VersionResponseSchema)

// Linked datasets list response
const LinkedDatasetsListResponseSchema = createUnifiedListResponseSchema(EsDatasetDocSchema)

// Dataset create response (with lock)
const DatasetCreateResponseSchema = createUnifiedSingleResponseSchema(EsDatasetDocSchema)

// Workflow response (with lock)
const WorkflowDataSchema = z.object({
  humId: z.string(),
  status: z.enum(RESEARCH_STATUS),
  dateModified: z.string(),
})
const WorkflowUnifiedResponseSchema = createUnifiedSingleResponseSchema(WorkflowDataSchema)

// UIDs response (with lock)
const UidsDataSchema = z.object({
  humId: z.string(),
  uids: z.array(z.string()),
})
const UidsUnifiedResponseSchema = createUnifiedSingleResponseSchema(UidsDataSchema)

// === CRUD Routes ===

export const listResearchRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Research"],
  summary: "List Research",
  description: `Get a paginated list of Research resources.

**Visibility by role:**
- **public**: Only published Research
- **authenticated**: Published + own draft/review Research (where user is in uids)
- **admin**: All Research including deleted

**Note:** For complex searches with filters, use POST /research/search instead.`,
  request: {
    query: ResearchListingQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchSearchUnifiedResponseSchema } },
      description: "List of research with optional facets",
    },
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

export const createResearchRoute = createRoute({
  method: "post",
  path: "/new",
  tags: ["Research"],
  summary: "Create Research",
  description: `Create a new Research with initial version (v1).

**Authorization:** Admin only

**Behavior:**
- Creates Research in draft status
- humId is auto-generated (hum0001, hum0002, ...) if not provided
- All fields are optional; defaults are used for missing fields
- Admin can assign uids (owner list) to grant edit access to other users`,
  request: {
    body: { content: { "application/json": { schema: CreateResearchRequestSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ResearchWithLockResponseSchema } },
      description: "Research created successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

export const getResearchRoute = createRoute({
  method: "get",
  path: "/{humId}",
  tags: ["Research"],
  summary: "Get Research Detail",
  description: `Get detailed information about a specific Research by its humId.

**Visibility:**
- public: Only published Research
- authenticated: Published + own Research (where user is in uids)
- admin: All Research

Returns the latest version by default. Use GET /research/{humId}/versions/{version} for a specific version.`,
  request: {
    params: HumIdParamsSchema,
    query: LangVersionQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchDetailResponseSchema } },
      description: "Research detail",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const updateResearchRoute = createRoute({
  method: "put",
  path: "/{humId}/update",
  tags: ["Research"],
  summary: "Update Research",
  description: `Update a Research entry (full replacement).

**Authorization:** Owner (user in uids) or admin

**Optimistic Locking:** Include _seq_no and _primary_term from GET response to detect concurrent edits. Returns 409 Conflict if the document has been modified since retrieval.

**Note:** humId, url, versionIds, latestVersion, datePublished cannot be modified.`,
  request: {
    params: HumIdParamsSchema,
    body: { content: { "application/json": { schema: UpdateResearchRequestSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchWithLockResponseSchema } },
      description: "Research updated successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

export const deleteResearchRoute = createRoute({
  method: "post",
  path: "/{humId}/delete",
  tags: ["Research"],
  summary: "Delete Research",
  description: `Delete a Research (logical deletion).

**Authorization:** Admin only

**Behavior:**
- Sets status to "deleted" (logical deletion to preserve humId uniqueness)
- All linked Datasets are physically deleted
- Deleted Research becomes inaccessible (returns 404)`,
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

// === Version Routes ===

export const listVersionsRoute = createRoute({
  method: "get",
  path: "/{humId}/versions",
  tags: ["Research Versions"],
  summary: "List Research Versions",
  description: `List all versions of a Research.

Returns version history including:
- Version number (v1, v2, ...)
- Version release date
- Release notes
- Dataset references for each version`,
  request: {
    params: HumIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: ResearchVersionsListResponseSchema } },
      description: "List of versions",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const getVersionRoute = createRoute({
  method: "get",
  path: "/{humId}/versions/{version}",
  tags: ["Research Versions"],
  summary: "Get Specific Version",
  description: `Get a specific version of a Research.

Version format: v1, v2, v3, etc.`,
  request: {
    params: VersionParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: VersionDetailResponseSchema } },
      description: "Version detail",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const createVersionRoute = createRoute({
  method: "post",
  path: "/{humId}/versions/new",
  tags: ["Research Versions"],
  summary: "Create New Version",
  description: `Create a new version of a Research.

**Authorization:** Owner or admin

**Behavior:**
- Creates a new draft version (v2, v3, ...)
- Datasets from the previous version are automatically copied
- Use PUT /dataset/{datasetId}/update or POST /research/{humId}/dataset/new to modify datasets
- Dataset versions are finalized when Research is approved`,
  request: {
    params: HumIdParamsSchema,
    body: { content: { "application/json": { schema: CreateVersionRequestSchema } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: VersionCreateResponseSchema } },
      description: "Version created successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

// === Dataset Routes ===

export const listLinkedDatasetsRoute = createRoute({
  method: "get",
  path: "/{humId}/dataset",
  tags: ["Research Datasets"],
  summary: "List Linked Datasets",
  description: `List all Datasets linked to this Research.

**Visibility:**
- public: Only if Research is published
- authenticated: Published + own Research
- admin: All Research`,
  request: {
    params: HumIdParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: LinkedDatasetsListResponseSchema } },
      description: "List of linked datasets",
    },
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const createDatasetForResearchRoute = createRoute({
  method: "post",
  path: "/{humId}/dataset/new",
  tags: ["Research Datasets"],
  summary: "Create Dataset for Research",
  description: `Create a new Dataset and link it to this Research.

**Authorization:** Owner or admin

**Precondition:** Parent Research must be in draft status

**Behavior:**
- datasetId is auto-generated as DRAFT-{humId}-{uuid} if not provided
- Dataset is automatically added to the draft Research's dataset list
- Dataset version is finalized when Research is approved`,
  request: {
    params: HumIdParamsSchema,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            datasetId: z.string().optional().describe("Dataset ID (auto-generated if not provided)"),
            releaseDate: z.string().optional().describe("Release date (ISO 8601 format)"),
            criteria: z.enum([
              "Controlled-access (Type I)",
              "Controlled-access (Type II)",
              "Unrestricted-access",
            ]).optional().describe("Data access criteria"),
            typeOfData: z.object({
              ja: z.string().nullable(),
              en: z.string().nullable(),
            }).optional().describe("Type of data in Japanese and English"),
            experiments: z.array(ExperimentSchemaBase).optional().describe("Experiment data tables"),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: DatasetCreateResponseSchema } },
      description: "Dataset created and linked successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

// === Workflow Routes ===

export const submitRoute = createRoute({
  method: "post",
  path: "/{humId}/submit",
  tags: ["Research Status"],
  summary: "Submit for Review",
  description: `Submit a draft Research for review.

**Authorization:** Owner or admin

**Transition:** draft → review

Returns 409 Conflict if Research is not in draft status.`,
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: WorkflowUnifiedResponseSchema } },
      description: "Status changed to review",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

export const approveRoute = createRoute({
  method: "post",
  path: "/{humId}/approve",
  tags: ["Research Status"],
  summary: "Approve Research",
  description: `Approve a Research in review status and publish it.

**Authorization:** Admin only

**Transition:** review → published

**Behavior:**
- Research becomes publicly visible
- Dataset versions are finalized at this point

Returns 409 Conflict if Research is not in review status.`,
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: WorkflowUnifiedResponseSchema } },
      description: "Status changed to published",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

export const rejectRoute = createRoute({
  method: "post",
  path: "/{humId}/reject",
  tags: ["Research Status"],
  summary: "Reject Research",
  description: `Reject a Research in review status and return it to draft.

**Authorization:** Admin only

**Transition:** review → draft

The owner can then make revisions and resubmit.

Returns 409 Conflict if Research is not in review status.`,
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: WorkflowUnifiedResponseSchema } },
      description: "Status changed to draft",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

export const unpublishRoute = createRoute({
  method: "post",
  path: "/{humId}/unpublish",
  tags: ["Research Status"],
  summary: "Unpublish Research",
  description: `Unpublish a published Research and return it to draft.

**Authorization:** Admin only

**Transition:** published → draft

**Note:** Use this to temporarily hide published content or to make corrections. To update a published Research with new content, prefer creating a new version instead.

Returns 409 Conflict if Research is not in published status.`,
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: WorkflowUnifiedResponseSchema } },
      description: "Status changed to draft",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

// === UIDs Route ===

export const updateUidsRoute = createRoute({
  method: "put",
  path: "/{humId}/uids",
  tags: ["Research"],
  summary: "Update Research UIDs",
  description: `Update the UIDs (owner list) of a Research.

**Authorization:** Admin only

**Behavior:**
- uids is an array of Keycloak sub (UUID) values
- Users in this list can edit the Research (treated as owners)
- Empty array means only admins can edit

**Optimistic Locking:** Include _seq_no and _primary_term from GET response.`,
  request: {
    params: HumIdParamsSchema,
    body: { content: { "application/json": { schema: UpdateUidsRequestSchema } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: UidsUnifiedResponseSchema } },
      description: "UIDs updated successfully",
    },
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})
