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

import { counts, numbersWithUnit, type ReadNumber } from "./numbers"
import { icd10Code, icd10Parent } from "~/icd10/codes"

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
  /** Who makes the thing the value names. Only the platforms have one. */
  maker: string | null
}

export interface VocabularyFacet {
  code: string
  labelJa: string
  labelEn: string
  categoryCode: string
  /** Where the values come from. Every key has a set of its own but ICD10. */
  setCode: string
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

/**
 * The boxes the refinement panel puts the keys in, in the order it shows them.
 *
 * **The first box has no heading.** What it holds is what the row itself is —
 * when it was published, when it changed, who may take it — and a heading over
 * that would be naming the thing the reader is already looking at. Every other
 * key is a value gathered from underneath the row, so the boxes below divide
 * those by the question they answer: who was studied, what was taken from them,
 * how it was measured, what came out.
 *
 * **The cut is not the one v1 made.** v1 put the counts that came out of an
 * analysis in two different boxes (`Variant Number` beside the diseases,
 * `Coverage` beside the machines) and split the subjects' own properties the
 * same way, with the disease and the health status apart from the sex and the
 * age. Neither split answers a question anybody asks.
 */
export const FACET_CATEGORIES = [
  { code: "basic-info", labelJa: null, labelEn: null, position: 0 },
  { code: "subjects", labelJa: "対象者", labelEn: "Subjects", position: 1 },
  { code: "samples", labelJa: "検体", labelEn: "Samples", position: 2 },
  { code: "experiment", labelJa: "実験", labelEn: "Experiment", position: 3 },
  { code: "data", labelJa: "データ", labelEn: "Data", position: 4 },
]

/** A value written as it stands, with no Japanese label of its own. */
function plain(value: string): TermSeed {
  return { code: slugify(value), labelEn: value, labelJa: null, parentCode: null, maker: null }
}

function plainList(values: readonly (string | null | undefined)[] | null | undefined): TermSeed[] {
  return (values ?? []).flatMap((value) => (value ? [plain(value)] : []))
}

/**
 * The makers written more than one way, and the spelling each is written as.
 *
 * **The one the dump uses most often wins**, which is not always the longer
 * form: `Agilent` outnumbers `Agilent Technologies` seventeen to two, while
 * `Oxford Nanopore Technologies` outnumbers `Oxford Nanopore` eighty-four to
 * three. The last of these is not a spelling at all — a cohort's name reached
 * the field a maker belongs in.
 *
 * **Companies that bought each other are not merged.** `Thermo Fisher
 * Scientific`, `Life Technologies`, `Applied Biosystems` and `Affymetrix` name
 * one another's histories rather than one another, and so do `BGI` and `MGI`;
 * a machine is remembered by the name on it when it was sold.
 */
const MAKER_SPELLINGS: Record<string, string> = {
  "MGI Tech": "MGI",
  "Oxford Nanopore": "Oxford Nanopore Technologies",
  "Agilent Technologies": "Agilent",
  "Pacific Biosciences": "PacBio",
  "UK Biobank: Applied Biosystems": "Applied Biosystems",
}

function makerName(vendor: string | null | undefined): string | null {
  const written = (vendor ?? "").trim()
  if (written === "") return null
  return MAKER_SPELLINGS[written] ?? written
}

/**
 * The machines a single model names more than one of.
 *
 * v1's layer read these out of free text written as `Illumina [HiSeq 2500/3000,
 * NovaSeq 6000]` and kept the bracket whole, so a listing cell showed a value
 * naming three machines directly above the value naming one of them.
 *
 * **The table is written out rather than derived.** A slash separates machines
 * in `HiSeq 2000/2500` and belongs to the name itself in `HiSeq X Ten` and
 * `DNBSEQ-G400RS`, and what carries over to the machine after the slash is the
 * series (`HiSeq`), the series and a letter (`NovaSeq X`), or nothing at all —
 * the string does not say which. The separator is not always a slash either:
 * one entry uses the Japanese comma its free text was written with.
 */
const MODELS_WRITTEN_TOGETHER: Record<string, readonly string[]> = {
  "HiSeq 2000/1500": ["HiSeq 2000", "HiSeq 1500"],
  "HiSeq 2000/2500": ["HiSeq 2000", "HiSeq 2500"],
  "HiSeq 2000/2500/X Five": ["HiSeq 2000", "HiSeq 2500", "HiSeq X Five"],
  "HiSeq 1500/2500": ["HiSeq 1500", "HiSeq 2500"],
  "HiSeq1500/4000": ["HiSeq 1500", "HiSeq 4000"],
  "HiSeq 2500/3000, NovaSeq 6000": ["HiSeq 2500", "HiSeq 3000", "NovaSeq 6000"],
  "HiSeq 2500/X Five": ["HiSeq 2500", "HiSeq X Five"],
  "HiSeq X/2500": ["HiSeq X", "HiSeq 2500"],
  "NextSeq 500/550": ["NextSeq 500", "NextSeq 550"],
  "NovaSeq 6000/X": ["NovaSeq 6000", "NovaSeq X"],
  "NovaSeq 6000/X Plus": ["NovaSeq 6000", "NovaSeq X Plus"],
  "NovaSeq 6000 X Plus": ["NovaSeq 6000", "NovaSeq X Plus"],
  "NovaSeq 6000/HiSeq X Ten": ["NovaSeq 6000", "HiSeq X Ten"],
  "HumanOmniExpress、HumanExome、OmniExpressExome BeadChip":
    ["HumanOmniExpress", "HumanExome", "OmniExpressExome BeadChip"],
  "HumanOmniExpress / HumanExome / OmniExpressExome BeadChip":
    ["HumanOmniExpress", "HumanExome", "OmniExpressExome BeadChip"],
  "HumanOmniExpressExome BeadChip, HumanOmniExpress BeadChip, HumanExome BeadChip":
    ["HumanOmniExpressExome BeadChip", "HumanOmniExpress BeadChip", "HumanExome BeadChip"],
  "Ion PGM/IonProton": ["Ion PGM", "Ion Proton"],
  "DNBSEQ-G400/T7": ["DNBSEQ-G400", "DNBSEQ-T7"],
  "Sequel II/IIe": ["Sequel II", "Sequel IIe"],
  "Agilent CE system equipped with an Agilent 6210 TOFMS, Agilent 1100 isocratic HPLC pump":
    ["Agilent CE system equipped with an Agilent 6210 TOFMS", "Agilent 1100 isocratic HPLC pump"],
}

/**
 * The models written more than one way, and the spelling each is written as.
 *
 * **Only one name spelled differently belongs here** — a letter misread (`Nspl`
 * for `NspI`), letters transposed (`Omini` for `Omni`), a separator (`X-10` for
 * `X Ten`), an abbreviation spelled out (`Gene Expression` for `GE`), a model
 * carrying the phrase that describes it (`Helios a CyTOF system`).
 *
 * **Names that merely differ are left apart.** `HumanExome` and `HumanExome
 * BeadChip` are very likely one chip written two ways, and so are `Infinium
 * MethylationEPIC` and `Infinium MethylationEPIC BeadChip` — but `Ion S5` and
 * `Ion S5 XL` are two machines, and `Sequel`, `Sequel II` and `Sequel IIe` are
 * three. Nothing in the dump tells the two cases apart. Merging them is a
 * catalog edit a curator can make and see; it is not this migration's to guess.
 */
const MODEL_SPELLINGS: Record<string, string> = {
  "GeneChip Human Mapping 250k NspI": "GeneChip Human Mapping 250K Nsp Array",
  "GeneChip Human Mapping 250k Nspl": "GeneChip Human Mapping 250K Nsp Array",
  "HumanOminiExpress-12": "HumanOmniExpress-12 BeadChip",
  "HiSeq X-10": "HiSeq X Ten",
  "HumanHap 550": "HumanHap550",
  "Affy6.0": "Genome-Wide Human SNP Array 6.0",
  "GeneChip 6.0": "Genome-Wide Human SNP Array 6.0",
  "Axiom ASI": "Axiom Genome-Wide ASI 1 Array",
  "SurePrint G3 Human Gene Expression 8 × 60 K v2 Microarray": "SurePrint G3 Human GE v2 8x60K Microarray",
  "Helios a CyTOF system": "Helios",
  "Ion Torrent Proton": "Ion Proton",
}

/** What a model carries in brackets is a note about it, not part of its name. */
const MODEL_NOTE = /\s*\([^()]*\)/g

/**
 * The machines one platform entry names, each written the way the vocabulary
 * keeps it.
 *
 * **The maker is not repeated inside the model.** The dump writes it in both
 * fields for four entries, which the listing would otherwise draw as `Olink
 * Olink Explore 3072`.
 */
function modelNames(maker: string | null, model: string | null | undefined): string[] {
  const written = (model ?? "").replace(MODEL_NOTE, "").replace(/\s+/g, " ").trim()
  if (written === "") return []
  return (MODELS_WRITTEN_TOGETHER[written] ?? [written])
    .map((one) => MODEL_SPELLINGS[one] ?? one)
    .map((one) => (maker !== null && one.startsWith(`${maker} `) ? one.slice(maker.length + 1) : one))
    .filter((one) => one !== "")
}

/** A closed set small enough to be worth a Japanese label. */
function labelled(value: string | null | undefined, labels: Record<string, string>): TermSeed[] {
  if (!value) return []
  return [{
    code: slugify(value),
    labelEn: value,
    labelJa: labels[value] ?? null,
    parentCode: null,
    maker: null,
  }]
}

/** The disease vocabulary, whose term codes are ICD10 codes. */
export const DISEASE_SET = "icd10"

/** The catalog key the disease terms sit under. */
export const DISEASE_KEY = "disease-icd10"

function diseases(searchable: EsSearchable): TermSeed[] {
  return (searchable.diseases ?? []).flatMap((disease): TermSeed[] => {
    const code = icd10Code(disease.icd10 ?? "")
    if (code === null) return []
    // The labels v1 wrote are not taken: the dictionary names these terms
    // (`migration/run.ts`), because v1 filed some codes under the wrong disease
    // and left others named by the code itself.
    return [{ code, labelEn: code, labelJa: null, parentCode: icd10Parent(code), maker: null }]
  })
}

export const VOCABULARY_FACETS: VocabularyFacet[] = [
  {
    code: "policies",
    labelJa: "利用ポリシー",
    labelEn: "Data use policy",
    // The one thing beside the access type that says what may be done with the
    // data, and the two are read together. A box holding this alone repeated
    // its own name as its only entry.
    categoryCode: "basic-info",
    setCode: "policies",
    hierarchical: false,
    retyped: true,
    read: (s) => (s.policies ?? []).flatMap((policy) => {
      const code = policy.id
      const labelEn = policy.name?.en ?? code
      if (!code || !labelEn) return []
      return [{ code, labelEn, labelJa: policy.name?.ja ?? null, parentCode: null, maker: null }]
    }),
  },
  {
    code: "experimental-method",
    labelJa: "実験方法",
    labelEn: "Experimental method",
    categoryCode: "experiment",
    setCode: "experimental-method",
    hierarchical: false,
    retyped: true,
    read: (s) => plainList(s.assayType),
  },
  {
    code: DISEASE_KEY,
    // **The coding system is not part of the name.** The box that takes a code
    // says which system it is (`messages` の `search.refine.code`), and this
    // label also stands over the value on the dataset page, where there is no
    // box for the parenthesis to be about.
    labelJa: "疾患",
    labelEn: "Disease",
    categoryCode: "subjects",
    setCode: DISEASE_SET,
    hierarchical: true,
    retyped: false,
    read: diseases,
  },
  {
    code: "tissue",
    labelJa: "組織",
    labelEn: "Tissue",
    categoryCode: "samples",
    setCode: "tissue",
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.tissues),
  },
  {
    code: "health-status",
    labelJa: "健康状態",
    labelEn: "Health status",
    categoryCode: "subjects",
    setCode: "health-status",
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
    labelJa: "腫瘍/非腫瘍",
    labelEn: "Tumor / normal",
    categoryCode: "samples",
    setCode: "is-tumor",
    hierarchical: false,
    retyped: false,
    read: (s) => labelled(s.isTumor, { tumor: "腫瘍", normal: "非腫瘍", mixed: "混在" }),
  },
  {
    code: "has-phenotype-data",
    labelJa: "表現型データの有無",
    labelEn: "Phenotype data",
    categoryCode: "data",
    setCode: "has-phenotype-data",
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
    categoryCode: "subjects",
    setCode: "cohort",
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.cohorts),
  },
  {
    code: "subject-count-type",
    labelJa: "対象者数の数え方",
    labelEn: "Counted as",
    categoryCode: "subjects",
    setCode: "subject-count-type",
    hierarchical: false,
    retyped: false,
    // The label asks how the number was counted, so the values answer in the
    // same words: `個体` is a word the site itself hardly uses, and a value
    // reading `検体` under a heading that says `対象者数` denies the heading.
    read: (s) => labelled(s.subjectCountType, {
      individual: "人数",
      sample: "検体数",
      mixed: "混在",
    }),
  },
  {
    code: "sex",
    labelJa: "性別",
    labelEn: "Sex",
    categoryCode: "subjects",
    setCode: "sex",
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
    labelJa: "対象集団",
    labelEn: "Population",
    categoryCode: "subjects",
    setCode: "population",
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.population),
  },
  {
    code: "cell-line",
    labelJa: "細胞株",
    labelEn: "Cell line",
    categoryCode: "samples",
    setCode: "cell-line",
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.cellLine),
  },
  {
    code: "platform",
    labelJa: "プラットフォーム",
    labelEn: "Platform",
    categoryCode: "experiment",
    setCode: "platform",
    hierarchical: false,
    retyped: true,
    read: (s) => (s.platforms ?? []).flatMap((platform) => {
      const maker = makerName(platform.vendor)
      const models = modelNames(maker, platform.model)
      // A maker with no model still names something the reader can refine by.
      const written = models.length === 0
        ? [maker ?? ""]
        : models.map((model) => [maker, model].filter(Boolean).join(" "))
      return written.filter((one) => one !== "").map((one) => ({ ...plain(one), maker }))
    }),
  },
  {
    code: "reagents",
    labelJa: "ライブラリ調製キット",
    labelEn: "Library prep kit",
    categoryCode: "experiment",
    setCode: "reagents",
    hierarchical: false,
    retyped: true,
    read: (s) => plainList(s.libraryKits),
  },
  {
    code: "read-type",
    labelJa: "リードタイプ",
    labelEn: "Read type",
    categoryCode: "experiment",
    setCode: "read-type",
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
    labelJa: "参照ゲノム",
    labelEn: "Reference genome",
    categoryCode: "experiment",
    setCode: "reference-sequence",
    hierarchical: false,
    retyped: true,
    read: (s) => plainList(s.referenceGenome),
  },
  {
    code: "file-type",
    labelJa: "ファイル形式",
    labelEn: "File format",
    categoryCode: "data",
    setCode: "file-type",
    hierarchical: false,
    retyped: false,
    read: (s) => plainList(s.fileTypes),
  },
  {
    code: "processed-data-type",
    labelJa: "加工データの種類",
    labelEn: "Processed data type",
    categoryCode: "data",
    setCode: "processed-data-type",
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
]

