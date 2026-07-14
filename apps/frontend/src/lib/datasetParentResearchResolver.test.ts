import { describe, expect, mock, test } from "bun:test";

import { QueryClient } from "@tanstack/react-query";

const calls: string[] = [];
const responses = new Map<string, unknown>();

mock.module("@/serverFunctions/datasets", () => ({
  getDatasetParentResearchQueryOptions: ({ datasetId }: { datasetId: string }) => ({
    queryKey: ["datasets", "parentResearch", datasetId],
    queryFn: async () => {
      calls.push(datasetId);
      const response = responses.get(datasetId);
      if (response instanceof Error) throw response;
      return response;
    },
    staleTime: 1000 * 60 * 60,
    retry: false,
  }),
}));

const {
  DATASET_PARENT_HUM_IDS_QUERY_KEY,
  getDatasetParentHumIds,
  prefetchDatasetParentResearches,
} = await import("./datasetParentResearch");

function parentResearch(humId: string, datasetIds: string[]) {
  return {
    data: [
      {
        humId,
        datasets: datasetIds.map((datasetId) => ({ datasetId })),
      },
    ],
  };
}

describe("prefetchDatasetParentResearches", () => {
  test("uses the seed response to skip a sibling dataset", async () => {
    const datasetIds = ["JGAD000003", "JGAD000004"];
    responses.clear();
    calls.length = 0;
    responses.set("JGAD000003", parentResearch("hum0124", ["JGAD000003", "JGAD000004"]));

    const queryClient = new QueryClient();
    await prefetchDatasetParentResearches(queryClient, datasetIds, "ja");

    expect(calls).toEqual(["JGAD000003"]);
    expect(getDatasetParentHumIds(queryClient)).toMatchObject({
      JGAD000003: "hum0124",
      JGAD000004: "hum0124",
    });
    expect(queryClient.getQueryData(DATASET_PARENT_HUM_IDS_QUERY_KEY)).toBeDefined();
  });

  test("marks failed lookups as unresolved", async () => {
    responses.clear();
    calls.length = 0;
    responses.set("JGAD000007", new Error("Not found"));

    const queryClient = new QueryClient();
    await prefetchDatasetParentResearches(queryClient, ["JGAD000007"], "ja");

    expect(getDatasetParentHumIds(queryClient)).toEqual({ JGAD000007: null });
  });
});
