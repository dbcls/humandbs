/**
 * Research workflow type definitions
 *
 * This module provides:
 * - Research publication status
 * - Status transition actions
 * - Status transition rules
 */
import { z } from "zod";
export declare const ResearchStatusSchema: z.ZodEnum<{
    draft: "draft";
    review: "review";
    published: "published";
    deleted: "deleted";
}>;
export type EsResearchStatus = z.infer<typeof ResearchStatusSchema>;
/**
 * Research publication status
 * Note: "deleted" is included for type compatibility with ES documents,
 * but deleted resources are filtered out in API responses (return 404)
 */
export declare const RESEARCH_STATUS: readonly ["draft", "review", "published", "deleted"];
export type ResearchStatus = (typeof RESEARCH_STATUS)[number];
/**
 * Status transition actions
 */
export declare const STATUS_ACTIONS: readonly ["submit", "approve", "reject", "unpublish"];
export type StatusAction = (typeof STATUS_ACTIONS)[number];
/**
 * Valid status transitions
 */
export declare const StatusTransitions: Record<StatusAction, {
    from: ResearchStatus;
    to: ResearchStatus;
}>;
//# sourceMappingURL=workflow.d.ts.map