/**
 * The v1 cells that hold numbers, and how each is read.
 *
 * **These keys keep their place in the catalog and change type.** v1 wrote a
 * table into the cell — a label, a number, a unit, a word qualifying it — and
 * kept a second layer of numbers beside it, read out by a language model, so
 * that something could be filtered by. v2 holds the table itself
 * (`NumberValue[]` in `app/content/types.ts`), so the second layer has nothing
 * left to do: the key a reader already sees is the key a search already uses.
 *
 * **`データ量` and `総データ量` were the two halves of that split** and are one
 * key here. The same goes for the four counts — `SNV Number`, `INDEL Number`,
 * `SV Number`, `CNV Number` — which are `バリアント数` with the unit saying
 * which kind. Measured over the dump only nine experiments carry more than one
 * of the four, and in those the units differ, so nothing collides.
 *
 * **What the rules cannot read stays unread rather than guessed.** The residue
 * is written out for somebody to work through ([numbers.ts](numbers.ts)).
 */
export interface TextNumberKey {
  /** The v1 key string of the cell, which is also how the catalog finds it. */
  source: string
  code: string
  labelJa: string
  labelEn: string
  categoryCode: string
  canonicalUnit: string | null
  inputUnits: string[] | null
  /** Null where the rules could not read the line at all (`numbers.ts`). */
  read: (said: string) => ReadNumber[] | null
}

