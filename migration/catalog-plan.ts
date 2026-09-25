/**
 * The experiment catalog of the production data, rebuilt from what readers ask
 * of an experiment rather than from the headings v1 happened to collect.
 *
 * v1 merged 208 table headings into keys and then grew more by hand, so the
 * catalog it left names one step of a pipeline in six places and several steps
 * that only one research ever wrote. Here each question gets one key: a step
 * only a few research describe joins the nearest key, and a key whose name reports
 * something other than its values is renamed.
 *
 * **A merge keeps no heading, save in the sample processing.** Merging accepts
 * that the step's name is lost; a key whose values cannot be read without it is
 * not merged at all. The sample processing is a protocol whose steps are its
 * content — fixing, retrieval, blocking, the antibodies — so there each line
 * keeps the name of its step (`固定化: 10%ホルマリン`). Accessions stay one key per archive — each has its
 * own identifiers and its own destination.
 *
 * The keys are the v1 keys as written in the dump, so the rules here name them
 * by that spelling; the catalog's codes and labels are set afterwards
 * (`reshapeCatalog`).
 */

import type { ContentKeySeed } from "./catalog"
import type { EsBilingualRich, EsExperiment } from "./es"
import type { KeyRule } from "./prepare"

const ANALYSIS = "Analysis Methods"
const SAMPLE_PROCESSING = "Sample Preparation"
const IMPUTATION = "Imputation"
const JGA = "Japanese Genotype-phenotype Archive Dataset Accession"

function into(to: string, ja?: string, en?: string): KeyRule {
  return ja === undefined || en === undefined
    ? { action: "merge-into", to }
    : { action: "merge-into", to, labelled: { ja, en } }
}

function cell(ja: string, en: string): EsBilingualRich {
  return { ja: { text: ja, rawHtml: null }, en: { text: en, rawHtml: null } }
}

function textIn(value: EsBilingualRich | undefined, lang: "ja" | "en"): string {
  return value?.[lang]?.text ?? ""
}

/**
 * Keys that join another. The heading is the key's own label, so a reader of
 * the key it joins still sees which step a line describes.
 */
export const CATALOG_MERGES: ReadonlyMap<string, KeyRule> = new Map<string, KeyRule>([
  // Steps done to the sample before it is measured: preparation, fixing,
  // staining, the IHC protocol and treatment of cells.
  ["Cell Treatment", into(SAMPLE_PROCESSING, "細胞処理", "Cell treatment")],
  ["Immobilization", into(SAMPLE_PROCESSING, "固定化", "Fixation")],
  ["Antigen Activation", into(SAMPLE_PROCESSING, "抗原賦活化", "Antigen retrieval")],
  ["Blocking", into(SAMPLE_PROCESSING, "ブロッキング", "Blocking")],
  ["Primary Antibodies for IHC", into(SAMPLE_PROCESSING, "免疫染色一次抗体", "Primary antibodies for IHC")],
  ["Secondary Antibodies for IHC", into(SAMPLE_PROCESSING, "免疫染色二次抗体", "Secondary antibodies for IHC")],
  ["Chromogen", into(SAMPLE_PROCESSING, "発色試薬", "Chromogen")],
  ["Washing", into(SAMPLE_PROCESSING, "洗浄", "Washing")],
  ["Histological Staining", into(SAMPLE_PROCESSING, "組織染色", "Histological staining")],
  // Steps of the analysis that one to three research wrote under a key of their
  // own; the values name the software, which reads without the step's name.
  ["Host Read Removal", into(ANALYSIS)],
  ["Genome Sequence Construction", into(ANALYSIS)],
  ["MAG Construction", into(ANALYSIS)],
  ["CRISPR Construction", into(ANALYSIS)],
  ["Virus Genome Construction", into(ANALYSIS)],
  ["Protein Identification", into(ANALYSIS)],
  ["Bacteria Identification", into(ANALYSIS)],
  ["TCR Repertoire Analysis Methods (Software)", into(ANALYSIS)],
  // A correction between plates is a normalisation.
  ["Validation", into("Normalization")],
  // Counts of another kind of variant or feature, told apart by the unit.
  ["Mobile Element Number", into("Variant Number")],
  ["Marker Number after Filtering", into("Variant Number")],
  ["miRNA Number", into("Gene Number")],
  // One key the crawler split by language: the Japanese half under one name,
  // the English half under the other.
  ["DBCLS/DDBJ Processed Data ID", into("Dataset ID of the Processed Data by JGA")],
  // What a vocabulary key already holds for the same experiment.
  ["Measurement", { action: "drop" }],
  ["File Format", { action: "drop" }],
  // Never used.
  ["Data Download", { action: "drop" }],
])

