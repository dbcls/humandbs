/**
 * What is checked when a draft is published, and what it means.
 *
 * The checks fall into two kinds and the difference is the whole design. **What
 * is structural stops the publish**: without a hum label and a dataset id there
 * is no address to publish at, and no amount of confirming makes one. Everything
 * else — unfinished content, a disagreement with the upstream system, a
 * colleague's edit this draft would write over — is **listed for the
 * administrator to pass explicitly**, and the fact that they passed it is
 * written to the trail.
 *
 * Nothing here is checked while a draft is being saved. A draft is expected to
 * be incomplete; that is what a draft is for.
 *
 * The upstream check is skipped entirely while the cache has never been
 * fetched. An empty cache read as "upstream does not know this accession" would
 * list every dataset, and a list that is always long is a list nobody reads.
 */

import type { DatasetContent, ResearchContent } from "~/content/types"

import { datasetProblems, researchProblems, type Language } from "./flags"
import { isEmptyThreeWay, type ThreeWay } from "./merge"

/** Only the accessions the application system is the authority for. */
const CHECKED_ACCESSION = /^JGA[DS]\d+$/

export type GateBlock
  = | { kind: "hum-label-missing" }
    | { kind: "dataset-id-missing", datasetId: string }

export type GateSubject
  = | { kind: "research" }
    | { kind: "dataset", datasetId: string }

export type GateFinding
  = | { kind: "unsettled", subject: GateSubject, path: string, language: Language | null }
    | { kind: "untranslated", subject: GateSubject, path: string, missing: Language }
    | { kind: "empty-dataset", datasetId: string }
    | { kind: "dropped-dataset", datasetId: string }
    /** Somebody published over this dataset after the draft started editing it. */
    | { kind: "upstream-edited", datasetId: string, theirs: number, both: number }
    | { kind: "pin-unknown-upstream", datasetId: string, label: string }
    | { kind: "pin-disagrees-upstream", datasetId: string, label: string, upstreamHumLabel: string }

export type GateFindingKind = GateFinding["kind"]

export const GATE_FINDING_KINDS: readonly GateFindingKind[] = [
  "unsettled",
  "untranslated",
  "empty-dataset",
  "dropped-dataset",
  "upstream-edited",
  "pin-unknown-upstream",
  "pin-disagrees-upstream",
]

export interface GateDataset {
  datasetId: string
  /** The primary dataset id pinned to it. Null is what stops the publish. */
  label: string | null
  /** What publishing would leave as the description. Null means there is none. */
  content: DatasetContent | null
  /** Set when the draft edited it and the published description moved since. */
  upstream: ThreeWay | null
}

export interface UpstreamAccessions {
  /** False until the cache has been fetched once, which skips the check. */
  loaded: boolean
  humLabelOf: ReadonlyMap<string, string>
}

export interface GateInput {
  humLabel: string | null
  content: ResearchContent
  /** The datasets this version lists, in the order it lists them. */
  datasets: readonly GateDataset[]
  /** What the most recent published version listed, for spotting what fell off. */
  previousDatasetIds: readonly string[]
  upstream: UpstreamAccessions
}

export interface PublishGate {
  blocks: GateBlock[]
  findings: GateFinding[]
}

export function publishGate(input: GateInput): PublishGate {
  return { blocks: blocksOf(input), findings: findingsOf(input) }
}

function blocksOf(input: GateInput): GateBlock[] {
  const blocks: GateBlock[] = []
  if (input.humLabel === null) blocks.push({ kind: "hum-label-missing" })
  for (const dataset of input.datasets) {
    if (dataset.label === null) blocks.push({ kind: "dataset-id-missing", datasetId: dataset.datasetId })
  }
  return blocks
}

/**
 * Grouped by kind rather than by subject, because that is how they are read:
 * "twelve values are unsettled" is the question, and which twelve is the detail
 * underneath it.
 */
function findingsOf(input: GateInput): GateFinding[] {
  const research: GateSubject = { kind: "research" }
  const unsettled: GateFinding[] = []
  const untranslated: GateFinding[] = []

  const collect = (subject: GateSubject, problems: ReturnType<typeof researchProblems>): void => {
    for (const field of problems.unsettled) {
      unsettled.push({ kind: "unsettled", subject, path: field.path, language: field.language })
    }
    for (const field of problems.untranslated) {
      untranslated.push({ kind: "untranslated", subject, path: field.path, missing: field.missing })
    }
  }

  collect(research, researchProblems(input.content))
  for (const dataset of input.datasets) {
    if (dataset.content === null) continue
    collect({ kind: "dataset", datasetId: dataset.datasetId }, datasetProblems(dataset.content))
  }

  const empty: GateFinding[] = input.datasets
    .filter((dataset) => dataset.content === null)
    .map((dataset) => ({ kind: "empty-dataset", datasetId: dataset.datasetId }))

  const listed = new Set(input.datasets.map((dataset) => dataset.datasetId))
  const dropped: GateFinding[] = input.previousDatasetIds
    .filter((datasetId) => !listed.has(datasetId))
    .map((datasetId) => ({ kind: "dropped-dataset", datasetId }))

  const edited: GateFinding[] = input.datasets.flatMap((dataset) => {
    const upstream = dataset.upstream
    if (upstream === null || isEmptyThreeWay(upstream)) return []
    return [{
      kind: "upstream-edited" as const,
      datasetId: dataset.datasetId,
      theirs: upstream.theirs.length,
      both: upstream.both.length,
    }]
  })

  return [...unsettled, ...untranslated, ...empty, ...dropped, ...edited, ...pinFindings(input)]
}

/**
 * The application system is the authority for which hum label a JGA accession
 * belongs to, so a pin it does not know and a pin it disagrees with are both
 * worth saying. Neither stops the publish: upstream has typos of its own, and a
 * portal that cannot publish while upstream is wrong is worse than one that
 * publishes and says so.
 */
function pinFindings(input: GateInput): GateFinding[] {
  const humLabel = input.humLabel
  if (!input.upstream.loaded || humLabel === null) return []

  return input.datasets.flatMap((dataset): GateFinding[] => {
    const label = dataset.label
    if (label === null || !CHECKED_ACCESSION.test(label)) return []
    const upstreamHumLabel = input.upstream.humLabelOf.get(label)
    if (upstreamHumLabel === undefined) {
      return [{ kind: "pin-unknown-upstream", datasetId: dataset.datasetId, label }]
    }
    if (upstreamHumLabel === humLabel) return []
    return [{ kind: "pin-disagrees-upstream", datasetId: dataset.datasetId, label, upstreamHumLabel }]
  })
}

/**
 * How many of each kind were passed. This is what the trail records: which
 * fields were unsettled is recoverable from the snapshot the publish wrote, so
 * repeating them here would be a second copy of the same content.
 */
export function countFindings(findings: readonly GateFinding[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const finding of findings) {
    counts[finding.kind] = (counts[finding.kind] ?? 0) + 1
  }
  return counts
}
