/**
 * Path parameter schemas for Research / Dataset / JGA Shinsei routes.
 */
import "@hono/zod-openapi"
import { z } from "zod"

import { VersionStringSchema } from "./common"

export const HumIdParamsSchema = z.object({
  humId: z
    .string()
    .describe(
      "Research identifier (e.g., 'hum0001'). Unique across all Research resources.",
    ),
})
export type HumIdParams = z.infer<typeof HumIdParamsSchema>

export const DatasetIdParamsSchema = z.object({
  datasetId: z
    .string()
    .describe(
      "Dataset identifier (e.g., 'JGAD000001'). Unique across all Dataset resources.",
    ),
})
export type DatasetIdParams = z.infer<typeof DatasetIdParamsSchema>

export const VersionParamsSchema = z.object({
  humId: z.string().describe("Research identifier (e.g., 'hum0001')"),
  version: VersionStringSchema
    .describe("Version number in format v1, v2, v3, etc. (e.g., 'v1', 'v2')"),
})
export type VersionParams = z.infer<typeof VersionParamsSchema>

export const DatasetVersionParamsSchema = z.object({
  datasetId: z.string().describe("Dataset identifier (e.g., 'JGAD000001')"),
  version: VersionStringSchema
    .describe("Version number in format v1, v2, v3, etc. (e.g., 'v1', 'v2')"),
})
export type DatasetVersionParams = z.infer<typeof DatasetVersionParamsSchema>

export const JduIdParamsSchema = z.object({
  jduId: z.string()
    .regex(/^J-DU\d+$/)
    .describe("DU application ID (e.g., 'J-DU006498')"),
})
export type JduIdParams = z.infer<typeof JduIdParamsSchema>

export const JdsApplIdParamsSchema = z.object({
  jdsApplId: z.string()
    .regex(/^J-DS\d+-\d{3}$/)
    .describe("DS application version ID (e.g., 'J-DS002494-001')"),
})
export type JdsApplIdParams = z.infer<typeof JdsApplIdParamsSchema>

export const JduApplIdParamsSchema = z.object({
  jduApplId: z.string()
    .regex(/^J-DU\d+-\d{3}$/)
    .describe("DU application version ID (e.g., 'J-DU006498-001')"),
})
export type JduApplIdParams = z.infer<typeof JduApplIdParamsSchema>
