type DatasetReferences = {
  datasets: ReadonlyArray<{ datasetId: string }>;
  relatedPublication: ReadonlyArray<{ datasetIds?: ReadonlyArray<string> }>;
  controlledAccessUser: ReadonlyArray<{ datasetIds?: ReadonlyArray<string> }>;
};

type DatasetParentHumIds = Record<string, string | null>;

export function getExternalDatasetIds(research: DatasetReferences): string[] {
  const ownDatasetIds = new Set(research.datasets.map(({ datasetId }) => datasetId));
  const referencedDatasetIds = [
    ...research.relatedPublication.flatMap(({ datasetIds }) => datasetIds ?? []),
    ...research.controlledAccessUser.flatMap(({ datasetIds }) => datasetIds ?? []),
  ];

  return [...new Set(referencedDatasetIds.filter((datasetId) => !ownDatasetIds.has(datasetId)))];
}

/**
 * The parent-research cache is shared across pages. Only expose entries for IDs
 * that are external to the research currently being rendered.
 */
export function getExternalDatasetParentHumIds(
  research: DatasetReferences,
  parentHumIds: DatasetParentHumIds,
): DatasetParentHumIds {
  return Object.fromEntries(
    getExternalDatasetIds(research).flatMap((datasetId) => {
      const parentHumId = parentHumIds[datasetId];
      return parentHumId === undefined ? [] : [[datasetId, parentHumId]];
    }),
  );
}
