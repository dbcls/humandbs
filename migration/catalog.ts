/**
 * The catalog and vocabulary the development data is loaded against.
 *
 * v1 used the English display string as the identity of a molecular-data key,
 * so renaming a key broke every value stored under it. Here the identity is a
 * code and both labels are display only. `content-keys.json` is the v1 default
 * catalog carried over unchanged — it is hand-written knowledge, not something
 * derivable from the data.
 *
 * Only the access criteria is typed as a vocabulary. Deciding the type of every
 * other key means choosing which of them become facets and how their free text
 * is parsed into terms and numbers, which is work for the real migration.
 */

import catalogDefaults from "./content-keys.json"

export interface ContentKeySeed {
  code: string
  scope: "dataset" | "experiment"
  valueType: "text" | "single" | "accession" | "vocabulary" | "number"
  labelJa: string
  labelEn: string
  position: number
  vocabularySetCode?: string
  facetCategoryCode?: string
  showOnPublicPage: boolean
}

export const ACCESS_CRITERIA_SET = "access-criteria"
export const ACCESS_CRITERIA_KEY = "access-criteria"
export const TYPE_OF_DATA_KEY = "type-of-data"
export const BASIC_INFO_CATEGORY = "basic-info"

export const FACET_CATEGORIES = [
  { code: BASIC_INFO_CATEGORY, labelJa: "基本情報", labelEn: "Basic information", position: 0 },
]

/**
 * The three values `criteria` takes across every published dataset. The
 * Japanese labels are the ones v1 shows; keeping them means the migrated data
 * renders in both languages without a translation pass.
 */
export const ACCESS_CRITERIA_TERMS = [
  { code: "unrestricted-access", labelEn: "Unrestricted-access", labelJa: "非制限公開" },
  { code: "controlled-access-type-1", labelEn: "Controlled-access (Type I)", labelJa: "制限公開（Type I）" },
  { code: "controlled-access-type-2", labelEn: "Controlled-access (Type II)", labelJa: "制限公開（Type II）" },
]

const defaults = catalogDefaults as [string, string][]

export function slugify(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "").toLowerCase()
}

/**
 * Every key the data may be stored under, in catalog order.
 *
 * A key string is looked up as an English label first and as a Japanese one
 * second, which is what folds the three keys the v1 crawler left in Japanese
 * onto the catalog entries they belong to. Both label sets are distinct across
 * the catalog, so the lookup is unambiguous.
 *
 * The mapping is deliberately closed: a key seen in the data that matches
 * neither label is an error rather than something to register on the fly.
 * Accepting unknown keys silently is how the v1 catalog drifted from the data.
 */
export function contentKeySeeds(): { keys: ContentKeySeed[], codeBySourceKey: Map<string, string> } {
  const codeBySourceKey = new Map<string, string>()
  const keys: ContentKeySeed[] = [
    {
      code: ACCESS_CRITERIA_KEY,
      scope: "dataset",
      valueType: "vocabulary",
      labelJa: "アクセス制限",
      labelEn: "Access type",
      position: 0,
      vocabularySetCode: ACCESS_CRITERIA_SET,
      facetCategoryCode: BASIC_INFO_CATEGORY,
      showOnPublicPage: true,
    },
    {
      code: TYPE_OF_DATA_KEY,
      scope: "dataset",
      valueType: "text",
      labelJa: "データの種類",
      labelEn: "Type of data",
      position: 1,
      showOnPublicPage: true,
    },
  ]

  defaults.forEach(([labelEn, labelJa], index) => {
    const code = slugify(labelEn)
    codeBySourceKey.set(labelEn, code)
    codeBySourceKey.set(labelJa, code)
    keys.push({
      code,
      scope: "experiment",
      valueType: "text",
      labelJa,
      labelEn,
      position: index,
      showOnPublicPage: true,
    })
  })

  return { keys, codeBySourceKey }
}

export function accessCriteriaTermCode(criteria: string): string | null {
  return ACCESS_CRITERIA_TERMS.find((t) => t.labelEn === criteria)?.code ?? null
}
