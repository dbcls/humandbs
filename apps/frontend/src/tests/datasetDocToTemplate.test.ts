import { describe, expect, test } from "bun:test";

import type { DatasetDoc } from "../lib/types";
import { datasetDocToTemplate } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/datasetDocToTemplate";

const baseDoc: DatasetDoc = {
  datasetId: "JGAD000001",
  version: "v1",
  versionReleaseDate: "2024-01-01",
  humId: "hum0001",
  humVersionId: "hum0001-v1",
  releaseDate: "2024-01-01",
  criteria: "Controlled-access (Type I)",
  typeOfData: { ja: "全ゲノム", en: "WGS" },
  experiments: [],
};

function makeDoc(overrides: Partial<DatasetDoc>): DatasetDoc {
  return { ...baseDoc, ...overrides };
}

describe("datasetDocToTemplate – identity", () => {
  test("never copies datasetId, regardless of the source id", () => {
    const result = datasetDocToTemplate(makeDoc({ datasetId: "JGAD999999" }));
    expect("datasetId" in result).toBe(false);
    expect(result.datasetId).toBeUndefined();
  });
});

describe("datasetDocToTemplate – releaseDate / criteria normalization", () => {
  test("present values pass through", () => {
    const result = datasetDocToTemplate(
      makeDoc({ releaseDate: "2025-06-01", criteria: "Unrestricted-access" }),
    );
    expect(result.releaseDate).toBe("2025-06-01");
    expect(result.criteria).toBe("Unrestricted-access");
  });

  test("null releaseDate / criteria normalize to undefined", () => {
    const result = datasetDocToTemplate(
      makeDoc({
        releaseDate: null as unknown as string,
        criteria: null as unknown as DatasetDoc["criteria"],
      }),
    );
    expect(result.releaseDate).toBeUndefined();
    expect(result.criteria).toBeUndefined();
  });

  test("absent releaseDate / criteria normalize to undefined", () => {
    const doc = makeDoc({});
    delete (doc as Partial<DatasetDoc>).releaseDate;
    delete (doc as Partial<DatasetDoc>).criteria;
    const result = datasetDocToTemplate(doc);
    expect(result.releaseDate).toBeUndefined();
    expect(result.criteria).toBeUndefined();
  });
});

describe("datasetDocToTemplate – typeOfData", () => {
  test("{ ja, en } passes through", () => {
    const result = datasetDocToTemplate(
      makeDoc({ typeOfData: { ja: "あ", en: "b" } }),
    );
    expect(result.typeOfData).toEqual({ ja: "あ", en: "b" });
  });

  test("null sides pass through unchanged", () => {
    const result = datasetDocToTemplate(
      makeDoc({ typeOfData: { ja: null, en: "b" } }),
    );
    expect(result.typeOfData).toEqual({ ja: null, en: "b" });
  });
});

describe("datasetDocToTemplate – experiments", () => {
  test("pass through preserving header, data, and searchable", () => {
    const experiments: DatasetDoc["experiments"] = [
      {
        header: {
          ja: { text: "実験1", rawHtml: null },
          en: { text: "Experiment 1", rawHtml: null },
        },
        data: {
          assay: { ja: { text: "WGS", rawHtml: null }, en: { text: "WGS", rawHtml: null } },
          platform: null,
        },
        searchable: { assayType: ["WGS"] } as DatasetDoc["experiments"][number]["searchable"],
      },
    ];
    const result = datasetDocToTemplate(makeDoc({ experiments }));
    expect(result.experiments).toEqual(experiments as never);
  });

  test("extra rawHtml on bilingual blocks is tolerated (passed through)", () => {
    const experiments = [
      {
        header: { ja: { text: "h", rawHtml: "<b>h</b>" }, en: null },
        data: {},
      },
    ] as unknown as DatasetDoc["experiments"];
    const result = datasetDocToTemplate(makeDoc({ experiments }));
    expect(result.experiments).toEqual(experiments as never);
  });

  test("empty experiments array passes through", () => {
    const result = datasetDocToTemplate(makeDoc({ experiments: [] }));
    expect(result.experiments).toEqual([]);
  });
});

describe("datasetDocToTemplate – template-only extras", () => {
  test("relatedAccessions is absent from the output (dataset templates have none)", () => {
    const result = datasetDocToTemplate(baseDoc);
    expect("relatedAccessions" in result).toBe(false);
  });

  test("warnings is absent from the output", () => {
    const result = datasetDocToTemplate(baseDoc);
    expect("warnings" in result).toBe(false);
  });
});
