/**
 * A dataset's file selection, written in the prefix's own order, which is by name.
 *
 * **A selection is a set.** The pages list a dataset's files in the order the
 * prefix lists them, so an order kept in the content would be one nobody sees, and
 * two selections of the same files would read as different. A name the prefix no
 * longer holds is kept rather than dropped: the selection does not claim a file
 * exists, and a file uploaded again under that name is selected again.
 */
export function inListingOrder(selected: Iterable<string>): string[] {
  return [...new Set(selected)].toSorted((a, b) => a < b ? -1 : a > b ? 1 : 0)
}