const COUNTED = [
  "SNVs", "SNV", "SNPs", "SNP", "variants", "variant",
  "indels", "indel", "CNVs", "CNV", "SVs", "SV", "バリアント",
]

export const TEXT_NUMBERS: TextNumberKey[] = [
  {
    source: "Total Data Volume",
    code: "total-data-volume",
    labelJa: "総データ量",
    labelEn: "Total data volume",
    categoryCode: "data",
    canonicalUnit: "GB",
    inputUnits: ["KB", "MB", "GB", "TB", "PB"],
    read: numbersWithUnit(["KB", "MB", "GB", "TB", "PB"], { kB: "KB", KB: "KB" }),
  },
  {
    source: "Read Length",
    code: "read-length",
    labelJa: "リード長",
    labelEn: "Read length",
    categoryCode: "experiment",
    canonicalUnit: "bp",
    inputUnits: ["bp", "kbp", "Mbp"],
    // `kb` is a thousand bases here, whatever it means beside a file size.
    read: numbersWithUnit(["bp", "ｂｐ", "kbp", "kb", "Mbp"], { ｂｐ: "bp", kb: "kbp" }),
  },
  {
    source: "Variant Number",
    code: "variant-number",
    labelJa: "バリアント数",
    labelEn: "Variant number",
    categoryCode: "data",
    canonicalUnit: null,
    inputUnits: null,
    read: counts(COUNTED),
  },
  {
    source: "Coverage",
    code: "coverage",
    labelJa: "カバレッジ",
    labelEn: "Coverage",
    categoryCode: "data",
    canonicalUnit: null,
    inputUnits: null,
    read: numbersWithUnit(["x", "×", "X", "%", "倍", "depth"]),
  },
  {
    source: "Gene Number",
    code: "gene-number",
    labelJa: "遺伝子数",
    labelEn: "Gene number",
    categoryCode: "data",
    canonicalUnit: null,
    inputUnits: null,
    read: counts(["genes", "gene", "遺伝子"]),
  },
  {
    source: "Probe Number",
    code: "probe-number",
    labelJa: "プローブ数",
    labelEn: "Probe number",
    categoryCode: "data",
    canonicalUnit: null,
    inputUnits: null,
    read: counts(["probes", "probe", "プローブ"]),
  },
]

