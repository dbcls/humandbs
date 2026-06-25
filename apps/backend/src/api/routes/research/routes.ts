/**
 * Research Route Definitions
 *
 * OpenAPI route specifications for Research API endpoints.
 * Uses response schemas with data + meta structure.
 */
import { createRoute } from "@hono/zod-openapi"

import { BATCH } from "@/api/constants"
import { SECURITY_OPTIONAL_AUTH, SECURITY_REQUIRES_AUTH } from "@/api/openapi/document"
import {
  exampleApproveResearchResponse,
  exampleCreateDatasetForResearchRequest,
  exampleCreateResearchRequest,
  exampleCreateVersionRequest,
  exampleDatasetCreateResponse,
  exampleLinkedDatasetsListResponse,
  exampleRejectResearchResponse,
  exampleResearchBatchResponse,
  exampleResearchDetailResponse,
  exampleResearchSearchResponse,
  exampleResearchVersionsListResponse,
  exampleResearchWithLockResponse,
  exampleSubmitResearchResponse,
  exampleUnpublishResearchResponse,
  exampleUpdateResearchRequest,
  exampleVersionCreateResponse,
  exampleVersionDetailResponse,
} from "@/api/openapi/examples"
import { ErrorSpec400, ErrorSpec401, ErrorSpec403, ErrorSpec404, ErrorSpec409, ErrorSpec500 } from "@/api/routes/errors"
import {
  CreateDatasetForResearchRequestSchema,
  CreateResearchRequestSchema,
  CreateVersionRequestSchema,
  DatasetCreateResponseSchema,
  HumIdParamsSchema,
  LangQuerySchema,
  LangVersionQuerySchema,
  LinkedDatasetsListResponseSchema,
  ResearchBatchQuerySchema,
  ResearchBatchResponseSchema,
  ResearchDetailResponseSchema,
  ResearchListingQuerySchema,
  ResearchSearchResponseSchema,
  ResearchVersionsListResponseSchema,
  ResearchWithLockResponseSchema,
  UpdateResearchRequestSchema,
  VersionCreateResponseSchema,
  VersionDetailResponseSchema,
  VersionParamsSchema,
  WorkflowResponseSchema,
} from "@/api/types"

// === CRUD Routes ===

export const listResearchRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Research"],
  operationId: "listResearch",
  summary: "List Research",
  security: SECURITY_OPTIONAL_AUTH,
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
      content: {
        "application/json": { schema: ResearchSearchResponseSchema, example: exampleResearchSearchResponse },
      },
      description: "List of research with optional facets",
    },
    400: ErrorSpec400,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

export const createResearchRoute = createRoute({
  method: "post",
  path: "/new",
  tags: ["Research"],
  operationId: "createResearch",
  summary: "Create Research",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  description: `Create a new Research with initial version (v1).

**Authorization:** Admin only

**Behavior:**
- Creates Research in draft status
- humId is required and must match /^hum\\d{4}$/ (e.g., hum0001)
- All fields except humId are optional; defaults are used for missing fields
- Admin can assign uids (owner list) to grant edit access to other users`,
  request: {
    body: {
      content: { "application/json": { schema: CreateResearchRequestSchema, example: exampleCreateResearchRequest } },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": { schema: ResearchWithLockResponseSchema, example: exampleResearchWithLockResponse },
      },
      description: "Research created successfully",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    500: ErrorSpec500,
  },
})

