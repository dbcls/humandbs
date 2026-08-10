/**
 * The typed catalog keys the development data is loaded against.
 *
 * v1 kept a derived layer beside the free text — twenty-six fields a language
 * model had read out of it — and drew its facets from that. v2 has no such
 * layer: **a facet is a catalog key whose type is a vocabulary or a number**, so
 * the same information arrives as ordinary values under ordinary keys and the
 * layer disappears. What this file holds is the mapping from that layer to the
 * keys, plus the keys themselves.
 *
 * Six keys are only retyped. `Policies`, `Experimental Method`, `Reagents`,
 * `Read Type`, `Reference Sequence` and `Platform` are already in the catalog as
 * free text and already on the public page; giving them a type changes how the
 * value is held, not whether it is shown. The rest are new keys standing beside
 * the free text they were read out of, and those are not shown — they exist to
 * be filtered by.
 *
 * **The vocabularies are what the data actually says.** A term is minted for
 * every distinct value the dump carries, because deciding what the controlled
 * set ought to be is work for the real migration. ICD10 is the exception: its
 * codes carry their own hierarchy, so a four-character code is filed under the
 * three-character one it belongs to and the rollup has something to roll up.
 */

import type { NumberValue, ValueSlot } from "~/content/types"

import type { EsSearchable } from "./es"

export function slugify(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "").toLowerCase()
}

export interface TermSeed {
  code: string
  labelEn: string
  labelJa: string | null
  /** The term this one rolls up into. Only ICD10 has any. */
  parentCode: string | null
}

export interface VocabularyFacet {
  code: string
  labelJa: string
  labelEn: string
  categoryCode: string
  /** Where the values come from. Every key has a set of its own but ICD10. */
  setCode: string
  external: boolean
  hierarchical: boolean
  /** Whether the key is already in the catalog as free text and stays visible. */
  retyped: boolean
  read: (searchable: EsSearchable) => TermSeed[]
}

export interface NumberFacet {
  code: string
  labelJa: string
  labelEn: string
  categoryCode: string
  canonicalUnit: string | null
  inputUnits: string[] | null
  retyped: boolean
  read: (searchable: EsSearchable) => number | null
}

export const FACET_CATEGORIES = [
  { code: "basic-info", labelJa: "基本情報", labelEn: "Basic information", position: 0 },
  { code: "experiment", labelJa: "実験", labelEn: "Experiment", position: 1 },
  { code: "subjects", labelJa: "対象者", labelEn: "Subjects", position: 2 },
  { code: "platform", labelJa: "手法とプラットフォーム", labelEn: "Method and platform", position: 3 },
  { code: "data-format", labelJa: "データの形式", labelEn: "Data format", position: 4 },
  { code: "policy", labelJa: "利用ポリシー", labelEn: "Policies", position: 5 },
]

/** A value written as it stands, with no Japanese label of its own. */
function plain(value: string): TermSeed {
  return { code: slugify(value), labelEn: value, labelJa: null, parentCode: null }
}

function plainList(values: readonly (string | null | undefined)[] | null | undefined): TermSeed[] {
  return (values ?? []).flatMap((value) => (value ? [plain(value)] : []))
}

/** A closed set small enough to be worth a Japanese label. */
function labelled(value: string | null | undefined, labels: Record<string, string>): TermSeed[] {
  if (!value) return []
  return [{
    code: slugify(value),
    labelEn: value,
    labelJa: labels[value] ?? null,
    parentCode: null,
  }]
}

/**
 * An ICD10 code as v1 wrote it: sometimes with the dot, sometimes without.
 * Anything that is not a code at all — v1 has a few sentences in this field —
 * is dropped rather than minted as a term.
 */
function icd10Code(raw: string): string | null {
  const code = raw.replace(/[\s.]/g, "").toUpperCase()
  return /^[A-Z][0-9]{2}[0-9A-Z]{0,2}$/.test(code) ? code : null
}

const DISEASE_SET = "icd10"

function diseases(searchable: EsSearchable): TermSeed[] {
  return (searchable.diseases ?? []).flatMap((disease): TermSeed[] => {
    const code = icd10Code(disease.icd10 ?? "")
    if (code === null) return []
    // The three-character code is the root of the tree, and the codes beneath it
    // are what a dataset is usually filed under.
    return [{
      code,
      labelEn: disease.label ?? code,
      labelJa: null,
      parentCode: code.length === 3 ? null : code.slice(0, 3),
    }]
  })
}

