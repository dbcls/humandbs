/**
 * Corrections made to a v1 dump before it is built into v2 content.
 *
 * Each works on the dump's own shape, so the build that follows reads the
 * corrected dump the way it reads an untouched one. A cell whose text is
 * rewritten here loses its HTML: `rawHtml` is what the text was extracted
 * from, and a text that no longer came from it must not be recovered out of it.
 */

import { datasetKey, type Dump, type EsDataset, type EsExperiment, type EsRichText } from "./es"
import { blockDataFromEs, splitSharedBlock, type HandSplits, type ReviewItem, type SplitStats } from "./inversion"

type Cell = NonNullable<EsExperiment["data"]>[string]

const LANGUAGES = ["ja", "en"] as const

/** A cell whose text is `ja` / `en` and whose HTML no longer applies. */
function rewritten(ja: string, en: string): Cell {
  return { ja: { text: ja, rawHtml: null }, en: { text: en, rawHtml: null } }
}

/**
 * The dump with a second one added. The research the second holds must be new:
 * two descriptions of the same research are a choice this does not make.
 */
export function mergeDumps(base: Dump, extra: Dump): Dump {
  for (const humId of extra.research.keys()) {
    if (base.research.has(humId)) throw new Error(`${humId} is in both dumps`)
  }
  return {
    research: new Map([...base.research, ...extra.research]),
    publishedVersions: [...base.publishedVersions, ...extra.publishedVersions],
    latestVersion: new Map([...base.latestVersion, ...extra.latestVersion]),
    datasetsByKey: new Map([...base.datasetsByKey, ...extra.datasetsByKey]),
    versions: [...base.versions, ...extra.versions],
  }
}

/** The dump without the given research, their versions and their datasets. */
export function dropResearch(held: Dump, humIds: readonly string[]): Dump {
  const gone = new Set(humIds)
  return {
    research: new Map([...held.research].filter(([humId]) => !gone.has(humId))),
    publishedVersions: held.publishedVersions.filter((v) => !gone.has(v.humId)),
    latestVersion: new Map([...held.latestVersion].filter(([humId]) => !gone.has(humId))),
    datasetsByKey: new Map([...held.datasetsByKey].filter(([, d]) => !gone.has(d.humId))),
    versions: held.versions.filter((v) => !gone.has(v.humId)),
  }
}

/**
 * What becomes of one v1 key. `labelled` keeps a heading in front of each line
 * of the value, for a key that said something the one it joins does not: the
 * old key's own name, or a heading per language.
 */
export type KeyRule
  = | { action: "merge-into", to: string, labelled?: boolean | { ja: string, en: string } }
    | { action: "drop" }

/**
 * The rules with every chain followed to its end, so that a key merged into a
 * key that is itself merged lands where the second one does. A chain that
 * comes back on itself is refused.
 */
export function followedRules(rules: ReadonlyMap<string, KeyRule>): Map<string, KeyRule> {
  const out = new Map<string, KeyRule>()
  for (const [from, first] of rules) {
    let rule = first
    const seen = new Set([from])
    while (rule.action === "merge-into") {
      const next = rules.get(rule.to)
      if (next === undefined) break
      if (seen.has(rule.to)) throw new Error(`the key rules for ${from} go round in a circle`)
      seen.add(rule.to)
      rule = next.action === "drop" ? next : { ...next, labelled: rule.labelled ?? next.labelled }
    }
    out.set(from, rule)
  }
  return out
}

function textOf(value: EsRichText | null | undefined): string {
  return value?.text ?? ""
}

/** Renames, merges and drops the keys of one experiment in place. */
export function applyKeyRules(experiment: EsExperiment, rules: ReadonlyMap<string, KeyRule>): void {
  const data = experiment.data
  if (!data) return
  const out: NonNullable<EsExperiment["data"]> = {}
  for (const [key, value] of Object.entries(data)) {
    const rule = rules.get(key)
    if (rule === undefined) {
      out[key] = value
      continue
    }
    if (rule.action === "drop") continue

    const heading = rule.labelled === true ? { ja: key, en: key } : rule.labelled
    const headed = (text: string, label: string | undefined) => text === "" || label === undefined ? text : `${label}: ${text}`
    const incoming = heading === undefined || heading === false
      ? value
      : rewritten(headed(textOf(value.ja), heading.ja), headed(textOf(value.en), heading.en))
    const held = out[rule.to]
    if (held === undefined) {
      out[rule.to] = incoming
      continue
    }
    // A line the key already holds is not said twice.
    const join = (a: string, b: string) => {
      const lines = a === "" ? [] : a.split("\n")
      return [...lines, ...b.split("\n").filter((line) => line !== "" && !lines.includes(line))].join("\n")
    }
    out[rule.to] = rewritten(
      join(textOf(held.ja), textOf(incoming.ja)),
      join(textOf(held.en), textOf(incoming.en)),
    )
  }
  experiment.data = out
}

