import { describe, expect, test } from "bun:test";

import { getExternalDatasetIds, getExternalDatasetParentHumIds } from "./datasetReferences";

describe("getExternalDatasetIds", () => {
  test("excludes own datasets and de-duplicates external references", () => {
    const research = {
      datasets: [{ datasetId: "JGAD000001" }],
      relatedPublication: [
        { datasetIds: ["JGAD000001", "JGAD000003"] },
        { datasetIds: ["JGAD000003", "JGAD000004"] },
      ],
      controlledAccessUser: [{ datasetIds: ["JGAD000004", "JGAD000005"] }],
    };

    expect(getExternalDatasetIds(research)).toEqual(["JGAD000003", "JGAD000004", "JGAD000005"]);
  });
});

describe("getExternalDatasetParentHumIds", () => {
  test("does not expose a cached parent for a dataset owned by the current research", () => {
    const research = {
      datasets: [{ datasetId: "JGAD000038" }],
      relatedPublication: [{ datasetIds: ["JGAD000038", "JGAD000039"] }],
      controlledAccessUser: [],
    };

    expect(
      getExternalDatasetParentHumIds(research, {
        JGAD000038: "hum0040",
        JGAD000039: "hum0050",
      }),
    ).toEqual({ JGAD000039: "hum0050" });
  });
});
