/**
 * Experiments whose extracted values were read again from the article by hand.
 *
 * v1 kept, beside each experiment's table, values a language model had read
 * out of it (`searchable`), and the facets are built from those. Where the
 * reading is wrong as a whole — in hum0201's draft each experiment holds the
 * reading of the one next to it — correcting term by term would leave the
 * fields no table covers still wrong, so the experiment's reading is replaced
 * with one written from its own table.
 *
 * A fix names the dataset, its v1 version and the experiment's heading, so it
 * lands on that document only. **A fix that lands nowhere stops the load**,
 * since it was written against the input and not landing means one of the two
 * has moved.
 */

import type { EsDataset, EsSearchable } from "./es"

export interface SearchableFix {
  datasetId: string
  version: string
  header: string
  searchable: EsSearchable
  /** What in the article the reading was written from. */
  note?: string
}

function headersOf(experiment: NonNullable<EsDataset["experiments"]>[number]): string[] {
  const header = experiment.header
  return [header?.ja?.text, header?.en?.text].filter((text): text is string => typeof text === "string")
}

/** Replaces the reading of every experiment a fix names, and stops if one names nothing. */
export function applySearchableFixes(docs: Iterable<EsDataset>, fixes: readonly SearchableFix[]): void {
  const applied = new Set<SearchableFix>()
  for (const doc of docs) {
    for (const fix of fixes) {
      if (doc.datasetId !== fix.datasetId || doc.version !== fix.version) continue
      for (const experiment of doc.experiments ?? []) {
        if (!headersOf(experiment).includes(fix.header)) continue
        experiment.searchable = structuredClone(fix.searchable)
        applied.add(fix)
      }
    }
  }
  const missed = fixes.filter((fix) => !applied.has(fix))
  if (missed.length > 0) {
    throw new Error(`searchable fixes that found nothing:\n${missed.map((fix) => `${fix.datasetId} ${fix.version} ${fix.header}`).join("\n")}`)
  }
}