export const VOCABULARY_FACETS: VocabularyFacet[] = [
  {
    code: "policies",
    labelJa: "利用ポリシー",
    labelEn: "Policies",
    categoryCode: "policy",
    setCode: "policies",
    external: false,
    hierarchical: false,
    retyped: true,
    read: (s) => (s.policies ?? []).flatMap((policy) => {
      const code = policy.id
      const labelEn = policy.name?.en ?? code
      if (!code || !labelEn) return []
      return [{ code, labelEn, labelJa: policy.name?.ja ?? null, parentCode: null }]
    }),
  },
  {
    code: "experimental-method",
    labelJa: "実験方法",
    labelEn: "Experimental Method",
    categoryCode: "experiment",
    setCode: "experimental-method",
    external: false,
    hierarchical: false,
    retyped: true,
    read: (s) => plainList(s.assayType),
  },
  {
    code: "disease-icd10",
    labelJa: "疾患 (ICD10)",
    labelEn: "Disease (ICD10)",
    categoryCode: "experiment",
    setCode: DISEASE_SET,
    external: true,
    hierarchical: true,
    retyped: false,
    read: diseases,
  },
  {
    code: "tissue",
    labelJa: "組織",
    labelEn: "Tissue",
    categoryCode: "experiment",
    setCode: "tissue",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.tissues),
  },
  {
    code: "health-status",
    labelJa: "健康状態",
    labelEn: "Health status",
    categoryCode: "experiment",
    setCode: "health-status",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => labelled(s.healthStatus, {
      affected: "罹患",
      healthy: "健常",
      mixed: "混在",
    }),
  },
  {
    code: "is-tumor",
    labelJa: "腫瘍の別",
    labelEn: "Tumour status",
    categoryCode: "experiment",
    setCode: "is-tumor",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => labelled(s.isTumor, { tumor: "腫瘍", normal: "非腫瘍", mixed: "混在" }),
  },
  {
    code: "has-phenotype-data",
    labelJa: "表現型データ",
    labelEn: "Phenotype data",
    categoryCode: "experiment",
    setCode: "has-phenotype-data",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => (s.hasPhenotypeData == null
      ? []
      : labelled(s.hasPhenotypeData ? "included" : "not included", {
          "included": "あり",
          "not included": "なし",
        })),
  },
  {
    code: "cohort",
    labelJa: "コホート",
    labelEn: "Cohort",
    categoryCode: "experiment",
    setCode: "cohort",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.cohorts),
  },
  {
    code: "subject-count-type",
    labelJa: "対象者数の単位",
    labelEn: "Counted as",
    categoryCode: "subjects",
    setCode: "subject-count-type",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => labelled(s.subjectCountType, {
      individual: "個体",
      sample: "検体",
      mixed: "混在",
    }),
  },
  {
    code: "sex",
    labelJa: "性別",
    labelEn: "Sex",
    categoryCode: "subjects",
    setCode: "sex",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => labelled(s.sex, { male: "男性", female: "女性", mixed: "混在" }),
  },
  {
    code: "age-group",
    labelJa: "年齢層",
    labelEn: "Age group",
    categoryCode: "subjects",
    setCode: "age-group",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => labelled(s.ageGroup, {
      infant: "乳幼児",
      child: "小児",
      adult: "成人",
      elderly: "高齢者",
      mixed: "混在",
    }),
  },
  {
    code: "population",
    labelJa: "集団",
    labelEn: "Population",
    categoryCode: "subjects",
    setCode: "population",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.population),
  },
  {
    code: "cell-line",
    labelJa: "細胞株",
    labelEn: "Cell line",
    categoryCode: "subjects",
    setCode: "cell-line",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.cellLine),
  },
  {
    code: "platform",
    labelJa: "プラットフォーム",
    labelEn: "Platform",
    categoryCode: "platform",
    setCode: "platform",
    external: false,
    hierarchical: false,
    retyped: true,
    read: (s) => (s.platforms ?? []).flatMap((platform) => {
      const written = [platform.vendor, platform.model].filter(Boolean).join(" ")
      return written === "" ? [] : [plain(written)]
    }),
  },
  {
    code: "reagents",
    labelJa: "試薬",
    labelEn: "Reagents",
    categoryCode: "platform",
    setCode: "reagents",
    external: false,
    hierarchical: false,
    retyped: true,
    read: (s) => plainList(s.libraryKits),
  },
  {
    code: "read-type",
    labelJa: "リードタイプ",
    labelEn: "Read Type",
    categoryCode: "platform",
    setCode: "read-type",
    external: false,
    hierarchical: false,
    retyped: true,
    read: (s) => labelled(s.readType, {
      "paired-end": "ペアエンド",
      "single-end": "シングルエンド",
      "mixed": "混在",
    }),
  },
  {
    code: "reference-sequence",
    labelJa: "リファレンス配列",
    labelEn: "Reference Sequence",
    categoryCode: "platform",
    setCode: "reference-sequence",
    external: false,
    hierarchical: false,
    retyped: true,
    read: (s) => plainList(s.referenceGenome),
  },
  {
    code: "file-type",
    labelJa: "ファイル形式",
    labelEn: "File format",
    categoryCode: "data-format",
    setCode: "file-type",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.fileTypes),
  },
  {
    code: "processed-data-type",
    labelJa: "加工データの種類",
    labelEn: "Processed data type",
    categoryCode: "data-format",
    setCode: "processed-data-type",
    external: false,
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.processedDataTypes),
  },
]

