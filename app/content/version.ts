/**
 * Moving between the two shapes the same content takes.
 *
 * A draft keeps the body in one row and every dataset description in a row of
 * its own; a version keeps the lot in a single value. Publishing merges, and
 * withdrawing or copying splits. Both directions live here so that neither
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

/**
 * The content without the datasets the research no longer has: taken out of
 * the order and out of what each publication names, and nothing else changed.
 *
 * **A dataset is deleted from the research, not from a draft**, and a version
 * keeps naming it. A draft that still named it would have every save refused,
 * since a save names only the research's datasets — so every draft of the
 * research loses it when it goes, and a draft made from a version never gets it.
 */
export function withoutDatasets(content: ResearchContent, kept: (datasetId: string) => boolean): ResearchContent {
  return {
    ...content,
    datasetIds: content.datasetIds.filter(kept),
    relatedPublications: content.relatedPublications.map((publication) =>
      publication.datasetIds.state === "value"
        ? { ...publication, datasetIds: { state: "value", value: publication.datasetIds.value.filter(kept) } }
        : publication),
  }
}