/**
 * The v1 cells that are the same key under another name. Their values join the
 * key they name, and no key of their own is made.
 */
export const MERGED_SOURCES = new Map<string, string>([
  // v1 wrote the library kit under two names and never under both: 1,790 cells
  // say `Reagents`, 2,181 say `Library Construction`, and no cell has a value
  // in each. They are one slot, so they take one key — and because that key is
  // retyped, the prose is not kept beside the terms read out of it.
  ["Library Construction", "reagents"],
  ["SNV Number", "variant-number"],
  ["INDEL Number", "variant-number"],
  ["SV Number", "variant-number"],
  ["CNV Number", "variant-number"],
  ["Raw Call Variant Number", "variant-number"],
])

/** The reader for a merged cell, which counts the kind its own name says. */
export const MERGED_READERS = new Map<string, (said: string) => ReadNumber[] | null>([
  ["SNV Number", counts(["SNVs", "SNV", "SNPs", "SNP"])],
  ["INDEL Number", counts(["indels", "indel"])],
  ["SV Number", counts(["SVs", "SV"])],
  ["CNV Number", counts(["CNVs", "CNV"])],
  ["Raw Call Variant Number", counts(COUNTED)],
])

/**
 * The order the refinement panel puts the keys v2 adds in, inside their box.
 *
 * The catalog's position decides the order ([catalog.ts](catalog.ts)), and a
 * key v1 already had inherits v1's. The new keys have none to inherit, so it is
 * declared here — **as one list rather than as the order of the arrays above**,
 * because whether a facet holds a vocabulary or a number is an implementation
 * detail of how its values are read, and taking the order from that puts every
 * number after every vocabulary: the count and the word saying what was counted
 * end up at opposite ends of the same box.
 *
 * Every new key has to appear ([catalog.ts](catalog.ts) refuses to load
 * otherwise), so adding a facet is also deciding where it is read.
 */
