/**
 * Two sets of edits over the same starting point, told apart.
 *
 * A draft carries what was published when its author started (`parent` for a
 * research, `baseContent` for a dataset), so when somebody else publishes in
 * the meantime there are three versions of the same thing and the difference
 * between "they changed it" and "we both changed it" is decidable.
 *
 * **Nothing here merges anything.** Publishing writes the draft as it stands,
 * because a draft has a share link on it and the preview a data provider
 * approved has to be what goes out. What this answers is which fields the
 * author can take into the draft in one go, and which ones they have to choose
 * between — the same distinction the conflict band on a refused save draws, and
 * taken with the same two functions.
 */

import { diffDatasetInput } from "./dataset-diff"
import type { DatasetContentInput } from "./dataset-form"
import { diffDraftInput } from "./diff"
import type { DraftInput, ResearchContentInput } from "./form"

export interface ThreeWay {
  /** Only they changed these, so taking them costs nothing of mine. */
  theirs: string[]
  /** Both of us changed these, differently: taking one replaces my value. */
  both: string[]
}

export const NO_THREE_WAY: ThreeWay = { theirs: [], both: [] }

export function isEmptyThreeWay(compared: ThreeWay): boolean {
  return compared.theirs.length === 0 && compared.both.length === 0
}

/**
 * Only the paths where the two versions actually say different things are
 * reported: a field we both changed to the same value is not a decision anybody
 * has to make.
 *
 * **A path counts as touched here when anything under it was touched.** Taking
 * an array's own path replaces the array, and with it every element edit
 * underneath — so an array whose membership only they changed is still a choice
 * if this side rewrote one of its elements. Otherwise "taking this costs
 * nothing of mine" would not be true, and a single button would quietly undo
 * somebody's work.
 */
export function threeWay<T>(
  changed: (a: T, b: T) => string[],
  base: T,
  theirs: T,
  mine: T,
): ThreeWay {
  const byThem = new Set(changed(base, theirs))
  const byMe = changed(base, mine)
  const apart = changed(mine, theirs)
  const mineUnder = (path: string): boolean =>
    byMe.some((held) => held === path || held.startsWith(`${path}.`))

  const contested = apart.filter((path) => byThem.has(path))
  return {
    theirs: contested.filter((path) => !mineUnder(path)),
    both: contested.filter((path) => mineUnder(path)),
  }
}

/**
 * The memo is not part of what gets published, so it is held equal on all three
 * sides rather than compared: a snapshot has no memo to disagree with.
 */
function withoutNote(content: ResearchContentInput): DraftInput {
  return { note: "", content }
}

export function threeWayResearch(
  base: ResearchContentInput,
  theirs: ResearchContentInput,
  mine: ResearchContentInput,
): ThreeWay {
  return threeWay(diffDraftInput, withoutNote(base), withoutNote(theirs), withoutNote(mine))
}

export function threeWayDataset(
  base: DatasetContentInput,
  theirs: DatasetContentInput,
  mine: DatasetContentInput,
): ThreeWay {
  return threeWay(diffDatasetInput, base, theirs, mine)
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