/**
 * Corrections to v1's reading of the dump's raw keys, which take precedence
 * over the reviewed table: the ones it got wrong on a second look.
 */
export const RAW_KEY_CORRECTIONS: ReadonlyMap<string, KeyRule> = new Map<string, KeyRule>([
  // The option a template offered, not a value.
  ["Pooling", { action: "drop" }],
  // How quality values are written out, not a filter.
  ["Quality Score (phred / log-ods)", into("Measurement Conditions")],
  // Merged into a key that is itself merged; followed to its end.
  ["フィルタリング後のマーカー数", into("Variant Number")],
  ["データフォーマット", { action: "drop" }],
])

/** A correction for one research, where v1's heading table put a row in the wrong key. */
export interface KeyFix {
  hum: string
  from: string
  /** Only a value whose Japanese text matches; every value when absent. */
  match?: string
  to: string | null
  labelJa?: string
  labelEn?: string
}

/** The fixes for the experiments of one research. */
export function applyKeyFixes(humId: string, experiment: EsExperiment, fixes: readonly KeyFix[]): void {
  const data = experiment.data
  if (!data) return
  for (const fix of fixes) {
    if (fix.hum !== humId) continue
    const value = data[fix.from]
    if (value === undefined) continue
    if (fix.match !== undefined && !new RegExp(fix.match).test(value.ja?.text ?? "")) continue
    const { [fix.from]: _moved, ...rest } = data
    experiment.data = rest
    if (fix.to === null) continue
    const heading = (text: string, label: string | undefined) => text === "" || label === undefined ? text : `${label}: ${text}`
    const ja = heading(value.ja?.text ?? "", fix.labelJa)
    const en = heading(value.en?.text ?? "", fix.labelEn)
    const held = rest[fix.to]
    // A line the key already holds is not said twice.
    const join = (a: string, b: string) => {
      const lines = a === "" ? [] : a.split("\n")
      return [...lines, ...b.split("\n").filter((line) => line !== "" && !lines.includes(line))].join("\n")
    }
    experiment.data = { ...rest, [fix.to]: cell(join(textIn(held, "ja"), ja), join(textIn(held, "en"), en)) }
  }
}

/** A line naming a tool that imputes or phases genotypes. */
const IMPUTES = /imput|minimac|IMPUTE|beagle|eagle|shapeit|prephas|インピュテーション/i
/** A line that also identifies genotype calling, which stays where it is. */
const CALLS = /genotyp|GenomeStudio|遺伝子型決定|ジェノタイプ|call/i

/**
 * Moves the lines describing imputation out of the analysis methods into the
 * key of their own: the reference panel is the first thing a user of genotype
 * data asks about. A line that identifies genotype calling as well stays, since
 * it cannot be cut without rewording it.
 */
export function moveImputationLines(experiment: EsExperiment): void {
  const data = experiment.data
  const analysis = data?.[ANALYSIS]
  if (!data || analysis === undefined) return
  const split = (text: string) => {
    const lines = text === "" ? [] : text.split("\n")
    const moved = lines.filter((line) => IMPUTES.test(line) && !CALLS.test(line))
    return { kept: lines.filter((line) => !moved.includes(line)).join("\n"), moved }
  }
  const ja = split(analysis.ja?.text ?? "")
  const en = split(analysis.en?.text ?? "")
  if (ja.moved.length === 0 && en.moved.length === 0) return
  const held = data[IMPUTATION]
  const add = (text: string, lines: string[]) => {
    const have = text === "" ? [] : text.split("\n")
    return [...have, ...lines.filter((line) => !have.includes(line))].join("\n")
  }
  const { [ANALYSIS]: _analysis, [IMPUTATION]: _imputation, ...rest } = data
  experiment.data = {
    ...rest,
    ...(ja.kept === "" && en.kept === "" ? {} : { [ANALYSIS]: cell(ja.kept, en.kept) }),
    [IMPUTATION]: cell(add(textIn(held, "ja"), ja.moved), add(textIn(held, "en"), en.moved)),
  }
}

