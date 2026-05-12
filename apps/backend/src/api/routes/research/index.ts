/**
 * Research API Router
 *
 * Aggregates all research-related route handlers.
 */
import { createOpenAPIHono } from "@/api/helpers/openapi-hono"
import { optionalAuth } from "@/api/middleware/auth"
import { loadResearchAndAuthorize } from "@/api/middleware/resource-auth"

import { registerCrudHandlers } from "./crud"
import { registerDatasetHandlers } from "./datasets"
import { registerVersionHandlers } from "./versions"
import { registerWorkflowHandlers } from "./workflow"

// Create router
export const researchRouter = createOpenAPIHono()

// Apply authentication middleware
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

// Register handlers
registerCrudHandlers(researchRouter)
registerVersionHandlers(researchRouter)
registerWorkflowHandlers(researchRouter)
registerDatasetHandlers(researchRouter)
