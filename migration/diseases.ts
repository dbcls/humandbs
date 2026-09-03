/**
 * The diseases an article's free text names.
 *
 * v1 kept a layer beside the text that a language model had read, and that
 * layer holds no name at all: the extraction translated Japanese into English
 * and the normalisation then replaced the English with WHO's title. **The
 * articles themselves carry both**, written as `疾患名(ICD10: コード)` in
 * Japanese and `disease name (ICD10: code)` in English, so v2 reads them here
 * (`docs/data-model.md` の「ICD10」).
 *
 * What comes out is codes as written; resolving them against the dictionary is
 * the caller's step, because only it holds one.
 */

import { icd10CodesIn } from "~/icd10/codes"

/** One `name (ICD10: code)` as an article writes it. */
export interface DiseaseMention {
  /** Normalised, ranges expanded, not yet checked against the dictionary. */
  codes: string[]
  /** The name the article wrote, as it wrote it. */
  name: string
}

/** Anything in brackets. Which of them is an annotation is decided below. */
const BRACKETED = /[（(]([^）)]*)[）)]/g

/**
 * How an annotation names itself. **Three spellings occur** (`ICD10`,
 * `ICD-10`, `ICD 10`) and both kinds of parenthesis are used.
 */
const NAMES_ICD10 = /ICD\s*-?\s*10\s*[:：]?\s*/i

/** What separates one disease from the next inside a line. */
const BETWEEN = /[、,，;；]/

/**
 * The name that belongs to an annotation, taken from the text standing between
 * the previous annotation and this one.
 *
 * **A line names several diseases in a row** (`胆道がん(ICD10: C221)、乳がん
 * (ICD10: C50)`), so reading from the start of the line would give the second
 * disease the first one's name as well. What is kept is the part closest to the
 * code, with the labels the articles put in front of it removed — a list
 * marker, the `【JGAS000009】` an article uses to say which submission a group
 * came from, and an identifier standing in for the case (`HNC1:`).
 */
function nameBefore(fragment: string): string {
  const parts = fragment.split(BETWEEN)
  return (parts[parts.length - 1] ?? "")
    .replace(/<[^>]*>|&nbsp;|&amp;/g, " ")
    .replace(/^[\s・\-*＊+＋(（]+/, "")
    .replace(/^【[^】]*】\s*/, "")
    .replace(/^[A-Za-z0-9_]+\s*[:：]\s*/, "")
    .replace(/^[^:：]{1,4}群\s*[:：]\s*/, "")
    .replace(/^[\s:：]+/, "")
    .replace(/[\s:：]+$/, "")
    .trim()
}

/**
 * An annotation that announces the codes instead of holding one:
 * `42疾患(ICD10 code) 不整脈(I499)、気管支喘息(J459)、…`.
 *
 * **The heading is not a disease** — the diseases are what follows it, and they
 * do not repeat `ICD10` in every bracket. An announcement therefore says two
 * things: drop this one, and read the rest of the line's brackets as codes.
 */
const ANNOUNCEMENT = /^codes?$/i

/** The diseases one language of one field names, in the order written. */
export function mentionsIn(text: string): DiseaseMention[] {
  const mentions: DiseaseMention[] = []
  // **An announcement carries past the line it stands on.** The heading is a
  // line of its own and the diseases fill the lines under it.
  let announced = false
  for (const line of text.split("\n")) {
    let at = 0
    for (const found of line.matchAll(BRACKETED)) {
      const whole = found[1] ?? ""
      const annotated = NAMES_ICD10.test(whole)
      if (!annotated && !announced) continue
      const inner = whole.replace(NAMES_ICD10, "").trim()
      if (annotated && ANNOUNCEMENT.test(inner)) {
        announced = true
        at = found.index + found[0].length
        continue
      }
      const codes = icd10CodesIn(inner)
      // After an announcement every bracket is a candidate, so one holding no
      // code at all is a count or an aside rather than a disease.
      if (!annotated && codes.length === 0) continue
      const name = nameBefore(line.slice(at, found.index))
      at = found.index + found[0].length
      if (codes.length > 0 || name !== "") mentions.push({ codes, name })
    }
  }
  return mentions
}

/** One disease of one experiment, before its codes meet the dictionary. */
export interface DiseaseSeed {
  codes: string[]
  nameJa: string | null
  nameEn: string | null
}

/**
 * The diseases a field names in both languages, paired.
 *
 * **The pairing is by code, not by position.** The two languages of one field
 * do not always hold the same number of lines, and a disease named in only one
 * of them is ordinary rather than broken — it becomes a value with one name.
 * Diseases carrying no code at all pair in the order they were written, which
 * is all there is to go on.
 *
 * **The same disease written twice becomes one value.** An article splits a
 * disease over lines when it has several groups of cases
 * (`肝硬変(ICD10: K746): 1症例` and `肝硬変(ICD10: K746): 9症例`), and the
 * counts live in the free text, not here.
 */
export function diseasesIn(ja: string, en: string): DiseaseSeed[] {
  const waiting = mentionsIn(en)
  const seeds: DiseaseSeed[] = []
  for (const one of mentionsIn(ja)) {
    const key = one.codes.join(" ")
    const at = waiting.findIndex((other) => other.codes.join(" ") === key)
    const paired = at === -1 ? undefined : waiting.splice(at, 1)[0]
    seeds.push({ codes: one.codes, nameJa: one.name || null, nameEn: paired?.name || null })
  }
  for (const rest of waiting) {
    seeds.push({ codes: rest.codes, nameJa: null, nameEn: rest.name || null })
  }

  const held = new Map<string, DiseaseSeed>()
  for (const seed of seeds) {
    const key = `${seed.codes.join(" ")}|${seed.nameJa ?? ""}|${seed.nameEn ?? ""}`
    if (!held.has(key)) held.set(key, seed)
  }
  return [...held.values()]
}
