/**
 * The address a heading answers at.
 *
 * **Two things compute this and they may not disagree.** The renderer puts the
 * id on the heading (`markdown.server.ts`), and the migration rewrites the
 * in-page links v1 wrote against v1's own anchors, which no longer exist —
 * a second spelling of the rule would send every one of those links to a place
 * that is not there.
 */

/**
 * The address one heading answers at, built from its words.
 *
 * **Words rather than a counter**: an address that survives an edit elsewhere in
 * the article is one a reader can quote. Everything that is not a letter, a
 * digit or a separator goes, which takes the numbering the guidelines carry
 * (`５．` becomes `５`) — punctuation in an address is noise, and a heading that
 * is punctuation alone has no words to name it by.
 */
export function headingId(text: string): string {
  const said = text.trim().toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^\p{L}\p{N}_-]/gu, "")
  // A heading of punctuation alone leaves separators and nothing to read, and
  // `#---` names a place no better than `#section` does.
  return /[\p{L}\p{N}]/u.test(said) ? said : "section"
}

/**
 * The addresses of every heading of one article, in the order they are read.
 *
 * **A repeated heading is numbered from the second.** The guidelines quote the
 * same clause under the same words more than once, and an id that appeared
 * twice would send both of its links to the first one.
 */
export function headingIds(texts: readonly string[]): string[] {
  const used = new Map<string, number>()
  return texts.map((text) => {
    const base = headingId(text)
    const seen = used.get(base)
    used.set(base, (seen ?? 0) + 1)
    return seen === undefined ? base : `${base}-${seen + 1}`
  })
}
