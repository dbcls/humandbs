import type { MoldataKeyCatalog } from "@/repositories/moldataKeyCatalog";

export type ResolvedMoldataKey<T> = {
  key: string;
  label: string;
  value: T;
};

/**
 * Applies the catalog as a view-layer ordering and label rule. Raw dataset
 * keys are intentionally matched exactly, so renamed or deleted keys fall
 * back to their stored value in both locales.
 */
export function resolveMoldataKeys<T>(
  source: Record<string, T>,
  catalog: MoldataKeyCatalog,
  locale: "en" | "ja",
): ResolvedMoldataKey<T>[] {
  const sourceEntries = Object.entries(source);
  const byKey = new Map(sourceEntries);
  const registered = catalog.entries.flatMap((entry) => {
    const value = byKey.get(entry.english);
    if (value === undefined) return [];

    byKey.delete(entry.english);
    return [{ key: entry.english, label: locale === "ja" ? entry.japanese : entry.english, value }];
  });

  const unregistered = sourceEntries.flatMap(([key, value]) =>
    byKey.has(key) ? [{ key, label: key, value }] : [],
  );

  return [...registered, ...unregistered];
}