const JGA_DATASET = /JGAD\d{6}/g
const OTHER_ACCESSION = /\b(?:DRA|SRA|ERA|DRR|DRX|E-GEAD-|GSE|MTBKS|JPST|hum\d{4}\.)/

/**
 * A language of a key that lists nothing but JGA datasets belongs to the JGA
 * key. v1's heading table resolved the two languages of one row separately and
 * sent the English half of the JGA row to the SRA key, and some NBDC rows are
 * JGA ids too. The move only fills the JGA key's side when that side is empty
 * or already reports the same.
 */
export function moveMisfiledJgaAccessions(experiment: EsExperiment): void {
  if (!experiment.data) return
  let data = experiment.data
  for (const key of ["Sequence Read Archive Accession", "NBDC Dataset Accession"]) {
    for (const lang of ["ja", "en"] as const) {
      const text = data[key]?.[lang]?.text ?? ""
      const lines = text.split("\n").filter((line) => line.trim() !== "")
      const onlyJga = lines.length > 0 && lines.every((line) => {
        const named = line.match(JGA_DATASET) ?? []
        return named.length > 0 && !OTHER_ACCESSION.test(line)
          && line.replace(/\[[^\]]*\]\([^)]*\)/g, "").replace(/JGAD\d{6}/g, "").trim() === ""
      })
      if (!onlyJga) continue
      const jga = textIn(data[JGA], lang)
      if (jga !== "" && jga !== text) continue
      const other = lang === "ja" ? "en" : "ja"
      const pick = (value: EsBilingualRich | undefined, mine: string) =>
        lang === "ja" ? cell(mine, textIn(value, "en")) : cell(textIn(value, "ja"), mine)
      const left = pick(data[key], "")
      const { [key]: _from, ...rest } = data
      data = { ...rest, [JGA]: pick(data[JGA], text), ...(textIn(left, other) === "" ? {} : { [key]: left }) }
    }
  }
  experiment.data = data
}

export interface PlannedKey {
  code: string
  labelJa: string
  labelEn: string
  position: number
  /** The code the key is seeded under, when it is renamed. */
  seededAs?: string
}

/**
 * The seeded catalog renamed, relabelled and reordered as planned. Every seed
 * must be in the plan unless nothing can be stored under it any more (it was
 * merged or dropped), and every planned key must have been seeded.
 */
export function reshapeCatalog(
  seeds: { keys: ContentKeySeed[], codeBySourceKey: Map<string, string> },
  planned: readonly PlannedKey[],
  gone: ReadonlySet<string>,
): { keys: ContentKeySeed[], codeBySourceKey: Map<string, string> } {
  const bySeed = new Map(planned.map((one) => [one.seededAs ?? one.code, one]))
  const keys: ContentKeySeed[] = []
  for (const seed of seeds.keys) {
    const plan = bySeed.get(seed.code)
    if (plan === undefined) {
      if (gone.has(seed.code)) continue
      throw new Error(`the catalog plan has no place for ${seed.code}`)
    }
    keys.push({ ...seed, code: plan.code, labelJa: plan.labelJa, labelEn: plan.labelEn, position: plan.position })
  }
  const missing = planned.filter((one) => !keys.some((key) => key.code === one.code))
  if (missing.length > 0) throw new Error(`planned keys that were never seeded: ${missing.map((one) => one.code).join(", ")}`)
  const renamed = new Map(planned.filter((one) => one.seededAs !== undefined).map((one) => [one.seededAs, one.code]))
  const codeBySourceKey = new Map([...seeds.codeBySourceKey].map(([source, code]) => [source, renamed.get(code) ?? code]))
  return { keys: keys.toSorted((a, b) => a.position - b.position), codeBySourceKey }
}
