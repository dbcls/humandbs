/**
 * The pieces both conflict diffs are built out of.
 *
 * A diff answers with paths (`paths.ts`), and the comparison is of the meaning
 * rather than of the JSON: a slot that says there is no value still carries
 * whatever was half typed into it, and two slots differing only in that
 * leftover text say the same thing.
 *
 * **An array is compared twice over.** Its own path stands for membership and
 * order, and each element present on both sides is compared field by field
 * under its identity. An element only one side has therefore shows up as a
 * change to the array rather than as a change to a field nobody can see.
 */

import type { TextInput, TextPairInput } from "./form"

export interface Diff {
  paths: string[]
  when: (same: boolean, path: string) => void
}

export function diff(): Diff {
  const paths: string[] = []
  return {
    paths,
    when(same, path) {
      if (!same) paths.push(path)
    },
  }
}

export function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, at) => value === b[at])
}

/** Leftover text is invisible while the state says there is no value. */
export function sameText(a: TextInput, b: TextInput): boolean {
  if (a.state !== b.state) return false
  return a.state !== "value" || a.text === b.text
}

export function sameTextPair(a: TextPairInput, b: TextPairInput): boolean {
  return sameText(a.ja, b.ja) && sameText(a.en, b.en)
}

export type Compare<T> = (into: Diff, a: T, b: T, at: string) => void

export function elements<T>(
  into: Diff,
  path: string,
  base: readonly T[],
  other: readonly T[],
  identity: (element: T) => string,
  compare: Compare<T>,
): void {
  into.when(sameStrings(base.map(identity), other.map(identity)), path)
  const otherById = new Map(other.map((element) => [identity(element), element]))
  for (const element of base) {
    const counterpart = otherById.get(identity(element))
    if (counterpart !== undefined) compare(into, element, counterpart, `${path}.${identity(element)}`)
  }
}
