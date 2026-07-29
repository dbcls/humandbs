type DatasetReference = { datasetId: string };

/**
 * Returns the datasets introduced by a release. The first (oldest) release
 * has no predecessor, so its full dataset list establishes the baseline.
 */
export function getAddedDatasets<T extends DatasetReference>(
  currentDatasets: T[],
  previousDatasets?: readonly DatasetReference[],
): T[] {
  if (!previousDatasets) return currentDatasets;

  const previousDatasetIds = new Set(previousDatasets.map(({ datasetId }) => datasetId));
  return currentDatasets.filter(({ datasetId }) => !previousDatasetIds.has(datasetId));
}
