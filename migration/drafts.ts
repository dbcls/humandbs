/**
 * Choosing the drafts a v1 dump holds.
 *
 * v1 keeps a draft as a research version numbered above the research's latest
 * published one; a research that was never published has only such versions.
 * Each becomes a v2 draft of the next version, and the datasets it lists get a
 * draft entry described by the document version the draft pins.
 */

import { datasetKey, versionNumber, type EsDataset, type EsResearch, type EsResearchVersion } from "./es"

export interface DraftDataset {
  label: string
  doc: EsDataset
}

export interface SelectedDraft {
  version: EsResearchVersion
  /** Whether the research already has a published version this draft follows. */
  updatesPublished: boolean
  /** In the order the draft lists them. */
  datasets: DraftDataset[]
}

export interface DraftSelection {
  drafts: SelectedDraft[]
  /** Versions of a research the dump does not hold. */
  orphanVersions: string[]
  /** Versions whose number is not `v{n}`, so their place cannot be told. */
  unreadableVersions: string[]
  /**
   * Lower drafts of a research that holds more than one. The highest is the
   * one being written; the others were left behind by it.
   */
  supersededDrafts: string[]
  missingDocuments: { humVersionId: string, label: string }[]
}

export function selectDrafts(
  research: Map<string, EsResearch>,
  versions: EsResearchVersion[],
  datasetsByKey: Map<string, EsDataset>,
): DraftSelection {
  const orphanVersions: string[] = []
  const unreadableVersions: string[] = []
  const highest = new Map<string, EsResearchVersion[]>()

  for (const rv of versions) {
    const held = research.get(rv.humId)
    if (held === undefined) {
      orphanVersions.push(rv.humVersionId)
      continue
    }
    const number = versionNumber(rv.version)
    if (number === null) {
      unreadableVersions.push(rv.humVersionId)
      continue
    }
    if (number <= (versionNumber(held.latestVersion) ?? 0)) continue
    highest.set(rv.humId, [...(highest.get(rv.humId) ?? []), rv])
  }

  const drafts: SelectedDraft[] = []
  const supersededDrafts: string[] = []
  const missingDocuments: { humVersionId: string, label: string }[] = []

  for (const humId of [...highest.keys()].sort()) {
    const [top, ...rest] = [...(highest.get(humId) ?? [])]
      .sort((a, b) => (versionNumber(b.version) ?? 0) - (versionNumber(a.version) ?? 0))
    if (top === undefined) continue
    supersededDrafts.push(...rest.map((rv) => rv.humVersionId))

    const datasets: DraftDataset[] = []
    for (const ref of top.datasets ?? []) {
      const doc = datasetsByKey.get(datasetKey(ref.datasetId, ref.version))
      if (doc === undefined) {
        missingDocuments.push({ humVersionId: top.humVersionId, label: ref.datasetId })
        continue
      }
      datasets.push({ label: ref.datasetId, doc })
    }

    drafts.push({
      version: top,
      updatesPublished: versionNumber(research.get(humId)?.latestVersion) !== null,
      datasets,
    })
  }

  return { drafts, orphanVersions, unreadableVersions, supersededDrafts, missingDocuments }
}