// Registered before getResearchRoute so the static "/batch" path takes
// precedence over the dynamic "/{humId}" segment.
export const batchGetResearchRoute = createRoute({
  method: "get",
  path: "/batch",
  tags: ["Research"],
  operationId: "batchGetResearch",
  summary: "Batch Get Research",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Retrieve multiple Research entries in one request by their humIds.

Pass a comma-separated \`ids\` query parameter (e.g. \`?ids=hum0001,hum0002\`).

**Behavior:**
- Returns the **latest version** of each Research (use GET /research/{humId}/versions/{version} for a specific version).
- **Partial success:** retrievable Research entries are returned in \`data\` (de-duplicated, in requested order). IDs that are absent or not accessible to the caller are listed in \`meta.batch.notFound\` (their existence is not distinguished from access denial).
- Per-ID authorization is applied (same visibility rules as GET /research/{humId}). Non-owners see the published view (status/uids/draftVersion are masked).
- At most ${BATCH.MAX_IDS} IDs per request; an empty \`ids\` is rejected with 400.`,
  request: {
    query: ResearchBatchQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: ResearchBatchResponseSchema, example: exampleResearchBatchResponse },
      },
      description: "Batch of research (partial success; missing/inaccessible IDs listed in meta.batch.notFound)",
    },
    400: ErrorSpec400,
    500: ErrorSpec500,
  },
})

