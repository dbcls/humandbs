/**
 * The catalog and vocabulary the development data is loaded against.
 *
 * v1 used the English display string as the identity of a molecular-data key,
 * so renaming a key broke every value stored under it. Here the identity is a
 * code and both labels are display only. `content-keys.json` is the v1 default
 * catalog carried over unchanged — it is hand-written knowledge, not something
 * derivable from the data.
 *
 * **A key's type is what makes it a facet**, so the typed keys are where the
 * facets come from ([facets.ts](facets.ts)). Everything else stays free text:
 * deciding what the rest ought to become means choosing how their prose is read
 * into terms and numbers, which is work for the real migration.
 */

import catalogDefaults from "./content-keys.json"
import { NUMBER_FACETS, RETYPED_CODES, slugify, takesMany, VOCABULARY_FACETS } from "./facets"

export { FACET_CATEGORIES, slugify } from "./facets"

export interface ContentKeySeed {
  code: string
  scope: "dataset" | "experiment"
  valueType: "text" | "single" | "accession" | "vocabulary" | "number"
  labelJa: string
  labelEn: string
  position: number
  vocabularySetCode: string | null
  facetCategoryCode: string | null
  multiple: boolean
  canonicalUnit: string | null
  inputUnits: string[] | null
  showOnPublicPage: boolean
}

export const ACCESS_CRITERIA_SET = "access-criteria"
export const ACCESS_CRITERIA_KEY = "access-criteria"
export const TYPE_OF_DATA_KEY = "type-of-data"
export const BASIC_INFO_CATEGORY = "basic-info"

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

/** What a key carries when nothing about it is a facet. */
function freeText(seed: {
  code: string
  scope: "dataset" | "experiment"
  labelJa: string
  labelEn: string
  position: number
  showOnPublicPage: boolean
}): ContentKeySeed {
  return {
    ...seed,
    valueType: "text",
    vocabularySetCode: null,
    facetCategoryCode: null,
    multiple: false,
    canonicalUnit: null,
    inputUnits: null,
  }
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
  const vocabularyByCode = new Map(VOCABULARY_FACETS.map((facet) => [facet.code, facet]))
  const numberByCode = new Map(NUMBER_FACETS.map((facet) => [facet.code, facet]))

  const keys: ContentKeySeed[] = [
    {
      ...freeText({
        code: ACCESS_CRITERIA_KEY,
        scope: "dataset",
        labelJa: "アクセス制限",
        labelEn: "Access type",
        position: 0,
        showOnPublicPage: true,
      }),
      valueType: "vocabulary",
      vocabularySetCode: ACCESS_CRITERIA_SET,
      facetCategoryCode: BASIC_INFO_CATEGORY,
    },
    freeText({
      code: TYPE_OF_DATA_KEY,
      scope: "dataset",
      labelJa: "データの種類",
      labelEn: "Type of data",
      position: 1,
      showOnPublicPage: true,
    }),
  ]

  defaults.forEach(([labelEn, labelJa], index) => {
    const code = slugify(labelEn)
    codeBySourceKey.set(labelEn, code)
    codeBySourceKey.set(labelJa, code)
    const base = freeText({
      code,
      scope: "experiment",
      labelJa,
      labelEn,
      position: index,
      // A key that was already on the public page stays on it: giving it a type
      // changes how the value is held, not whether a reader sees it.
      showOnPublicPage: true,
    })
    const vocabulary = vocabularyByCode.get(code)
    if (vocabulary !== undefined) {
      keys.push({
        ...base,
        valueType: "vocabulary",
        vocabularySetCode: vocabulary.setCode,
        facetCategoryCode: vocabulary.categoryCode,
        multiple: takesMany(vocabulary),
      })
      return
    }
    const number = numberByCode.get(code)
    if (number !== undefined) {
      keys.push({
        ...base,
        valueType: "number",
        facetCategoryCode: number.categoryCode,
        canonicalUnit: number.canonicalUnit,
        inputUnits: number.inputUnits,
      })
      return
    }
    keys.push(base)
  })

  // The keys v1 had no place for. They stand beside the free text they were
  // read out of rather than replacing it, and they are not shown: they exist to
  // be filtered by.
  const newKeys = [
    ...VOCABULARY_FACETS.filter((facet) => !RETYPED_CODES.has(facet.code)).map((facet) => ({
      ...freeText({
        code: facet.code,
        scope: "experiment" as const,
        labelJa: facet.labelJa,
        labelEn: facet.labelEn,
        position: 0,
        showOnPublicPage: false,
      }),
      valueType: "vocabulary" as const,
      vocabularySetCode: facet.setCode,
      facetCategoryCode: facet.categoryCode,
      multiple: takesMany(facet),
    })),
    ...NUMBER_FACETS.filter((facet) => !RETYPED_CODES.has(facet.code)).map((facet) => ({
      ...freeText({
        code: facet.code,
        scope: "experiment" as const,
        labelJa: facet.labelJa,
        labelEn: facet.labelEn,
        position: 0,
        showOnPublicPage: false,
      }),
      valueType: "number" as const,
      facetCategoryCode: facet.categoryCode,
      canonicalUnit: facet.canonicalUnit,
      inputUnits: facet.inputUnits,
    })),
  ]
  newKeys.forEach((key, index) => {
    keys.push({ ...key, position: defaults.length + index })
  })

  return { keys, codeBySourceKey }
}

export function accessCriteriaTermCode(criteria: string): string | null {
  return ACCESS_CRITERIA_TERMS.find((t) => t.labelEn === criteria)?.code ?? null
}
