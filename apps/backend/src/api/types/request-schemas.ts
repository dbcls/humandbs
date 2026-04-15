/**
 * API request-only schemas
 *
 * TextValue 系フィールドから `rawHtml` を除外した派生スキーマ。Create/Update 系
 * リクエストはこれらを使う。`rawHtml` は crawler がパースした生 HTML を既存
 * レスポンス互換のため保持するフィールドで、クライアントから送る設計ではない。
 *
 * ES 書き込み時は `api/utils/hydrate-raw-html.ts` の hydrator が `rawHtml: null`
 * を注入して ES schema を満たす。
 *
 * Grant / Publication は BilingualTextSchema（rawHtml を持たない）で構成されているため
 * 派生は不要。
 */
import { z } from "zod"

import {
  BilingualTextSchema,
  BilingualUrlValueSchema,
  PeriodOfDataUseSchema,
  UrlValueSchema,
} from "../../crawler/types/common"

/** TextValue without rawHtml (request-only) */
export const TextValueRequestSchema = z.object({
  text: z.string(),
})
export type TextValueRequest = z.infer<typeof TextValueRequestSchema>

/** Bilingual TextValue without rawHtml (request-only) */
export const BilingualTextValueRequestSchema = z.object({
  ja: TextValueRequestSchema.nullable(),
  en: TextValueRequestSchema.nullable(),
})
export type BilingualTextValueRequest = z.infer<typeof BilingualTextValueRequestSchema>

/** Summary without rawHtml (request-only) */
export const SummaryRequestSchema = z.object({
  aims: BilingualTextValueRequestSchema,
  methods: BilingualTextValueRequestSchema,
  targets: BilingualTextValueRequestSchema,
  url: z.object({
    ja: z.array(UrlValueSchema),
    en: z.array(UrlValueSchema),
  }),
})
export type SummaryRequest = z.infer<typeof SummaryRequestSchema>

/** Person without rawHtml (request-only) */
export const PersonRequestSchema = z.object({
  name: BilingualTextValueRequestSchema,
  email: z.string().nullable().optional(),
  orcid: z.string().nullable().optional(),
  organization: z
    .object({
      name: BilingualTextValueRequestSchema,
      address: z
        .object({
          country: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  datasetIds: z.array(z.string()).optional(),
  researchTitle: BilingualTextSchema.optional(),
  periodOfDataUse: PeriodOfDataUseSchema.nullable().optional(),
})
export type PersonRequest = z.infer<typeof PersonRequestSchema>

/** ResearchProject without rawHtml (request-only) */
export const ResearchProjectRequestSchema = z.object({
  name: BilingualTextValueRequestSchema,
  url: BilingualUrlValueSchema.nullable().optional(),
})
export type ResearchProjectRequest = z.infer<typeof ResearchProjectRequestSchema>

/** Experiment without rawHtml (request-only). header/data を request 版に置換 */
export const ExperimentRequestSchema = z.object({
  header: BilingualTextValueRequestSchema,
  data: z.record(z.string(), BilingualTextValueRequestSchema.nullable()),
})
export type ExperimentRequest = z.infer<typeof ExperimentRequestSchema>
