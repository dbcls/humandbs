/**
 * Reading a research's published versions as a sequence.
 *
 * **The set comes first, the numbers second.** Which versions are visible is
 * decided by what is in the published set; the numbers only order what is
 * already there. A withdrawn version leaves a gap, and treating "everything up
 * to the highest number" as visible is exactly how v1 leaked unpublished
 * versions to the public side.
 *
 * The same rule decides what the release list says was added in a version: the
 * comparison is against the previous *published* version, so a dataset that
 * arrived in a version that was later withdrawn shows up as added in the next
 * one that is still visible. There is no version the reader can open that the
 * list describes against something they cannot.
 */

export interface PublishedVersion {
  number: number
  releaseDate: string
  /** Dataset identities this version lists, in the order it lists them. */
  datasetIds: string[]
}

/** Newest first, which is the order the release list is read in. */
export function byNewest<T extends { number: number }>(versions: readonly T[]): T[] {
  return [...versions].sort((a, b) => b.number - a.number)
}

export function latestOf<T extends { number: number }>(versions: readonly T[]): T | null {
  return versions.reduce<T | null>((best, v) => (best === null || v.number > best.number ? v : best), null)
}

export function findVersion<T extends { number: number }>(
  versions: readonly T[],
  number: number,
): T | null {
  return versions.find((v) => v.number === number) ?? null
}

/**
 * Dataset identities each version added, keyed by version number. The oldest
 * published version counts everything it lists as added — there is no earlier
 * visible version to have carried them.
 */
export function datasetsAddedByVersion(
  versions: readonly PublishedVersion[],
): Map<number, string[]> {
  const ordered = byNewest(versions)
  const added = new Map<number, string[]>()
  ordered.forEach((version, index) => {
    const previous = ordered[index + 1]
    const before = new Set(previous?.datasetIds ?? [])
    added.set(version.number, version.datasetIds.filter((id) => !before.has(id)))
  })
  return added
}
