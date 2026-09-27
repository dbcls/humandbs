/**
 * JGA accessions written with more digits than the portal shows.
 *
 * JGA's own records and DDBJ Search also spell an accession with eleven digits
 * (`JGAS00000000197` for `JGAS000197`), and a reader who copied it from there
 * searches with it. The search rows only ever hold the six-digit spelling, so
 * the long one is read as the short one before it reaches the index.
 *
 * **Only a spelling longer than six digits that starts with a zero is
 * rewritten.** A shorter one (`JGAS0001`) is somebody part-way through typing,
 * and matching inside a word is what finds the accessions it begins.
 */

const LONG_JGA_ID = /(?<![0-9A-Za-z])(JGA[SDCP])(0\d{6,})(?!\d)/giu

const DIGITS = 6

function shortDigits(digits: string): string {
  return digits.replace(/^0+/u, "").padStart(DIGITS, "0")
}

/** `text` with every long JGA accession in it written the way the portal writes it. */
export function canonicalJgaIds(text: string): string {
  return text.replace(
    LONG_JGA_ID,
    (_whole, prefix: string, digits: string) => `${prefix.toUpperCase()}${shortDigits(digits)}`,
  )
}