const JGA_KEY = "Japanese Genotype-phenotype Archive Dataset Accession"
const SRA_KEY = "Sequence Read Archive Accession"
const JGA_ACCESSION = /\bJGAD\d{6}\b/g
const SRA_ACCESSION = /\b(?:DRA|SRA|ERA|DRR|DRX|DRS|DRP)\d{6}\b/g

/**
 * v1 copied a cell that listed both archives' accessions into both archives'
 * keys. Where the two keys say the same thing, each keeps its own accessions.
 * A copy that names nothing of one archive is left as it is: emptying a key is
 * not a correction anybody can see was right.
 */
export function splitArchiveAccessions(experiment: EsExperiment): void {
  const data = experiment.data
  const jga = data?.[JGA_KEY]
  const sra = data?.[SRA_KEY]
  if (!data || !jga || !sra) return
  const same = LANGUAGES.every((lang) => textOf(jga[lang]) === textOf(sra[lang]))
  if (!same) return

  const pick = (pattern: RegExp) => (value: EsRichText | null | undefined) =>
    [...new Set(textOf(value).match(pattern) ?? [])].join("\n")
  const jgaOnly = pick(JGA_ACCESSION)
  const sraOnly = pick(SRA_ACCESSION)
  if (LANGUAGES.some((lang) => jgaOnly(jga[lang]) === "" || sraOnly(sra[lang]) === "")) return

  data[JGA_KEY] = rewritten(jgaOnly(jga.ja), jgaOnly(jga.en))
  data[SRA_KEY] = rewritten(sraOnly(sra.ja), sraOnly(sra.en))
}

/** What identifies one block: its heading and every cell's text. */
function fingerprint(experiment: EsExperiment): string {
  return JSON.stringify([
    textOf(experiment.header?.ja),
    textOf(experiment.header?.en),
    Object.entries(experiment.data ?? {}).map(([key, value]) => [key, textOf(value.ja), textOf(value.en)]),
  ])
}

export interface SharedSplit {
  stats: SplitStats
  review: ReviewItem[]
}

/**
 * Gives each dataset its own lines of every block that several of the given
 * datasets carry word for word (`inversion.ts`). The datasets are those one
 * research version lists; a cell the rules cannot settle stays whole on every
 * dataset and is listed for somebody to divide.
 */
export function splitSharedExperiments(
  datasets: readonly { label: string, doc: EsDataset }[],
  jgasToJgad: ReadonlyMap<string, readonly string[]>,
  byHand: HandSplits = new Map(),
): SharedSplit {
  const blocks = new Map<string, { label: string, experiment: EsExperiment }[]>()
  for (const { label, doc } of datasets) {
    for (const experiment of doc.experiments ?? []) {
      const print = fingerprint(experiment)
      blocks.set(print, [...(blocks.get(print) ?? []), { label, experiment }])
    }
  }

  const stats: SplitStats = { split: 0, shared: 0, review: 0, hand: 0 }
  const review: ReviewItem[] = []
  for (const carriers of blocks.values()) {
    const labels = [...new Set(carriers.map((one) => one.label))]
    if (labels.length < 2) continue
    const [sample] = carriers
    if (sample === undefined) continue
    const result = splitSharedBlock(blockDataFromEs(sample.experiment.data), labels, jgasToJgad, byHand)
    stats.split += result.stats.split
    stats.shared += result.stats.shared
    stats.review += result.stats.review
    stats.hand += result.stats.hand
    review.push(...result.review)

    for (const { label, experiment } of carriers) {
      const own = result.perDataset.get(label)
      if (own === undefined || !experiment.data) continue
      for (const [key, value] of Object.entries(experiment.data)) {
        const mine = own[key]
        if (mine === undefined) continue
        if (mine.ja === textOf(value.ja) && mine.en === textOf(value.en)) continue
        experiment.data[key] = rewritten(mine.ja, mine.en)
      }
    }
  }
  return { stats, review }
}

/**
 * Every dataset document a set of versions pins, copied, so that correcting
 * one version's datasets leaves another version's as they were.
 */
export function pinnedCopies(
  held: Dump,
  refs: readonly { datasetId: string, version: string }[],
): { label: string, doc: EsDataset }[] {
  return refs.flatMap((ref) => {
    const doc = held.datasetsByKey.get(datasetKey(ref.datasetId, ref.version))
    return doc === undefined ? [] : [{ label: ref.datasetId, doc: structuredClone(doc) }]
  })
}
