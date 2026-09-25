/**
 * Types of data v1 took from the wrong row of the page, put right by hand.
 *
 * The data ID table of a research page gives each dataset a row, and v1 copied
 * the type of data out of it. For a few datasets it copied another row's, or
 * left a language empty where the page had one. A fix names the dataset by its
 * v1 id and a version of its document, and gives the type of data written in
 * its own row. **A fix that lands nowhere stops the load**, since it was written
 * against the input and not landing means one of the two has moved.
 */

import type { EsDataset } from "./es"

export interface TypeOfDataFix {
  datasetId: string
  version: string
  lang: "ja" | "en"
  typeOfData: string
  /** Where on the page the type of data was taken from. */
  note?: string
}

/** Writes the type of data each fix gives into the document it names, and stops if one names nothing. */
export function applyTypeOfDataFixes(docs: Iterable<EsDataset>, fixes: readonly TypeOfDataFix[]): void {
  const applied = new Set<TypeOfDataFix>()
  for (const doc of docs) {
    for (const fix of fixes) {
      if (doc.datasetId !== fix.datasetId || doc.version !== fix.version) continue
      doc.typeOfData = { ...doc.typeOfData, [fix.lang]: fix.typeOfData }
      applied.add(fix)
    }
  }
  const missed = fixes.filter((fix) => !applied.has(fix))
  if (missed.length > 0) {
    throw new Error(`type of data fixes that found nothing:\n${missed.map((fix) => `${fix.datasetId} ${fix.version} ${fix.lang}`).join("\n")}`)
  }
}
