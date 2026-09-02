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
import {
  MERGED_SOURCES,
  NEW_KEY_ORDER,
  NUMBER_FACETS,
  RETYPED_CODES,
  SHOWN_NEW_KEYS,
  slugify,
  takesMany,
  TEXT_NUMBERS,
  VOCABULARY_FACETS,
} from "./facets"

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
 * **The spelling a key is looked up by and the label it is shown under are two
 * things.** The lookup is the dump's own wording and cannot move; the label is
 * what a reader sees in the refinement panel and on the dataset page, and for
 * every key that is a facet it comes from [facets.ts](facets.ts). v1 wrote
 * `Reference Sequence` for the genome build and `試薬` for a library kit, and
 * carrying those through would put v1's mistakes on a v2 screen.
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

  const textNumberBySource = new Map(TEXT_NUMBERS.map((one) => [one.source, one]))

  defaults.forEach(([labelEn, labelJa], index) => {
    // A cell that is the same key under another name registers its spelling and
    // makes no key: its numbers join the one it names (`facets.ts`).
    const merged = MERGED_SOURCES.get(labelEn)
    if (merged !== undefined) {
      codeBySourceKey.set(labelEn, merged)
      codeBySourceKey.set(labelJa, merged)
      return
    }
    const code = slugify(labelEn)
    codeBySourceKey.set(labelEn, code)
    codeBySourceKey.set(labelJa, code)

    // A cell that holds numbers keeps its place and changes type.
    const asNumbers = textNumberBySource.get(labelEn)
    if (asNumbers !== undefined) {
      keys.push({
        ...freeText({
          code,
          scope: "experiment",
          labelJa: asNumbers.labelJa,
          labelEn: asNumbers.labelEn,
          position: index,
          showOnPublicPage: true,
        }),
        valueType: "number",
        facetCategoryCode: asNumbers.categoryCode,
        canonicalUnit: asNumbers.canonicalUnit,
        inputUnits: asNumbers.inputUnits,
      })
      return
    }
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
        labelJa: vocabulary.labelJa,
        labelEn: vocabulary.labelEn,
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
        labelJa: number.labelJa,
        labelEn: number.labelEn,
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
  // read out of rather than replacing it, and they are not shown — they exist
  // to be filtered by. The disease is the exception (`SHOWN_NEW_KEYS`).
  const newKeys = [
    ...VOCABULARY_FACETS.filter((facet) => !RETYPED_CODES.has(facet.code)).map((facet) => ({
      ...freeText({
        code: facet.code,
        scope: "experiment" as const,
        labelJa: facet.labelJa,
        labelEn: facet.labelEn,
        position: 0,
        showOnPublicPage: SHOWN_NEW_KEYS.has(facet.code),
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
  // In the order the panel reads them, which the arrays they were declared in
  // do not give (`facets.ts` の `NEW_KEY_ORDER`).
  const unplaced = newKeys.find((key) => !NEW_KEY_ORDER.includes(key.code))
  if (unplaced !== undefined) {
    throw new Error(`the new key ${unplaced.code} has no place in NEW_KEY_ORDER`)
  }
  newKeys
    .toSorted((a, b) => NEW_KEY_ORDER.indexOf(a.code) - NEW_KEY_ORDER.indexOf(b.code))
    .forEach((key, index) => {
      keys.push({ ...key, position: defaults.length + index })
    })

  return { keys, codeBySourceKey }
}

export function accessCriteriaTermCode(criteria: string): string | null {
  return ACCESS_CRITERIA_TERMS.find((t) => t.labelEn === criteria)?.code ?? null
}
