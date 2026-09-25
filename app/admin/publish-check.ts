/**
 * What is checked when a draft is published, and what it means.
 *
 * The checks fall into two kinds and the difference is the whole design. **What
 * is structural stops the publish**: without a hum label and a dataset id there
 * is no address to publish at, and no amount of confirming makes one. Everything
 * else — unfinished content, a disagreement with the upstream system — is
 * **listed for the administrator to pass explicitly**, and the fact that they
 * passed it is written to the trail.
 *
 * Nothing here is checked while a draft is being saved. A draft is expected to
 * be incomplete; that is what a draft is for.
 */

import type { DatasetContent, ResearchContent } from "~/content/types"

import { datasetProblems, researchProblems, type Language } from "./flags"

/** Only the accessions the application system is the authority for. */
export const CHECKED_ACCESSION = /^JGA[DS]\d+$/

export type PublishBlock
  = | { kind: "hum-label-missing" }
    | { kind: "dataset-id-missing", datasetId: string }

export type PublishSubject
  = | { kind: "research" }
    | { kind: "dataset", datasetId: string }

export type PublishFinding
  = | { kind: "unsettled", subject: PublishSubject, path: string, language: Language | null }
    | { kind: "untranslated", subject: PublishSubject, path: string, missing: Language }
    | { kind: "empty-dataset", datasetId: string }
    | { kind: "pin-unknown-upstream", datasetId: string, label: string }
    | { kind: "pin-disagrees-upstream", datasetId: string, label: string, upstreamHumLabel: string }
    /** A file this dataset selects is in the private bucket, so a reader would not get it. */
    | { kind: "private-file", datasetId: string, fileName: string }

export type PublishFindingKind = PublishFinding["kind"]

export const PUBLISH_FINDING_KINDS: readonly PublishFindingKind[] = [
  "unsettled",
  "untranslated",
  "empty-dataset",
  "pin-unknown-upstream",
  "pin-disagrees-upstream",
  "private-file",
]

export interface PublishCheckDataset {
  datasetId: string
  /** The primary dataset id pinned to it. Null is what stops the publish. */
  label: string | null
  /** What publishing would leave as the description. Null means there is none. */
  content: DatasetContent | null
}

export interface PublishCheckInput {
  humLabel: string | null
  content: ResearchContent
  /** The datasets this version has, in the order it has them. */
  datasets: readonly PublishCheckDataset[]
  /**
   * Which hum label the application system holds for each JGA accession. A
   * refresh replaces the whole cache in one transaction, so an accession
   * missing from it is upstream not knowing it rather than the portal not
   * having looked.
   */
  upstream: ReadonlyMap<string, string>
  /**
   * The names sitting in the private bucket. A selection naming one of them
   * would draw nothing on the published page, and making them public is a
   * separate operation from publishing this version — so the publish check lists them
   * and offers to start it.
   *
   * A name in neither bucket is not listed: the selection is a note over the
   * listing, not a claim that the file exists, and it simply does not draw.
   */
  privateFiles: ReadonlySet<string>
}

export interface PublishCheck {
  blocks: PublishBlock[]
  findings: PublishFinding[]
}

export function checkPublish(input: PublishCheckInput): PublishCheck {
  return { blocks: blocksOf(input), findings: findingsOf(input) }
}

function blocksOf(input: PublishCheckInput): PublishBlock[] {
  const blocks: PublishBlock[] = []
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
function findingsOf(input: PublishCheckInput): PublishFinding[] {
  const research: PublishSubject = { kind: "research" }
  const unsettled: PublishFinding[] = []
  const untranslated: PublishFinding[] = []

  const collect = (subject: PublishSubject, problems: ReturnType<typeof researchProblems>): void => {
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

  const empty: PublishFinding[] = input.datasets
    .filter((dataset) => dataset.content === null)
    .map((dataset) => ({ kind: "empty-dataset", datasetId: dataset.datasetId }))

  const privateFiles: PublishFinding[] = input.datasets.flatMap((dataset) =>
    (dataset.content?.fileSelection ?? [])
      .filter((fileName) => input.privateFiles.has(fileName))
      .map((fileName) => ({
        kind: "private-file" as const,
        datasetId: dataset.datasetId,
        fileName,
      })))

  return [
    ...unsettled,
    ...untranslated,
    ...empty,
    ...pinFindings(input),
    ...privateFiles,
  ]
}

/**
 * The application system is the authority for which hum label a JGA accession
 * belongs to, so a pin it does not know and a pin it disagrees with are both
 * worth flagging. Neither stops the publish: upstream has typos of its own, and a
 * portal that cannot publish while upstream is wrong is worse than one that
 * publishes and warns about it.
 */
function pinFindings(input: PublishCheckInput): PublishFinding[] {
  const humLabel = input.humLabel
  if (humLabel === null) return []

  return input.datasets.flatMap((dataset): PublishFinding[] => {
    const label = dataset.label
    if (label === null || !CHECKED_ACCESSION.test(label)) return []
    const upstreamHumLabel = input.upstream.get(label)
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
export function countFindings(findings: readonly PublishFinding[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const finding of findings) {
    counts[finding.kind] = (counts[finding.kind] ?? 0) + 1
  }
  return counts
}
