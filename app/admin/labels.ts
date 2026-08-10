/**
 * The id the portal proposes for a dataset no external archive issued one for.
 *
 * **This is a default, not a rule.** The administrator can take it, change it,
 * or type something else; nothing downstream parses a dataset id, and the
 * ledger only insists that it is not already in use. Keeping it out of the
 * specification is deliberate — every problem the current ids have comes from a
 * numbering scheme that was treated as a guarantee and then broken.
 *
 * It carries the hum label because the id string is the only thing that says
 * which research the data belongs to: article prose names ids without naming
 * the hum beside them, and nothing upstream links the two.
 */

const WIDTH = 3

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
