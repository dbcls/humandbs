import type { QueryClient } from "@tanstack/react-query";

import type { Locale } from "@/config/i18n";
import { getDatasetParentResearchQueryOptions } from "@/serverFunctions/datasets";

export { getExternalDatasetIds, getExternalDatasetParentHumIds } from "./datasetReferences";

export const DATASET_PARENT_HUM_IDS_QUERY_KEY = ["datasets", "parentHumIds"] as const;
export const DATASET_PARENT_HUM_IDS_STALE_TIME = 1000 * 60 * 60;
export const DATASET_PARENT_LOOKUP_CONCURRENCY = 3;

/** `null` is a cached failed or inaccessible lookup. */
export type DatasetParentHumIds = Record<string, string | null>;

export function getDatasetParentHumIds(queryClient: QueryClient): DatasetParentHumIds {
  return queryClient.getQueryData<DatasetParentHumIds>(DATASET_PARENT_HUM_IDS_QUERY_KEY) ?? {};
}

function updateDatasetParentHumIds(
  queryClient: QueryClient,
  update: (current: DatasetParentHumIds) => DatasetParentHumIds,
) {
  queryClient.setQueryData<DatasetParentHumIds>(DATASET_PARENT_HUM_IDS_QUERY_KEY, (current) =>
    update(current ?? {}),
  );
}

function cacheUnresolvedDatasetId(queryClient: QueryClient, datasetId: string) {
  updateDatasetParentHumIds(queryClient, (current) => ({ ...current, [datasetId]: null }));
}

function cacheParentResearch(
  queryClient: QueryClient,
  datasetId: string,
  parentResearch: {
    humId: string;
    datasets: ReadonlyArray<{ datasetId: string }>;
  },
) {
  updateDatasetParentHumIds(queryClient, (current) => ({
    ...current,
    [datasetId]: parentResearch.humId,
    ...Object.fromEntries(
      parentResearch.datasets.map(({ datasetId: parentDatasetId }) => [
        parentDatasetId,
        parentResearch.humId,
      ]),
    ),
  }));
}

/**
 * Resolves one seed ID before using a bounded pool. Every successful lookup adds
 * all sibling datasets from the parent research to the shared mapping cache, so
 * later queued IDs can be resolved without another API request.
 */
export async function prefetchDatasetParentResearches(
  queryClient: QueryClient,
  datasetIds: readonly string[],
  lang: Locale,
): Promise<void> {
  queryClient.setQueryDefaults(DATASET_PARENT_HUM_IDS_QUERY_KEY, {
    staleTime: DATASET_PARENT_HUM_IDS_STALE_TIME,
    gcTime: DATASET_PARENT_HUM_IDS_STALE_TIME,
  });
  const claimedDatasetIds = new Set<string>();
  const uniqueDatasetIds = [...new Set(datasetIds)];

  function claimNextDatasetId(): string | undefined {
    const cachedParentHumIds = getDatasetParentHumIds(queryClient);
    const datasetId = uniqueDatasetIds.find(
      (id) => cachedParentHumIds[id] === undefined && !claimedDatasetIds.has(id),
    );
    if (datasetId) claimedDatasetIds.add(datasetId);
    return datasetId;
  }

  async function resolveDatasetId(datasetId: string) {
    try {
      const result = await queryClient.fetchQuery(
        getDatasetParentResearchQueryOptions({ datasetId, lang }),
      );
      const parentResearch = result.data[0];
      if (parentResearch) cacheParentResearch(queryClient, datasetId, parentResearch);
      else cacheUnresolvedDatasetId(queryClient, datasetId);
    } catch {
      cacheUnresolvedDatasetId(queryClient, datasetId);
    }
  }

  async function resolveDatasetParents() {
    for (let datasetId = claimNextDatasetId(); datasetId; datasetId = claimNextDatasetId()) {
      await resolveDatasetId(datasetId);
    }
  }

  // Seed the map before starting the three-request pool, so two references to
  // the same parent can be collapsed into one request whenever possible.
  const seedDatasetId = claimNextDatasetId();
  if (!seedDatasetId) return;
  await resolveDatasetId(seedDatasetId);

  await Promise.all(
    Array.from(
      { length: Math.min(DATASET_PARENT_LOOKUP_CONCURRENCY, uniqueDatasetIds.length) },
      () => resolveDatasetParents(),
    ),
  );
}
