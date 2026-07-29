import { describe, expect, test } from "bun:test";

import { getAddedDatasets } from "./-releaseDatasets";

describe("getAddedDatasets", () => {
  test("uses the oldest release as the baseline", () => {
    const datasets = [{ datasetId: "JGAD000001" }, { datasetId: "JGAD000002" }];

    expect(getAddedDatasets(datasets)).toEqual(datasets);
  });

  test("returns only dataset IDs absent from the preceding release", () => {
    const previousDatasets = [{ datasetId: "JGAD000001" }, { datasetId: "JGAD000002" }];
    const currentDatasets = [
      { datasetId: "JGAD000001" },
      { datasetId: "JGAD000002" },
      { datasetId: "JGAD000003" },
    ];

    expect(getAddedDatasets(currentDatasets, previousDatasets)).toEqual([
      { datasetId: "JGAD000003" },
    ]);
  });

  test("returns no datasets when a release adds none", () => {
    const datasets = [{ datasetId: "JGAD000001" }];

    expect(getAddedDatasets(datasets, datasets)).toEqual([]);
  });
});
