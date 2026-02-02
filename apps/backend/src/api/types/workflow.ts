/**
 * Research workflow type definitions
 *
 * This module provides:
 * - Research publication status
 * - Status transition actions
 * - Status transition rules
 */
import { z } from "zod"

// Re-export from es/types for convenience
import { ResearchStatusSchema as EsResearchStatusSchema } from "@/es/types"

export const ResearchStatusSchema = EsResearchStatusSchema
export type EsResearchStatus = z.infer<typeof ResearchStatusSchema>

// === Research Status & Workflow ===

/**
 * Research publication status
 * Note: "deleted" is included for type compatibility with ES documents,
 * but deleted resources are filtered out in API responses (return 404)
 */
export const RESEARCH_STATUS = ["draft", "review", "published", "deleted"] as const
export type ResearchStatus = (typeof RESEARCH_STATUS)[number]

/**
 * Status transition actions
 */
export const STATUS_ACTIONS = ["submit", "approve", "reject", "unpublish"] as const
export type StatusAction = (typeof STATUS_ACTIONS)[number]

/**
 * Valid status transitions
 */
export const StatusTransitions: Record<StatusAction, { from: ResearchStatus; to: ResearchStatus }> = {
  submit: { from: "draft", to: "review" },
  approve: { from: "review", to: "published" },
  reject: { from: "review", to: "draft" },
  unpublish: { from: "published", to: "draft" },
}
