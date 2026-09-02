/**
 * Converting a number to the unit its key is stored in.
 *
 * **The conversion lives here and nowhere else.** The editor offers the units a
 * key admits, the value is converted once on the way in, and everything
 * downstream — the public page, the facet, the API — sees the canonical unit
 * only. v1 spread this over the extraction code and ended up with thirty-nine
 * data volumes out by a factor of a thousand.
 *
 * **What was typed is kept beside the converted value** (`NumberValue` in
 * `types.ts`). A conversion that later turns out to be wrong cannot be redone
 * without it.
 *
 * A group is a set of units that measure the same thing. Two units convert into
 * each other exactly when one group holds both; there is no dimensional
 * analysis and no parsing of unit strings, because the units a key admits are a
 * closed list the catalog carries.
 */

/**
 * **A data volume steps by 1024 and a sequence length by 1000.** They look like
 * the same prefixes and they are not: `GB` is written by people reading what a
 * filesystem reports, which counts in powers of two, while `kbp` is a thousand
 * bases because a base is a thing you count. Using one rule for both is how a
 * volume ends up out by 7% and a read length by 2.4%.
 */
const GROUPS: readonly Readonly<Record<string, number>>[] = [
  /** Data volume, in gigabytes. */
  { KB: 1 / 1024 ** 2, MB: 1 / 1024, GB: 1, TB: 1024, PB: 1024 ** 2 },
  /** Sequence length, in bases. */
  { bp: 1, kbp: 1e3, Mbp: 1e6 },
]

function groupOf(unit: string): Readonly<Record<string, number>> | undefined {
  return GROUPS.find((group) => unit in group)
}

/**
 * The value in `to`, or null when the two units do not measure the same thing.
 * A key with no unit converts nothing: its numbers are counts.
 */
export function convert(value: number, from: string | null, to: string | null): number | null {
  if (from === to) return value
  if (from === null || to === null) return null
  const group = groupOf(from)
  if (group === undefined || group !== groupOf(to)) return null
  const factorFrom = group[from]
  const factorTo = group[to]
  if (factorFrom === undefined || factorTo === undefined) return null
  return (value * factorFrom) / factorTo
}

/** Whether a value entered in `unit` can be stored under a key that wants `canonical`. */
export function convertible(unit: string | null, canonical: string | null): boolean {
  return convert(1, unit, canonical) !== null
}
