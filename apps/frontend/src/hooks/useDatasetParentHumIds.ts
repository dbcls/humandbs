import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useMemo } from "react";

import type { ResearchDetailResponse } from "@humandbs/backend/types";

import type { Locale } from "@/config/i18n";
import {
  DATASET_PARENT_HUM_IDS_QUERY_KEY,
  DATASET_PARENT_HUM_IDS_STALE_TIME,
  getExternalDatasetIds,
  getExternalDatasetParentHumIds,
  prefetchDatasetParentResearches,
} from "@/lib/datasetParentResearch";

export function useDatasetParentHumIds(
  research: Pick<
    ResearchDetailResponse["data"],
    "datasets" | "relatedPublication" | "controlledAccessUser"
  >,
  lang: Locale,
) {
  const queryClient = useQueryClient();
  const externalDatasetIds = useMemo(() => getExternalDatasetIds(research), [research]);
  const { data: parentHumIds = {} } = useQuery({
    queryKey: DATASET_PARENT_HUM_IDS_QUERY_KEY,
    queryFn: (): Record<string, string | null> => ({}),
    staleTime: DATASET_PARENT_HUM_IDS_STALE_TIME,
    gcTime: DATASET_PARENT_HUM_IDS_STALE_TIME,
    enabled: false,
  });

  useEffect(() => {
    void prefetchDatasetParentResearches(queryClient, externalDatasetIds, lang);
  }, [externalDatasetIds, lang, queryClient]);

  return useMemo(
    () => getExternalDatasetParentHumIds(research, parentHumIds),
    [parentHumIds, research],
  );
}
