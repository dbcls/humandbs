import { describe, expect, test } from "bun:test";

import type { DatasetBatchResponse } from "../../../backend/src/api/types";
import { makeChunks, mergeBatchResults } from "./batch-utils";

function makeBatch(
  ids: string[],
  notFound: string[] = [],
  overrides?: Partial<DatasetBatchResponse["meta"]>,
): DatasetBatchResponse {
  return {
    data: ids.map((id) => ({ datasetId: id }) as DatasetBatchResponse["data"][number]),
    meta: {
      requestId: "test-request-id",
      timestamp: "2024-01-01T00:00:00Z",
      batch: {
        requested: ids.length + notFound.length,
        found: ids.length,
        notFound,
        ...overrides?.batch,
      },
    },
  };
}

describe("makeChunks", () => {
  test("single chunk when ids <= 100", () => {
    const ids = Array.from({ length: 5 }, (_, i) => `id-${i}`);
    expect(makeChunks(ids)).toEqual([ids]);
  });

  test("splits into chunks of 100", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const chunks = makeChunks(ids);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(50);
  });

  test("empty input returns empty array", () => {
    expect(makeChunks([])).toEqual([]);
  });
});

describe("mergeBatchResults", () => {
  test("single result is returned as-is", () => {
    const batch = makeBatch(["d1", "d2"], ["d3"]);
    expect(mergeBatchResults([batch])).toBe(batch);
  });

  test("merges data from multiple results", () => {
    const a = makeBatch(["d1", "d2"]);
    const b = makeBatch(["d3"]);
    const merged = mergeBatchResults([a, b]);
    expect(merged.data.map((d) => d.datasetId)).toEqual(["d1", "d2", "d3"]);
  });

  test("merges notFound lists", () => {
    const a = makeBatch(["d1"], ["missing1"]);
    const b = makeBatch(["d2"], ["missing2", "missing3"]);
    const merged = mergeBatchResults([a, b]);
    expect(merged.meta.batch.notFound).toEqual(["missing1", "missing2", "missing3"]);
  });

  test("sums requested and found counts", () => {
    const a = makeBatch(["d1", "d2"], ["x"]);
    const b = makeBatch(["d3"], ["y", "z"]);
    const merged = mergeBatchResults([a, b]);
    expect(merged.meta.batch.requested).toBe(6);
    expect(merged.meta.batch.found).toBe(3);
  });

  test("preserves requestId and timestamp from first result", () => {
    const a = makeBatch(["d1"]);
    const b = makeBatch(["d2"]);
    const merged = mergeBatchResults([a, b]);
    expect(merged.meta.requestId).toBe("test-request-id");
    expect(merged.meta.timestamp).toBe("2024-01-01T00:00:00Z");
  });
});
