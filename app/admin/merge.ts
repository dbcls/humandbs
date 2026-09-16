/**
 * Two versions of the same content, compared.
 *
 * A draft is a copy and remembers nothing about what it was copied from, so a
 * difference cannot be attributed to one side or the other: what this answers
 * is where the two disagree, and every one of those is the author's to decide.
 *
 * **Nothing here merges anything.** Publishing writes the draft as it stands,
 * because a draft has a share link on it and the preview a data provider
 * approved has to be what goes out. What this feeds is the screen that lets the
 * author take fields in — the same list the conflict band on a refused save
 * draws, and taken with the same function.
 */

import { diffDatasetInput } from "./dataset-diff"
import type { DatasetContentInput } from "./dataset-form"
import { diffDraftInput } from "./diff"
import type { ResearchContentInput } from "./form"

export interface Comparison {
  /** Paths where the two say different things. Taking one replaces mine. */
  differing: string[]
}

export function isEmptyComparison(compared: Comparison): boolean {
  return compared.differing.length === 0
}

/**
 * Only the paths where the two versions actually say different things are
 * reported: a field both sides hold the same value for is not a decision
 * anybody has to make.
 *
 * **A path counts as differing when anything under it differs.** Taking an
 * array's own path replaces the array, and with it every element underneath, so
 * the path a reader is offered is the one whose value would be written.
 */
export function compare<T>(changed: (a: T, b: T) => string[], theirs: T, mine: T): Comparison {
  return { differing: changed(mine, theirs) }
}

export function compareResearch(
  theirs: ResearchContentInput,
  mine: ResearchContentInput,
): Comparison {
  return compare(diffDraftInput, { content: theirs }, { content: mine })
}

export function compareDataset(
  theirs: DatasetContentInput,
  mine: DatasetContentInput,
): Comparison {
  return compare(diffDatasetInput, theirs, mine)
}

/** Taking a list of fields in one go, by folding the single-field take. */
export function takeAll<T>(
  take: (mine: T, theirs: T, path: string) => T,
  mine: T,
  theirs: T,
  paths: readonly string[],
): T {
  return paths.reduce((held, path) => take(held, theirs, path), mine)
}
