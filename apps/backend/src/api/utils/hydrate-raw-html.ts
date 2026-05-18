/**
 * request shape (rawHtml 無し) を ES shape (rawHtml: null 注入) に変換する hydrator
 *
 * Create/Update 系 API は `rawHtml` を含まない request schema で入力を受け取る。
 * ES (crawler と共有) は TextValue.rawHtml を持つので、ES 書き込み直前にここで
 * rawHtml: null を注入して shape を揃える。crawler 由来データは rawHtml に string
 * を持ち、API 新規作成/編集は null になる。
 */
import type {
  BilingualTextValueRequest,
  ExperimentRequest,
  PersonRequest,
  ResearchProjectRequest,
  SummaryRequest,
  TextValueRequest,
} from "@/api/types/request-schemas"
import type { TextValue, BilingualTextValue } from "@/crawler/types/common"
import type {
  Experiment,
  Person,
  ResearchProject,
  Summary,
} from "@/crawler/types/structured"

export const hydrateTextValue = (v: TextValueRequest | null): TextValue | null => {
  if (v === null) return null
  return { text: v.text, rawHtml: null }
}

export const hydrateBilingualTextValue = (
  v: BilingualTextValueRequest,
): BilingualTextValue => ({
  ja: hydrateTextValue(v.ja),
  en: hydrateTextValue(v.en),
})

export const hydrateSummary = (v: SummaryRequest): Summary => ({
  aims: hydrateBilingualTextValue(v.aims),
  methods: hydrateBilingualTextValue(v.methods),
  targets: hydrateBilingualTextValue(v.targets),
  url: v.url,
})

export const hydratePerson = (v: PersonRequest): Person => ({
  name: hydrateBilingualTextValue(v.name),
  email: v.email,
  orcid: v.orcid,
  organization: v.organization
    ? {
      name: hydrateBilingualTextValue(v.organization.name),
      address: v.organization.address,
    }
    : v.organization,
  datasetIds: v.datasetIds,
  researchTitle: v.researchTitle,
  periodOfDataUse: v.periodOfDataUse,
})

export const hydrateResearchProject = (v: ResearchProjectRequest): ResearchProject => ({
  name: hydrateBilingualTextValue(v.name),
  url: v.url,
})

export const hydrateExperiment = (v: ExperimentRequest): Experiment => {
  const data: Record<string, BilingualTextValue | null> = {}
  for (const [key, value] of Object.entries(v.data)) {
    data[key] = value === null ? null : hydrateBilingualTextValue(value)
  }
  // searchable carries no TextValue, so no rawHtml hydration is needed —
  // forward it through verbatim. If the request omits searchable, leave it
  // undefined so ES stores the field as missing (consistent with crawler's
  // pre-LLM-extract state).
  return {
    header: hydrateBilingualTextValue(v.header),
    data,
    ...(v.searchable !== undefined ? { searchable: v.searchable } : {}),
  }
}
