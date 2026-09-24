/**
 * NHA ids for the datasets the portal itself issued an id to under v1.
 *
 * v1 named such a dataset after its research and version
 * (`hum0014.v1.freq.v1`). v2 issues `NHA` and six digits instead
 * (`app/admin/labels.ts`), so each of them is given one, and the old name stays
 * as a secondary label so that every address and citation written with it
 * still resolves.
 *
 * **The numbers are fixed by the frozen snapshot**: the same input gives the
 * same numbers, and a dataset added or removed before the load moves every
 * number after it. So they are drawn here, from the input, and nowhere else.
 *
 * The order reads as the portal's history:
 *
 * - what has been published comes first, in the order it was first published —
 *   the release date of the earliest published version listing it, then the
 *   research number, then the old name;
 * - what has never been published follows, by research number and old name.
 *   **Its dates are not used**: v1 gave draft versions a release date too, and
 *   ordering by it would put a dataset that was never released ahead of the
 *   first one that was.
 */

import { nhaId } from "~/admin/labels"

export interface NhaCandidate {
  /** The name v1 gave it. */
  label: string
  humId: string
  /** When a published version first listed it; null if none ever did. */
  firstPublished: string | null
}

function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Every candidate's NHA id, keyed by its old name, numbered from 1. */
export function assignNhaIds(candidates: readonly NhaCandidate[]): Map<string, string> {
  const seen = new Set<string>()
  for (const one of candidates) {
    if (seen.has(one.label)) throw new Error(`${one.label} is a candidate twice`)
    seen.add(one.label)
  }
  const published = candidates
    .filter((one) => one.firstPublished !== null)
    .toSorted((a, b) => byText(a.firstPublished ?? "", b.firstPublished ?? "")
      || byText(a.humId, b.humId) || byText(a.label, b.label))
  const unpublished = candidates
    .filter((one) => one.firstPublished === null)
    .toSorted((a, b) => byText(a.humId, b.humId) || byText(a.label, b.label))
  return new Map([...published, ...unpublished].map((one, i) => [one.label, nhaId(i + 1)]))
}

/**
 * Names that were written for a dataset in its own listing but misspelt it.
 * Neither has a file of its own, so each points at one dataset only, and
 * keeping it as a secondary label resolves citations written that way.
 */
export const MISSPELT: Readonly<Record<string, string>> = {
  "hum0014.v12.T2DMw.v1": "hum0014.v12.T2DMwN.v1",
  "hum0014.v7.POAG-1.v1": "hum0014.v7.POAG.v1",
}
