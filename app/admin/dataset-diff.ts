/**
 * Which fields two versions of a dataset entry disagree about.
 *
 * The same job as `diff.ts` and the same use on screen — name what somebody
 * else changed, and offer their value one field at a time — over the form a
 * dataset is edited in (`dataset-form.ts`).
 *
 * Two arrays are identified rather than positional. A value slot is identified
 * by the catalog key it is under, an experiment by its own identity, and both
 * are spelled the way a comment anchors to them. **The file selection is
 * compared even though no screen shows it yet**: the form carries it through
 * untouched, and a difference the diff hid would be a difference the author
 * could not take.
 */

import {
  diff,
  elements,
  sameStrings,
  sameText,
  sameTextPair,
  type Diff,
} from "./compare"
import type {
  DatasetContentInput,
  ExperimentInput,
  ValueBody,
  ValueInput,
} from "./dataset-form"
import { readAt, writeAt } from "./paths"

function sameValueBody(a: ValueBody, b: ValueBody): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "text" && b.kind === "text") return sameTextPair(a.text, b.text)
  if (a.kind === "vocabulary" && b.kind === "vocabulary") {
    if (a.state !== b.state) return false
    // Chosen terms are invisible while the state says there is no value, the
    // same way half-typed text is.
    return a.state !== "value" || sameStrings(a.termIds, b.termIds)
  }
  return false
}

function byKeyId(value: ValueInput): string {
  return value.keyId
}

function byId(experiment: ExperimentInput): string {
  return experiment.id
}

function value(into: Diff, a: ValueInput, b: ValueInput, at: string): void {
  into.when(sameValueBody(a.value, b.value), at)
}

function experiment(into: Diff, a: ExperimentInput, b: ExperimentInput, at: string): void {
  into.when(sameText(a.label, b.label), `${at}.label`)
  elements(into, `${at}.values`, a.values, b.values, byKeyId, value)
}

/**
 * The paths at which `base` and `other` say different things, in the order the
 * form shows them.
 */
export function diffDatasetInput(
  base: DatasetContentInput,
  other: DatasetContentInput,
): string[] {
  const into = diff()

  into.when(base.releaseDate === other.releaseDate, "releaseDate")
  elements(into, "values", base.values, other.values, byKeyId, value)
  elements(into, "experiments", base.experiments, other.experiments, byId, experiment)
  into.when(sameStrings(base.fileSelection, other.fileSelection), "fileSelection")

  return into.paths
}

/** One field of `theirs` written over `mine`, addressed by a reported path. */
export function takeDatasetField(
  mine: DatasetContentInput,
  theirs: DatasetContentInput,
  path: string,
): DatasetContentInput {
  const keys = path.split(".")
  const taken = readAt(theirs, keys)
  if (!taken.found) return mine
  return writeAt(mine, keys, taken.value) as DatasetContentInput
}
