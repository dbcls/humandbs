/**
 * Corrections made to a v1 dump before it is built into v2 content.
 *
 * Each works on the dump's own shape, so the build that follows reads the
 * corrected dump the way it reads an untouched one. A cell whose text is
 * rewritten here loses its HTML: `rawHtml` is what the text was extracted
 * from, and a text that no longer came from it must not be recovered out of it.
 */

import { datasetKey, type Dump, type EsDataset, type EsExperiment, type EsResearchVersion, type EsRichText } from "./es"
import { blockDataFromEs, blockNames, pinnedByAddress, splitSharedBlock, type HandSplits, type ReviewItem, type SplitStats } from "./inversion"

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

/** A dataset v1 never took in, and the research versions whose article listed it. */
export interface RestoredDataset {
  datasetId: string
  version: string
  /** `humVersionId` of every version whose data ID table lists it. */
  listedBy: string[]
}

/**
 * The dump with the datasets v1 dropped put back, each listed by the versions
 * whose article listed it.
 *
 * **Nothing already in the dump is replaced**, and a dataset or a version the
 * list names that is not there stops the load: the list was written against the
 * input.
 */
export function restoreDatasets(held: Dump, docs: readonly EsDataset[], restored: readonly RestoredDataset[]): Dump {
  const datasetsByKey = new Map(held.datasetsByKey)
  const addTo = new Map<string, { datasetId: string, version: string }[]>()
  const known = new Set(held.versions.map((v) => v.humVersionId))
  for (const one of restored) {
    const key = datasetKey(one.datasetId, one.version)
    if (datasetsByKey.has(key)) throw new Error(`${key} is already in the dump`)
    const doc = docs.find((d) => d.datasetId === one.datasetId && d.version === one.version)
    if (doc === undefined) throw new Error(`no document for ${key}`)
    datasetsByKey.set(key, doc)
    for (const humVersionId of one.listedBy) {
      if (!known.has(humVersionId)) throw new Error(`${key} is listed by ${humVersionId}, which is not in the dump`)
      addTo.set(humVersionId, [...addTo.get(humVersionId) ?? [], { datasetId: one.datasetId, version: one.version }])
    }
  }
  // One copy per version, shared by every list that holds it: the load tells
  // the latest version by identity (`latestVersion.get(humId) === version`).
  const copies = new Map<EsResearchVersion, EsResearchVersion>()
  const withRefs = (version: EsResearchVersion): EsResearchVersion => {
    const refs = addTo.get(version.humVersionId)
    if (refs === undefined) return version
    const copy = copies.get(version) ?? { ...version, datasets: [...version.datasets ?? [], ...refs] }
    copies.set(version, copy)
    return copy
  }
  return {
    research: held.research,
    publishedVersions: held.publishedVersions.map(withRefs),
    latestVersion: new Map([...held.latestVersion].map(([humId, version]) => [humId, withRefs(version)])),
    datasetsByKey,
    versions: held.versions.map(withRefs),
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
 * The dump without the given datasets: their documents, and every version's
 * and publication's reference to them. For a dataset the archive withdrew
 * after publishing it, which the portal stops listing too.
 */
export function dropDatasets(held: Dump, labels: readonly string[]): Dump {
  const gone = new Set(labels)
  // One copy per version, shared by every list that holds it: the load tells
  // the latest version by identity (`latestVersion.get(humId) === version`).
  const copies = new Map<EsResearchVersion, EsResearchVersion>()
  const withoutRefs = (version: EsResearchVersion): EsResearchVersion => {
    const held = copies.get(version)
    if (held !== undefined) return held
    const copy = {
      ...version,
      datasets: version.datasets?.filter((ref) => !gone.has(ref.datasetId)) ?? version.datasets,
      relatedPublication: version.relatedPublication?.map((one) => ({
        ...one,
        datasetIds: one.datasetIds?.filter((id) => !gone.has(id)) ?? one.datasetIds,
      })) ?? version.relatedPublication,
    }
    copies.set(version, copy)
    return copy
  }
  return {
    research: held.research,
    publishedVersions: held.publishedVersions.map(withoutRefs),
    latestVersion: new Map([...held.latestVersion].map(([humId, version]) => [humId, withoutRefs(version)])),
    datasetsByKey: new Map([...held.datasetsByKey].filter(([, d]) => !gone.has(d.datasetId))),
    versions: held.versions.map(withoutRefs),
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

/**
 * Renames, merges and drops the keys of one experiment in place. The keys that
 * stay are placed first, so a key merged into one of them follows that key's
 * own value whatever order the dump wrote the two in.
 */
export function applyKeyRules(experiment: EsExperiment, rules: ReadonlyMap<string, KeyRule>): void {
  const data = experiment.data
  if (!data) return
  const out: NonNullable<EsExperiment["data"]> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!rules.has(key)) out[key] = value
  }
  for (const [key, value] of Object.entries(data)) {
    const rule = rules.get(key)
    if (rule === undefined || rule.action === "drop") continue

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
 * A copy that lists nothing of one archive is left as it is: emptying a key is
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

/**
 * A dataset's experiments settled by hand (`hand/experiment-edits.json`):
 *
 * - `keep` leaves the dataset only the experiments named, each by its heading
 *   and, where two share one, by an ID the block writes. v1 pinned a JGA
 *   study's sections to every dataset of the study, and a section's JGAS to
 *   every dataset of that study, so a dataset JGA processed out of another
 *   (`Processed by JGA: JGAD000220`) has the research's other sections too.
 *   It is made once the blocks are divided, so the others divide a block as
 *   they were written with it. A document that has none of the experiments
 *   named, one older than the dataset's own section, is left as it is;
 * - `whole` keeps the dataset's blocks whole where several datasets share them:
 *   the block is the dataset's section, and the lines naming the archives and
 *   studies its data comes from are about it as well.
 *
 * An edit that lands nowhere stops the load.
 */
export type ExperimentEdit
  = | { op: "keep", hum: string, dataset: string, experiments: { header: string, names?: string }[], note?: string }
    | { op: "whole", hum: string, dataset: string, note?: string }

/** Takes off each dataset the experiments a `keep` edit does not name; the number taken off. */
export function keepExperiments(docs: Iterable<EsDataset>, edits: readonly ExperimentEdit[], applied: Set<ExperimentEdit>): number {
  let taken = 0
  for (const doc of docs) {
    for (const edit of edits) {
      if (edit.op !== "keep" || edit.hum !== doc.humId || edit.dataset !== doc.datasetId) continue
      const experiments = doc.experiments ?? []
      const kept = new Set<EsExperiment>()
      for (const one of edit.experiments) {
        const found = experiments.filter((experiment) => textOf(experiment.header?.ja) === one.header
          && (one.names === undefined || blockNames(blockDataFromEs(experiment.data), one.names)))
        if (found.length > 1) throw new Error(`${edit.dataset} ${doc.version} has ${found.length} experiments ${one.header} ${one.names ?? ""}`)
        for (const experiment of found) kept.add(experiment)
      }
      if (kept.size === 0) continue
      applied.add(edit)
      taken += experiments.length - kept.size
      doc.experiments = experiments.filter((experiment) => kept.has(experiment))
    }
  }
  return taken
}

/** Stops the load if an edit found nothing to act on. */
export function assertExperimentEditsApplied(edits: readonly ExperimentEdit[], applied: ReadonlySet<ExperimentEdit>): void {
  const unlanded = edits.filter((edit) => !applied.has(edit))
  if (unlanded.length > 0) throw new Error(`experiment edits that found nothing:\n${unlanded.map((edit) => `${edit.op} ${edit.hum} ${edit.dataset}`).join("\n")}`)
}

export interface SharedSplit {
  stats: SplitStats
  review: ReviewItem[]
  /** The datasets a block was taken from, pinned to them by a link's address alone (`pinnedByAddress`). */
  unpinned: { label: string, heading: string }[]
}

/**
 * Gives each dataset its own lines of every block that several of the given
 * datasets share word for word (`inversion.ts`). The datasets are those one
 * research version lists; a cell the rules cannot settle stays whole on every
 * dataset and is listed for somebody to divide.
 *
 * A block pinned to a dataset by a link's address alone is taken from it
 * first, unless it is the only block the dataset has: the dataset that block
 * names has the same block word for word. A dataset a `whole` edit names keeps
 * the block as it is, and the others get what the division gives them.
 */
export function splitSharedExperiments(
  datasets: readonly { label: string, doc: EsDataset }[],
  jgasToJgad: ReadonlyMap<string, readonly string[]>,
  byHand: HandSplits = new Map(),
  whole: { edits: readonly ExperimentEdit[], applied: Set<ExperimentEdit> } = { edits: [], applied: new Set() },
): SharedSplit {
  const blocks = new Map<string, { label: string, doc: EsDataset, experiment: EsExperiment }[]>()
  for (const { label, doc } of datasets) {
    for (const experiment of doc.experiments ?? []) {
      const print = fingerprint(experiment)
      blocks.set(print, [...(blocks.get(print) ?? []), { label, doc, experiment }])
    }
  }

  const stats: SplitStats = { split: 0, shared: 0, review: 0, hand: 0 }
  const review: ReviewItem[] = []
  const unpinned: SharedSplit["unpinned"] = []
  for (const pinned of blocks.values()) {
    const [sample] = pinned
    if (sample === undefined) continue
    const data = blockDataFromEs(sample.experiment.data)
    const byAddress = new Set(pinnedByAddress(data, [...new Set(pinned.map((one) => one.label))]))
    const holders = pinned.filter(({ label, doc, experiment }) => {
      const experiments = doc.experiments ?? []
      if (!byAddress.has(label) || experiments.length < 2) return true
      doc.experiments = experiments.filter((one) => one !== experiment)
      unpinned.push({ label, heading: textOf(experiment.header?.ja) })
      return false
    })
    const labels = [...new Set(holders.map((one) => one.label))]
    if (labels.length < 2) continue
    const result = splitSharedBlock(data, labels, jgasToJgad, byHand)
    const kept = new Set(whole.edits.filter((edit) => edit.op === "whole" && labels.includes(edit.dataset)
      && holders.some((one) => one.label === edit.dataset && one.doc.humId === edit.hum)).map((edit) => {
      whole.applied.add(edit)
      return edit.dataset
    }))
    stats.split += result.stats.split
    stats.shared += result.stats.shared
    stats.review += result.stats.review
    stats.hand += result.stats.hand
    review.push(...result.review.filter((one) => !kept.has(one.dataset)))

    for (const { label, experiment } of holders) {
      if (kept.has(label)) continue
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
  return { stats, review, unpinned }
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
