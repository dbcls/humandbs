/**
 * Which datasets a draft publishes, and in what order.
 *
 * **A dataset belongs to the research, not to a version**: a draft does not
 * choose which of them the next version has. It has every dataset the
 * research has, and all the draft decides is the order.
 *
 * **What another draft made is not among them.** It has never been out, so it
 * belongs to the draft that made it and goes out with that draft or not at all.
 */
export interface DraftDataset {
  id: string
  /** The draft that made it, until a publish adopts it. Null once it is out. */
  originDraftId: string | null
}

/**
 * The research's datasets this draft publishes, in the draft's order.
 *
 * **The order names what it knows and no more.** One the draft has not named
 * yet is shown after the ones it has, in the order it arrived; one it identifies that
 * the research no longer has falls out. Neither is a fault to report: the order
 * is written as rows are moved, and datasets come and go by their own
 * operations.
 */
export function draftDatasets<T extends DraftDataset>(
  rows: readonly T[],
  draftId: string,
  order: readonly string[],
): T[] {
  const named = new Map(order.map((id, at) => [id, at] as const))
  const last = order.length
  return rows
    .filter((row) => row.originDraftId === null || row.originDraftId === draftId)
    // The arrival index is kept rather than left to the sort: what the
    // caller handed over is the tie-break for everything the order does not
    // name, and that has to hold whatever the sort does with equal keys.
    .map((row, arrived) => ({ row, at: named.get(row.id) ?? last, arrived }))
    .sort((one, other) => one.at - other.at || one.arrived - other.arrived)
    .map((held) => held.row)
}
