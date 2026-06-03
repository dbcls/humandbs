import type { DatasetBatchResponse } from "../../../backend/src/api/types";

export function makeChunks(ids: string[]): string[][] {
  const chunks = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    chunks.push(chunk);
  }
  return chunks;
}

export function mergeBatchResults(results: DatasetBatchResponse[]): DatasetBatchResponse {
  const [first, ...rest] = results;
  return rest.reduce((acc, curr) => {
    acc.data.push(...curr.data);
    acc.meta.batch.notFound.push(...curr.meta.batch.notFound);
    acc.meta.batch.requested += curr.meta.batch.requested;
    acc.meta.batch.found += curr.meta.batch.found;
    return acc;
  }, first);
}