export const getResearchRoute = createRoute({
  method: "get",
  path: "/{humId}",
  tags: ["Research"],
  operationId: "getResearch",
  summary: "Get Research Detail",
  security: SECURITY_OPTIONAL_AUTH,
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
      content: {
        "application/json": {
          schema: ResearchDetailResponseSchema,
          example: exampleResearchDetailResponse,
        },
      },
      description: "Research detail (authenticated: full fields with lock, public: read-only)",
    },
    400: ErrorSpec400,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const updateResearchRoute = createRoute({
  method: "put",
  path: "/{humId}/update",
  tags: ["Research"],
  operationId: "updateResearch",
  summary: "Update Research",
  security: SECURITY_REQUIRES_AUTH,
  description: `Update a Research entry (full replacement).

**Authorization:** Owner (user in uids) or admin

**Optimistic Locking:** Include _seq_no and _primary_term from GET response to detect concurrent edits. Returns 409 Conflict if the document has been modified since retrieval.

**Note:** humId, url, versionIds, latestVersion, datePublished cannot be modified.
releaseNote updates the current draft ResearchVersion's release note.`,
  request: {
    params: HumIdParamsSchema,
    body: {
      content: { "application/json": { schema: UpdateResearchRequestSchema, example: exampleUpdateResearchRequest } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: ResearchWithLockResponseSchema, example: exampleResearchWithLockResponse },
      },
      description: "Research updated successfully",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

export const patchResearchRoute = createRoute({
  method: "put",
  path: "/{humId}/patch",
  tags: ["Research"],
  operationId: "patchResearch",
  summary: "Patch Published Research",
  security: SECURITY_REQUIRES_AUTH,
  description: `Apply minor fixes to a published Research without creating a new version.

**Authorization:** Owner (user in uids) or admin

**Precondition:** Research must be in published status (409 otherwise)

**Behavior:**
- Directly modifies the published content (no draft/submit/approve cycle)
- Version stays the same (no version bump)
- dateModified is updated

**Optimistic Locking:** Include _seq_no and _primary_term from GET response.
releaseNote updates the current published ResearchVersion's release note.`,
  request: {
    params: HumIdParamsSchema,
    body: {
      content: { "application/json": { schema: UpdateResearchRequestSchema, example: exampleUpdateResearchRequest } },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: ResearchWithLockResponseSchema, example: exampleResearchWithLockResponse },
      },
      description: "Research patched successfully",
    },
    400: ErrorSpec400,
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
  operationId: "deleteResearch",
  summary: "Delete Research",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
  description: `Delete a Research (physical deletion).

**Authorization:** Admin only

**Behavior:**
- Physically removes the Research document, all linked ResearchVersions, and all linked Datasets
- The humId becomes available for reuse`,
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    204: { description: "Research deleted successfully" },
    400: ErrorSpec400,
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
  operationId: "listResearchVersions",
  summary: "List Research Versions",
  security: SECURITY_OPTIONAL_AUTH,
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
      content: {
        "application/json": { schema: ResearchVersionsListResponseSchema, example: exampleResearchVersionsListResponse },
      },
      description: "List of versions",
    },
    400: ErrorSpec400,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const getVersionRoute = createRoute({
  method: "get",
  path: "/{humId}/versions/{version}",
  tags: ["Research Versions"],
  operationId: "getResearchVersion",
  summary: "Get Specific Version",
  security: SECURITY_OPTIONAL_AUTH,
  description: `Get a specific version of a Research.

Version format: v1, v2, v3, etc.`,
  request: {
    params: VersionParamsSchema,
    query: LangQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: VersionDetailResponseSchema, example: exampleVersionDetailResponse } },
      description: "Version detail",
    },
    400: ErrorSpec400,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const createVersionRoute = createRoute({
  method: "post",
  path: "/{humId}/versions/new",
  tags: ["Research Versions"],
  operationId: "createResearchVersion",
  summary: "Create New Version",
  security: SECURITY_REQUIRES_AUTH,
  description: `Create a new version of a Research.

**Authorization:** Owner or admin

**Behavior:**
- Creates a new draft version (v2, v3, ...)
- Datasets from the previous version are automatically copied
- Use PUT /dataset/{datasetId}/update or POST /research/{humId}/dataset/new to modify datasets
- Dataset versions are finalized when Research is approved`,
  request: {
    params: HumIdParamsSchema,
    body: {
      content: { "application/json": { schema: CreateVersionRequestSchema, example: exampleCreateVersionRequest } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: VersionCreateResponseSchema, example: exampleVersionCreateResponse } },
      description: "Version created successfully",
    },
    400: ErrorSpec400,
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
  operationId: "listResearchDatasets",
  summary: "List Linked Datasets",
  security: SECURITY_OPTIONAL_AUTH,
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
      content: {
        "application/json": { schema: LinkedDatasetsListResponseSchema, example: exampleLinkedDatasetsListResponse },
      },
      description: "List of linked datasets",
    },
    400: ErrorSpec400,
    404: ErrorSpec404,
    500: ErrorSpec500,
  },
})

export const createDatasetForResearchRoute = createRoute({
  method: "post",
  path: "/{humId}/dataset/new",
  tags: ["Research Datasets"],
  operationId: "createResearchDataset",
  summary: "Create Dataset for Research",
  security: SECURITY_REQUIRES_AUTH,
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
        "application/json": { schema: CreateDatasetForResearchRequestSchema, example: exampleCreateDatasetForResearchRequest },
      },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: DatasetCreateResponseSchema, example: exampleDatasetCreateResponse } },
      description: "Dataset created and linked successfully",
    },
    400: ErrorSpec400,
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
  operationId: "submitResearch",
  summary: "Submit for Review",
  security: SECURITY_REQUIRES_AUTH,
  description: `Submit a draft Research for review.

**Authorization:** Owner or admin

**Transition:** draft → review

Returns 409 Conflict if Research is not in draft status.`,
  request: {
    params: HumIdParamsSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: WorkflowResponseSchema, example: exampleSubmitResearchResponse },
      },
      description: "Status changed to review",
    },
    400: ErrorSpec400,
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
  operationId: "approveResearch",
  summary: "Approve Research",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
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
      content: {
        "application/json": { schema: WorkflowResponseSchema, example: exampleApproveResearchResponse },
      },
      description: "Status changed to published",
    },
    400: ErrorSpec400,
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
  operationId: "rejectResearch",
  summary: "Reject Research",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
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
      content: {
        "application/json": { schema: WorkflowResponseSchema, example: exampleRejectResearchResponse },
      },
      description: "Status changed to draft",
    },
    400: ErrorSpec400,
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
  operationId: "unpublishResearch",
  summary: "Unpublish Research",
  security: SECURITY_REQUIRES_AUTH,
  "x-admin-only": true,
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
      content: {
        "application/json": { schema: WorkflowResponseSchema, example: exampleUnpublishResearchResponse },
      },
      description: "Status changed to draft",
    },
    400: ErrorSpec400,
    401: ErrorSpec401,
    403: ErrorSpec403,
    404: ErrorSpec404,
    409: ErrorSpec409,
    500: ErrorSpec500,
  },
})

