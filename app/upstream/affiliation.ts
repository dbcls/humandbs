/**
 * The affiliation of a controlled-access user, in both languages.
 *
 * Upstream holds it as two free-text parts per language, the division and the
 * institution, typed by the applicant into the initial application of a usage
 * project. The division comes first: the institution alone matches what the
 * old portal published for only 8% of rows; with the division in front it is
 * 65%, which is what shows the two belong together.
 *
 * **What an applicant typed in place of a part is not a part.** `N/A` in the
 * division is the common one; later submissions also hold `unknown`, `missing`
 * and `(Filled by DDBJ)`. Shown, they read as the start of the name.
 *
 * **A language the initial application left empty is filled from the project's
 * other submissions, where they are about the same person.** Early forms had no
 * affiliation at all, and many had none in English; the extension, report and
 * closing submissions of the same project often do.
 * - With the Japanese written, only a submission with the same Japanese
 *   affiliation gives the English — one written after the investigator moved
 *   would put a different institution beside it.
 * - With neither written, the newest submission that has one gives both
 *   languages together, so the two never describe different affiliations.
 * A submission names the same person when the investigator's family name in
 * English is the same: the investigator of a project is sometimes replaced, and
 * the reports name whoever holds the post by then.
 */

import type { Bilingual } from "~/content/types"

/** One submission's investigator and affiliation, as upstream has them. */
export interface StatedAffiliation {
  piLastEn: string
  divisionJa: string
  institutionJa: string
  divisionEn: string
  institutionEn: string
}

/** What applicants type in place of a part, folded (`fold`). */
const PLACEHOLDERS = new Set(["na", "unknown", "missing", "filledbyddbj"])

function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}

/**
 * One part as it is shown: trimmed, without the commas an applicant ended it
 * with — the parts are joined with one — and empty for a placeholder.
 */
function part(value: string): string {
  const trimmed = value.trim().replace(/[\s,、]+$/u, "").trim()
  return PLACEHOLDERS.has(fold(trimmed)) ? "" : trimmed
}

/** The division before the institution, joined with `, `, leaving out what is empty. */
export function joinAffiliation(division: string, institution: string): string {
  return [part(division), part(institution)].filter((one) => one !== "").join(", ")
}

/**
 * Whether two affiliations are the same words. Spaces are left out: the same
 * department is typed with and without them, and in either width.
 */
function sameWords(a: string, b: string): boolean {
  const squeeze = (value: string): string => value.normalize("NFKC").replace(/\s+/gu, "")
  return squeeze(a) === squeeze(b)
}

function samePerson(a: StatedAffiliation, b: StatedAffiliation): boolean {
  const name = fold(a.piLastEn)
  return name !== "" && name === fold(b.piLastEn)
}

function ja(stated: StatedAffiliation): string {
  return joinAffiliation(stated.divisionJa, stated.institutionJa)
}

function en(stated: StatedAffiliation): string {
  return joinAffiliation(stated.divisionEn, stated.institutionEn)
}

/**
 * The affiliation a row shows: the initial application's, with a language it
 * left empty filled from `others` — the project's other submissions, newest
 * first — as the header of this file sets out.
 */
export function affiliationOf(initial: StatedAffiliation, others: readonly StatedAffiliation[]): Bilingual {
  const own = { ja: ja(initial), en: en(initial) }
  if (own.en !== "") return own
  const same = others.filter((other) => samePerson(other, initial))
  if (own.ja !== "") {
    const translated = same.find((other) => en(other) !== "" && sameWords(ja(other), own.ja))
    return { ja: own.ja, en: translated === undefined ? "" : en(translated) }
  }
  const stated = same.find((other) => ja(other) !== "" || en(other) !== "")
  return stated === undefined ? own : { ja: ja(stated), en: en(stated) }
}
