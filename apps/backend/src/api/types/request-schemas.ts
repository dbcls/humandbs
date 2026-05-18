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
import "@hono/zod-openapi"
import { z } from "zod"

import {
  BilingualTextSchema,
  BilingualUrlValueSchema,
  PeriodOfDataUseSchema,
  UrlValueSchema,
} from "../../crawler/types/common"
import { SearchableExperimentFieldsSchema } from "../../crawler/types/structured"

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

/** Experiment without rawHtml (request-only). header/data を request 版に置換。
 *
 * `searchable` は元々 LLM 抽出 step (crawler) で生成されるサーバー側フィールド
 * だが、admin が template 経由で取得した雛形を編集して POST/PUT する用途のため
 * リクエストでも optional で受け付ける。指定された場合はそのまま ES に書き込み、
 * 未指定なら ES 上は undefined のまま (後段の LLM 抽出 step が走れば上書きされる)。
 */
export const ExperimentRequestSchema = z.object({
  header: BilingualTextValueRequestSchema,
  data: z.record(z.string(), BilingualTextValueRequestSchema.nullable()),
  searchable: SearchableExperimentFieldsSchema.optional(),
})
export type ExperimentRequest = z.infer<typeof ExperimentRequestSchema>