/**
 * The facets that take one value. v1 held a single string for each of these and
 * a list for the rest, which is the same distinction the input control makes.
 */
const SINGLE_VALUED = new Set([
  "read-type",
  "sex",
  "age-group",
  "health-status",
  "subject-count-type",
  "is-tumor",
  "has-phenotype-data",
])

export function takesMany(facet: VocabularyFacet): boolean {
  return !SINGLE_VALUED.has(facet.code)
}

export const NUMBER_FACETS: NumberFacet[] = [
  {
    code: "subject-count",
    labelJa: "対象者数",
    labelEn: "Number of subjects",
    categoryCode: "subjects",
    canonicalUnit: null,
    inputUnits: null,
    retyped: false,
    read: (s) => s.subjectCount ?? null,
  },
  {
    code: "read-length",
    labelJa: "リード長",
    labelEn: "Read Length",
    categoryCode: "platform",
    canonicalUnit: "bp",
    inputUnits: ["bp"],
    retyped: true,
    read: (s) => s.readLength ?? null,
  },
  {
    code: "data-volume-gb",
    labelJa: "データ量",
    labelEn: "Data volume",
    categoryCode: "data-format",
    canonicalUnit: "GB",
    inputUnits: ["MB", "GB", "TB"],
    retyped: false,
    read: (s) => s.dataVolumeGb ?? null,
  },
]

/**
 * The keys that were free text in v1 and are a facet here. The free text they
 * held is not loaded: the value now lives under the same key with a type, and
 * two values under one key is not something the content model can hold.
 */
export const RETYPED_CODES = new Set([
  ...VOCABULARY_FACETS.filter((facet) => facet.retyped).map((facet) => facet.code),
  ...NUMBER_FACETS.filter((facet) => facet.retyped).map((facet) => facet.code),
])

export interface VocabularySetSeed {
  code: string
  labelJa: string
  labelEn: string
  external: boolean
  hierarchical: boolean
}

export function vocabularySetSeeds(): VocabularySetSeed[] {
  const seeds = new Map<string, VocabularySetSeed>()
  for (const facet of VOCABULARY_FACETS) {
    seeds.set(facet.setCode, {
      code: facet.setCode,
      labelJa: facet.labelJa,
      labelEn: facet.labelEn,
      external: facet.external,
      hierarchical: facet.hierarchical,
    })
  }
  return [...seeds.values()]
}

/**
 * Every term the dump uses, parents before children so that a child can point
 * at one. A code seen first as a parent gets its label when the code itself
 * turns up as a value — an ICD10 root is named by whatever v1 filed directly
 * under it, and by its code alone when nothing was.
 */
export function collectTerms(
  searchables: Iterable<EsSearchable>,
): Map<string, TermSeed[]> {
  const bySet = new Map<string, Map<string, TermSeed>>()
  for (const searchable of searchables) {
    for (const facet of VOCABULARY_FACETS) {
      const held = bySet.get(facet.setCode) ?? new Map<string, TermSeed>()
      bySet.set(facet.setCode, held)
      for (const term of facet.read(searchable)) {
        const parent = term.parentCode
        if (parent !== null && !held.has(parent)) {
          held.set(parent, { code: parent, labelEn: parent, labelJa: null, parentCode: null })
        }
        const known = held.get(term.code)
        if (known === undefined || known.labelEn === known.code) held.set(term.code, term)
      }
    }
  }
  return new Map([...bySet].map(([setCode, terms]) => [
    setCode,
    [...terms.values()].sort((a, b) => Number(a.parentCode !== null) - Number(b.parentCode !== null)),
  ]))
}

function numberValue(value: number, unit: string | null): NumberValue {
  return { value, unit, inputValue: value, inputUnit: unit }
}

/**
 * The value slots one experiment carries under the typed keys. A key with
 * nothing to say is absent rather than empty: an absent slot means the question
 * does not come up for this experiment, which is what v1's null meant.
 */
export function facetValueSlots(
  searchable: EsSearchable,
  identity: {
    keyIdByCode: Map<string, string>
    termIdBySetAndCode: Map<string, string>
  },
): ValueSlot[] {
  const slots: ValueSlot[] = []
  for (const facet of VOCABULARY_FACETS) {
    const keyId = identity.keyIdByCode.get(facet.code)
    if (keyId === undefined) continue
    const termIds = [...new Set(facet.read(searchable)
      .map((term) => identity.termIdBySetAndCode.get(`${facet.setCode}/${term.code}`))
      .filter((id) => id !== undefined))]
    if (termIds.length === 0) continue
    slots.push({ keyId, value: { kind: "vocabulary", termIds: { state: "value", value: termIds } } })
  }
  for (const facet of NUMBER_FACETS) {
    const keyId = identity.keyIdByCode.get(facet.code)
    const held = facet.read(searchable)
    if (keyId === undefined || held === null || !Number.isFinite(held)) continue
    slots.push({
      keyId,
      value: { kind: "number", value: { state: "value", value: numberValue(held, facet.canonicalUnit) } },
    })
  }
  return slots
}
