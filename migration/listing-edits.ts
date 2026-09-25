/**
 * Corrections to a research's listing summary, written by hand as exact
 * replacements: a list written on one line where every other listing writes
 * an item a line, or a bracket or a plus sign in the other width.
 *
 * An edit names the research, the column, the language and the words, and
 * replaces them where the listing summary holds them. **An edit that finds
 * nothing stops the load**, since the words were copied from the input.
 */

import type { Dump, EsBilingualRich } from "./es"

export interface ListingEdit {
  hum: string
  field: "methods" | "targets" | "typeOfData"
  lang: "ja" | "en"
  before: string
  after: string
}

/** The dump with every edit made, stopping if one finds nothing. */
export function applyListingEdits(held: Dump, edits: readonly ListingEdit[]): Dump {
  const research = new Map(held.research)
  for (const edit of edits) {
    const one = research.get(edit.hum)
    const cell: EsBilingualRich | null | undefined = one?.summaryShort?.[edit.field]
    const text = cell?.[edit.lang]?.text ?? ""
    if (one === undefined || !text.includes(edit.before)) {
      throw new Error(`a listing edit found nothing: ${edit.hum} ${edit.field} ${edit.lang} "${edit.before}"`)
    }
    research.set(edit.hum, {
      ...one,
      summaryShort: {
        ...one.summaryShort,
        [edit.field]: { ...cell, [edit.lang]: { text: text.replace(edit.before, edit.after), rawHtml: null } },
      },
    })
  }
  return { ...held, research }
}
