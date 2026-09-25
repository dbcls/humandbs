/**
 * Merging one vocabulary value into another, wherever a description points at
 * it.
 *
 * **A merge rewrites the descriptions rather than leaving a forwarding note.**
 * The term a value points at is the description's reference rather than part of
 * what the description has, so two names for one thing have no reason to
 * survive in the stored content — the same line that lets a label be renamed
 * and have every version read the new one.
 *
 * Nothing here reaches the database. The caller picks the rows that point at
 * the term, hands each content over, and writes back what comes out.
 */

import type { ContentValue, DatasetContent, ValueSlot, VersionContent } from "./types"

/**
 * The list with `from` swapped for `into`.
 *
 * **A description naming both ends of a merge names the survivor once.** The
 * two were different answers until now; afterwards they are the same one, and a
 * value holding it twice would be counted twice by the facets.
 */
function swapped(ids: readonly string[], from: string, into: string): string[] {
  const next: string[] = []
  for (const id of ids) {
    const at = id === from ? into : id
    if (!next.includes(at)) next.push(at)
  }
  return next
}

/**
 * **Two shapes hold identities.** A vocabulary value keeps them in its own
 * slot; a disease keeps them inside each disease of its slot, beside a name the
 * article wrote that a merge has no business touching.
 *
 * The value is returned unchanged — the same object — when it does not point at
 * the term, so a caller can tell whether a row needs writing back at all.
 */
function mergedValue(value: ContentValue, from: string, into: string): ContentValue {
  if (value.kind === "vocabulary" && value.termIds.state === "value") {
    if (!value.termIds.value.includes(from)) return value
    return {
      ...value,
      termIds: { state: "value", value: swapped(value.termIds.value, from, into) },
    }
  }
  if (value.kind === "disease" && value.diseases.state === "value") {
    if (!value.diseases.value.some((one) => one.termIds.includes(from))) return value
    return {
      ...value,
      diseases: {
        state: "value",
        value: value.diseases.value.map((one) => ({
          ...one,
          termIds: swapped(one.termIds, from, into),
        })),
      },
    }
  }
  return value
}

function mergedSlots(slots: readonly ValueSlot[], from: string, into: string): ValueSlot[] {
  return slots.map((slot) => {
    const value = mergedValue(slot.value, from, into)
    return value === slot.value ? slot : { ...slot, value }
  })
}

/** One dataset's description: its own values and its experiments'. */
export function datasetWithTermMerged<C extends DatasetContent>(
  content: C,
  from: string,
  into: string,
): C {
  return {
    ...content,
    values: mergedSlots(content.values, from, into),
    experiments: content.experiments.map((one) => ({
      ...one,
      values: mergedSlots(one.values, from, into),
    })),
  }
}

/** A published version, which has the description of every dataset it listed. */
export function versionWithTermMerged(
  content: VersionContent,
  from: string,
  into: string,
): VersionContent {
  return {
    ...content,
    datasets: content.datasets.map((one) => datasetWithTermMerged(one, from, into)),
  }
}
