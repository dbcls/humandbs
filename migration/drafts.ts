/**
 * Choosing the drafts a v1 dump holds.
 *
 * v1 keeps a draft as a research version numbered above the research's latest
 * published one; a research that was never published has only such versions.
 * Each becomes a v2 draft of the next version, and the datasets it lists get a
 * draft entry described by the document version the draft pins.
 */

import { datasetKey, versionNumber, type Dump, type EsDataset, type EsResearch, type EsResearchVersion } from "./es"

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
  /** What admins call the draft, where it is not the planned version. */
  name?: string
  /** The administrators' memo the draft starts with. */
  memo?: string
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

/**
 * Datasets of one research the archive withdrew after publishing them
 * (`hand/withdrawn.json`), and the name and the memo of the draft that keeps them.
 */
export interface WithdrawnData {
  hum: string
  datasets: string[]
  draftName: string
  memo: string
}

/**
 * A draft for each research whose datasets the archive withdrew after
 * publishing them. **The portal stops listing the datasets, and keeps them in
 * a draft**: the research's latest published version, listing those datasets
 * only, each described by the document that version pins. Publishing the draft
 * once the archive has them again lists them again.
 */
export function withdrawnDrafts(held: Dump, withdrawn: readonly WithdrawnData[]): SelectedDraft[] {
  return withdrawn.map((one) => {
    const latest = held.latestVersion.get(one.hum)
    if (latest === undefined) throw new Error(`${one.hum} has withdrawn datasets but no published version`)
    const refs = (latest.datasets ?? []).filter((ref) => one.datasets.includes(ref.datasetId))
    const unlisted = one.datasets.filter((label) => !refs.some((ref) => ref.datasetId === label))
    if (unlisted.length > 0) throw new Error(`${one.hum}'s latest version does not list ${unlisted.join(", ")}`)
    const datasets = refs.map((ref) => {
      const doc = held.datasetsByKey.get(datasetKey(ref.datasetId, ref.version))
      if (doc === undefined) throw new Error(`${one.hum} pins ${ref.datasetId} ${ref.version}, which the dump does not hold`)
      return { label: ref.datasetId, doc }
    })
    return { version: { ...latest, datasets: refs }, updatesPublished: true, datasets, name: one.draftName, memo: one.memo }
  })
}

/**
 * A draft the source held beside the one v1 converted (`es-drafts-alongside/`):
 * the source's site had two pages of the research's next version, and v1
 * converted only the other one. The name and the memo tell admins apart the
 * two drafts of the research.
 */
export interface AlongsideDraft {
  humVersionId: string
  name: string
  memo: string
}

/**
 * The drafts the source held beside the ones v1 converted, each from its own
 * converted version. **They are drafts beside the research's other draft, and
 * replace nothing.** A version, a research or a dataset document the list names
 * that is not there stops the load: the list was written against the input.
 */
export function alongsideDrafts(held: Dump, versions: readonly EsResearchVersion[], alongside: readonly AlongsideDraft[]): SelectedDraft[] {
  return alongside.map((one) => {
    const version = versions.find((rv) => rv.humVersionId === one.humVersionId)
    if (version === undefined) throw new Error(`no converted version ${one.humVersionId} for a draft alongside`)
    const research = held.research.get(version.humId)
    if (research === undefined) throw new Error(`${one.humVersionId} is a draft of ${version.humId}, which the dump does not hold`)
    const datasets = (version.datasets ?? []).map((ref) => {
      const doc = held.datasetsByKey.get(datasetKey(ref.datasetId, ref.version))
      if (doc === undefined) throw new Error(`${one.humVersionId} pins ${ref.datasetId} ${ref.version}, which the dump does not hold`)
      return { label: ref.datasetId, doc }
    })
    return { version, updatesPublished: versionNumber(research.latestVersion) !== null, datasets, name: one.name, memo: one.memo }
  })
}
