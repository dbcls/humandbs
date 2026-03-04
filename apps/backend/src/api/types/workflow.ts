/**
 * Research workflow type definitions
 *
 * This module provides:
 * - Research publication status (derived from es/types)
 * - Status transition actions
 * - Status transition rules
 */
import { z } from "zod"

import { ResearchStatusSchema } from "../../es/types"

export { ResearchStatusSchema }
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>

// Zod schema から導出（手動同期不要）
export const RESEARCH_STATUS = ResearchStatusSchema.options

// === Status Transition ===

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
