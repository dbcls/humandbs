/**
 * Dataset ids: the one thing read out of them, and the spelling the portal issues.
 *
 * **What the portal issues is `NHA` and six digits** (`NHA000001`), numbered
 * across the whole portal. The format is specification rather than a default:
 * the administrator asks for the next number and cannot choose the spelling, so
 * the sequence cannot be broken by hand. The ids issued before this format start
 * with the hum label they belonged to (`hum0014.v1.freq.v1`); each of those was
 * given an NHA id as its primary label during the migration, and kept as a
 * secondary label so it still resolves.
 *
 * **Nothing past the prefix is read.** Every problem the old ids have comes from
 * a numbering scheme that was treated as a guarantee and then broken, so the
 * number says which dataset and nothing about the research or the version.
 */

const NHA_WIDTH = 6

/**
 * The shape of a research ID: `hum` and four digits.
 *
 * **This one is specification**, unlike the rest of a dataset id below. It is
 * the address a reader holds (`/research/hum0588`), it names the box the files
 * are served from, and it is what the data submission applications carry — so a
 * spelling outside it cannot be published and cannot be linked to.
 *
 * Written unanchored so that an input can take it as its `pattern`, which
 * anchors it itself. **The box only saves the round trip**: what decides is the
 * check on the way in.
 */
export const HUM_LABEL_PATTERN = "hum\\d{4}"

export function isHumLabel(label: string): boolean {
  return new RegExp(`^${HUM_LABEL_PATTERN}$`).test(label)
}

/**
 * The shape of an id the portal issues. Written unanchored, like the hum label's.
 */
export const NHA_ID_PATTERN = `NHA\\d{${NHA_WIDTH}}`

export function isNhaId(label: string): boolean {
  return new RegExp(`^${NHA_ID_PATTERN}$`).test(label)
}

/** The id carrying this number. */
export function nhaId(number: number): string {
  if (!Number.isInteger(number) || number < 1 || number >= 10 ** NHA_WIDTH) {
    throw new RangeError(`no NHA id carries ${number}`)
  }
  return `NHA${String(number).padStart(NHA_WIDTH, "0")}`
}

/** The number an id carries, or null for any other spelling. */
export function nhaNumber(label: string): number | null {
  return isNhaId(label) ? Number(label.slice(3)) : null
}

/**
 * Whether an id is one the portal issued.
 *
 * **Only the primary is asked**, and a dataset with none pinned yet answers no:
 * there is no spelling to read. That is the safe side, because the answer
 * decides whether a file selection can be made at all, and the datasets that
 * must not carry one are the archive's.
 *
 * **The NHA prefix is matched whole** — `NHA` and six digits, not a start of
 * `NHA` — so that an archive's accession that happens to begin the same way is
 * not taken for the portal's.
 */
export function isPortalIssuedId(primaryLabel: string | null): boolean {
  if (primaryLabel === null) return false
  return isNhaId(primaryLabel) || primaryLabel.startsWith("hum")
}

/**
 * Why a research's hum label cannot be taken away now, or null when it can.
 *
 * The same two facts the refusal on unpinning reads (`unpinLabel`): whether
 * the label's public box holds a file, and whether a switch of one of the
 * research's files has not finished. **They are told apart by what the reader
 * does next**, which is not the same for each:
 *
 * - `holds-files` — the primary's box holds files. Another label is made
 *   primary, and that moves them.
 * - `moving` — a retired label's box still holds files while a switch runs:
 *   the move making another label primary queued. Waiting is all it takes.
 * - `left-behind` — a retired label's box holds files and nothing is moving
 *   them. Only making a label primary queues a move, and it moves the box of
 *   the label that was primary, so this one is made primary again first.
 * - `switching` — the box is empty (or unknown) but a switch runs, which may
 *   still land a file in it.
 *
 * **What is unknown does not close it** — a store that did not answer says
 * nothing about the box, and the refusal on pressing is what stands.
 */
export type UnpinHold = "holds-files" | "moving" | "left-behind" | "switching"

export function unpinHold(
  label: { isPrimary: boolean, holdsFiles: boolean | null },
  switching: boolean,
): UnpinHold | null {
  if (label.holdsFiles === true) {
    if (label.isPrimary) return "holds-files"
    return switching ? "moving" : "left-behind"
  }
  return switching ? "switching" : null
}
