export function getBilingualUrlRowCount(value?: { en?: unknown[]; ja?: unknown[] }) {
  return Math.max(value?.en?.length ?? 0, value?.ja?.length ?? 0);
}
