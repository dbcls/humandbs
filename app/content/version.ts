/**
 * Moving between the two shapes the same content takes.
 *
 * A draft keeps the body in one row and every dataset description in a row of
 * its own; a version keeps the lot in a single value. Publishing folds, and
 * withdrawing or copying unfolds. Both directions live here so that neither
 * side has to know the other's table.
 */

import type {
  DatasetContent,
  PublishedDataset,
  ResearchContent,
  VersionContent,
} from "./types"

/** A version's body in the shape a draft holds it: the listing by identity. */
export function draftContentOf(content: VersionContent): ResearchContent {
  const { datasets, ...body } = content
  return { ...body, datasetIds: datasets.map((row) => row.datasetId) }
}

/** One dataset of a version, without the identity the version files it under. */
export function descriptionOf(row: PublishedDataset): DatasetContent {
  const { datasetId, ...content } = row
  void datasetId
  return content
}

/** The descriptions of a version, by the identity each belongs to. */
export function describedBy(
  content: VersionContent | undefined,
): Map<string, PublishedDataset> {
  return new Map((content?.datasets ?? []).map((row) => [row.datasetId, row] as const))
}