export const NEW_KEY_ORDER: string[] = [
  DISEASE_KEY,
  "health-status",
  "cohort",
  "subject-count",
  "subject-count-type",
  "sex",
  "age-group",
  "population",
  "tissue",
  "is-tumor",
  "cell-line",
  "file-type",
  "processed-data-type",
  "has-phenotype-data",
]

/** Every key whose free text is replaced by numbers read out of it. */
export const TEXT_NUMBER_CODES = new Set(TEXT_NUMBERS.map((one) => one.code))

/**
 * The keys that were free text in v1 and are a facet here. The free text they
 * held is not loaded: the value now lives under the same key with a type, and
 * two values under one key is not something the content model can hold.
 */
/**
 * The new keys that are shown all the same.
 *
 * Structured slots are facets and nothing else by default, but the disease is
 * a value a reader looks for on the dataset page — and **being in the public
 * projection is what makes an ICD10 code findable from the search box**, since
 * the full text is built from that projection (docs/public-pages.md の
 * 「dataset」).
 */
export const SHOWN_NEW_KEYS = new Set([DISEASE_KEY])

export const RETYPED_CODES = new Set([
  ...VOCABULARY_FACETS.filter((facet) => facet.retyped).map((facet) => facet.code),
  ...NUMBER_FACETS.filter((facet) => facet.retyped).map((facet) => facet.code),
])

