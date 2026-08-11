/**
 * Dataset ids: the one thing read out of them, and what the portal proposes.
 *
 * **Only the prefix is specification.** An id the portal issued starts with the
 * hum label it belongs to; every external archive's accession starts with
 * something else. Everything past that — the numbering, the tokens — is a
 * default the administrator may take, change or replace, and nothing downstream
 * reads it. Keeping the rest out of the specification is deliberate: every
 * problem the current ids have comes from a numbering scheme that was treated
 * as a guarantee and then broken.
 *
 * The hum label is in the string because the id is the only thing that says
 * which research the data belongs to: article prose names ids without naming
 * the hum beside them, and nothing upstream links the two.
 */

const WIDTH = 3

/**
 * Whether an id is one the portal issued.
 *
 * **Only the primary is asked**, and a dataset with none pinned yet answers no:
 * there is no spelling to read. That is the safe side, because the answer
 * decides whether a file selection can be made at all, and the datasets that
 * must not carry one are the archive's (docs/data-model.md の「ファイル」).
 */
export function isPortalIssuedId(primaryLabel: string | null): boolean {
  return primaryLabel?.startsWith("hum") ?? false
}

export function proposeDatasetId(humLabel: string, taken: readonly string[]): string {
  // Only the ids under this hum are counted. Another research's numbering says
  // nothing about this one, which is the whole reason the hum is in the string.
  const under = new RegExp(`^${humLabel.replaceAll(/[^\w-]/g, "")}-NHA(\\d+)$`)
  const used = taken.flatMap((label) => {
    const found = under.exec(label)
    return found?.[1] === undefined ? [] : [Number(found[1])]
  })
  const next = used.reduce((highest, number) => Math.max(highest, number), 0) + 1
  return `${humLabel}-NHA${String(next).padStart(WIDTH, "0")}`
}