export interface VocabularySetSeed {
  code: string
  labelJa: string
  labelEn: string
  hierarchical: boolean
}

export function vocabularySetSeeds(): VocabularySetSeed[] {
  const seeds = new Map<string, VocabularySetSeed>()
  for (const facet of VOCABULARY_FACETS) {
    seeds.set(facet.setCode, {
      code: facet.setCode,
      labelJa: facet.labelJa,
      labelEn: facet.labelEn,
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
 *
 * **This order becomes `position`**, which is the order the editing form lists
 * a key's values in and the order a listing cell puts them in. Makers come
 * first, so that a column of platforms reads one company's machines together;
 * the rest is by label. The order the dump happens to mention a value in says
 * nothing, and leaving it would make the cell's first three values — all a
 * reader sees before "and 12 more" — an accident of how rows came back.
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
          held.set(parent, { code: parent, labelEn: parent, labelJa: null, parentCode: null, maker: null })
        }
        const known = held.get(term.code)
        if (known === undefined || known.labelEn === known.code) held.set(term.code, term)
      }
    }
  }
  return new Map([...bySet].map(([setCode, terms]) => [
    setCode,
    [...terms.values()].sort((a, b) =>
      Number(a.parentCode !== null) - Number(b.parentCode !== null)
      || (a.maker ?? "").localeCompare(b.maker ?? "", "en")
      || a.labelEn.localeCompare(b.labelEn, "en")),
  ]))
}

function numberValue(value: number, unit: string | null): NumberValue {
  return { label: null, value, unit, inputValue: value, inputUnit: unit, note: null }
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
      value: {
        kind: "number",
        values: { state: "value", value: [numberValue(held, facet.canonicalUnit)] },
      },
    })
  }
  return slots
}
