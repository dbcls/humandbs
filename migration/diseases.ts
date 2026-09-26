/**
 * The diseases an article's free text names.
 *
 * v1 kept a layer beside the text that a language model had read, and that
 * layer holds no name at all: the extraction translated Japanese into English
 * and the normalisation then replaced the English with WHO's title. **The
 * articles themselves have both**, written as `疾患名（ICD10：コード）` in
 * Japanese and `disease name (ICD10: code)` in English, so v2 reads them here.
 *
 * What comes out is codes as written; resolving them against the dictionary is
 * the caller's step, because only it holds one.
 */

import { icd10CodesIn } from "~/icd10/codes"

/** One `name (ICD10: code)` as an article writes it. */
export interface DiseaseMention {
  /** Normalised, ranges expanded, not yet checked against the dictionary. */
  codes: string[]
  /** The name the article wrote, without what the article wrote around it. */
  name: string
}

/**
 * The brackets the articles write, of either width. **A closing bracket closes
 * whatever is open**, whichever kind it is: the articles mix them (`（NGS)`).
 */
const OPENING = new Set(["（", "(", "【", "[", "［"])
const CLOSING = new Set(["）", ")", "】", "]", "］"])

/**
 * How an annotation names itself, at the start of its bracket. **Three
 * spellings occur** (`ICD10`, `ICD-10`, `ICD 10`), in brackets of every kind
 * (`（ICD10：C220）`, `[ICD10：C02.9]`).
 */
const NAMES_ICD10 = /^\s*ICD\s*-?\s*10\s*[:：]?\s*/i

/** One bracketed stretch of a line, nested ones included. */
interface Bracketed {
  /** Where the opening bracket is. */
  start: number
  /** Just past the closing bracket, or the end of the line when it never closes. */
  end: number
  inner: string
}

/**
 * Every bracketed stretch of a line, in the order they open. **An annotation
 * sits inside other brackets** (`胎盤（細胞性栄養膜細胞 [正常、胎児発育不全（ICD10：P059）…]）`)
 * and **holds brackets of its own** (`（ICD10：C169, C18（180, 182）, C20）`), so
 * the brackets are matched rather than read up to the first closing one. One
 * the line never closes runs up to the next bracket (`(ICD10: M318: 24 cases (24
 * samples)`): what follows is the rest of the line, not what it holds.
 */
function bracketsIn(line: string): Bracketed[] {
  const found: Bracketed[] = []
  const open: number[] = []
  for (let at = 0; at < line.length; at += 1) {
    const char = line[at] ?? ""
    if (OPENING.has(char)) open.push(at)
    else if (CLOSING.has(char)) {
      const start = open.pop()
      if (start !== undefined) found.push({ start, end: at + 1, inner: line.slice(start + 1, at) })
    }
  }
  for (const start of open) {
    let end = start + 1
    while (end < line.length && !OPENING.has(line[end] ?? "")) end += 1
    found.push({ start, end, inner: line.slice(start + 1, end) })
  }
  return found.toSorted((a, b) => a.start - b.start)
}

/**
 * The codes an annotation holds. **A code written without its letter takes
 * the letter of the code before it** (`C18, 19, 20`, `C22.1、23-24`,
 * `C220, 221, 227`), and the codes an annotation lists in brackets after a
 * code are more of the same list (`C18（180, 182）`). What follows a colon is a
 * count, not a code: `(ICD10: M318: 24 cases` is an article that forgot to close
 * the bracket.
 */
function codesIn(inner: string): string[] {
  const listed = inner.split(/[:：]/)[0] ?? ""
  let letter: string | null = null
  const tokens = listed
    .replace(/[（(【[［）)】\]］]/g, " ")
    .split(/[,、，;；/\s]+/)
    .filter((token) => token !== "")
    .map((token) => {
      const lettered = /^([A-Za-z])\d/.exec(token)
      if (lettered !== null) {
        letter = (lettered[1] ?? "").toUpperCase()
        return token
      }
      return letter !== null && /^\d{2}(?:[.．]?\d{1,2})?$|^\d{2}[-–~〜]\d{2}$/.test(token) ? `${letter}${token}` : token
    })
  return icd10CodesIn(tokens.join(", "))
}

/**
 * The parts of a stretch between the separators of a list, **leaving what is
 * inside brackets whole** (`t(9;17)(q34;q23)転座を有するT-LBL` is one name). A
 * comma between digits is a thousands separator (`1,005 pancreatic cancer
 * patients`), not the end of the disease before it.
 */
function listParts(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] ?? ""
    if (OPENING.has(char)) depth += 1
    else if (CLOSING.has(char)) depth = Math.max(0, depth - 1)
    if (depth > 0) continue
    const thousands = char === "," && /\d/.test(text[at - 1] ?? "") && /^\d{3}(?!\d)/.test(text.slice(at + 1))
    if ("、，;；".includes(char) || (char === "," && !thousands)) {
      parts.push(text.slice(from, at))
      from = at + 1
    }
  }
  parts.push(text.slice(from))
  return parts
}

/** What follows the innermost bracket the stretch opens and never closes. */
function pastOpenBracket(text: string): string {
  const open: number[] = []
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] ?? ""
    if (OPENING.has(char)) open.push(at)
    else if (CLOSING.has(char)) open.pop()
  }
  const last = open.at(-1)
  return last === undefined ? text : text.slice(last + 1)
}

/** A closing bracket at the end with nothing it closes. */
function withoutStrayClosing(name: string): string {
  let depth = 0
  for (const char of name) {
    if (OPENING.has(char)) depth += 1
    else if (CLOSING.has(char)) depth -= 1
  }
  return depth < 0 && CLOSING.has(name.at(-1) ?? "") ? name.slice(0, -1).trim() : name
}

/**
 * The name that belongs to an annotation, taken from the text between
 * the previous annotation and this one.
 *
 * **A line names several diseases in a row** (`胆道がん（ICD10：C221）、乳がん
 * （ICD10：C50）`), so reading from the start of the line would give the second
 * disease the first one's name as well. What is kept is the part closest to the
 * code, **without what the article wrote around the name**: the bracket a
 * group of diseases opens (`自己免疫疾患 [関節リウマチ`), a list marker or
 * number, the `【JGAS000009】` (`[JGAS000009]` in English) an article uses to
 * mark which submission a group came from, an identifier standing in for the
 * case (`HNC1:`), the word joining it to the disease before (`and prostate`),
 * and the count of patients — English puts it in front (`1,005 pancreatic
 * cancer patients`), and a line can end on one (`: 16症例`). **The counts stay
 * in the free text** the disease was read from, so nothing is lost.
 */
function nameBefore(fragment: string): string {
  const cleaned = fragment.replace(/<[^>]*>|&nbsp;|&amp;/g, " ")
  const parts = listParts(pastOpenBracket(cleaned))
  const name = (parts[parts.length - 1] ?? "")
    .trim()
    .replace(/^(?:【[^】]*】|\[[^\]]*\])\s*/, "")
    .replace(/^[\s・\-*＊+＋]+/, "")
    .replace(/^【[^】]*】\s*/, "")
    .replace(/^(?:[①-⑳]|\d+[.．](?!\d))\s*/, "")
    .replace(/^[A-Za-z0-9_]+\s*[:：]\s*/, "")
    .replace(/^[^:：]{1,4}群\s*[:：]\s*/, "")
    .replace(/^[\s:：]+/, "")
    .replace(/^(?:and|or|with|including)\s+/i, "")
    .replace(/^\d[\d,]*(?:\s*[+＋]\s*\d[\d,]*)*\s+(?=\S)/, "")
    .replace(/\s*[:：]\s*[\d,]+\s*(?:症例|例|名|検体|cases?|samples?)$|\s+[\d,]+\s*(?:症例|例|名|検体)$/i, "")
    .replace(/[\s:：]+$/, "")
    .trim()
  return withoutStrayClosing(name)
}

/**
 * An annotation that announces the codes instead of holding one:
 * `42疾患(ICD10 code) 不整脈(I499)、気管支喘息(J459)、…`, or no more than
 * `肉腫が疑われた小児（ICD10）：47症例` above a list of `横紋筋肉腫（C499）`.
 *
 * **The heading is not a disease** — the diseases are what follows it, and they
 * do not repeat `ICD10` in every bracket. An announcement therefore means two
 * things: drop this one, and read the rest of the brackets as codes.
 *
 * **It has no colon.** `Chorea(ICD10: )` is a disease whose code was left out.
 */
const ANNOUNCEMENT = /^\s*ICD\s*-?\s*10\s*(?:codes?)?\s*$/i

/** The diseases one language of one field names, in the order written. */
export function mentionsIn(text: string): DiseaseMention[] {
  const mentions: DiseaseMention[] = []
  // **An announcement carries past the line it sits on.** The heading is a
  // line of its own and the diseases fill the lines under it.
  let announced = false
  for (const line of text.split("\n")) {
    let at = 0
    // The end of the last bracket read as a disease: a bracket inside it is
    // part of that annotation.
    let within = 0
    for (const found of bracketsIn(line)) {
      if (found.start < within) continue
      const annotated = NAMES_ICD10.test(found.inner)
      if (!annotated && !announced) continue
      if (annotated && ANNOUNCEMENT.test(found.inner)) {
        announced = true
        at = found.end
        within = found.end
        continue
      }
      const codes = codesIn(found.inner.replace(NAMES_ICD10, ""))
      // After an announcement every bracket is a candidate, so one holding no
      // code at all is a count or an aside rather than a disease.
      if (!annotated && codes.length === 0) continue
      const name = nameBefore(line.slice(at, found.start))
      at = found.end
      within = found.end
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

const sameCodes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((code) => b.includes(code))

/** Every code of one side is a code of the other or the three characters above one. */
const within = (a: readonly string[], b: readonly string[]) =>
  a.every((code) => b.some((other) => code.startsWith(other) || other.startsWith(code)))

const relatedCodes = (a: readonly string[], b: readonly string[]) =>
  a.length > 0 && b.length > 0 && within(a, b) && within(b, a)

/** The codes of two sides together, without a code another one is more exact than. */
function finer(a: readonly string[], b: readonly string[]): string[] {
  const both = [...new Set([...a, ...b])]
  return both.filter((code) => !both.some((other) => other !== code && other.startsWith(code)))
}

/**
 * The diseases a field names in both languages, paired.
 *
 * **The pairing is by code, not by position.** The two languages of one field
 * do not always hold the same number of lines, and a disease named in only one
 * of them is ordinary rather than broken — it becomes a value with one name.
 * **The same codes pair in any order**, and so do codes one language wrote
 * more exactly than the other (`C16` and `C161`): the value takes the exact
 * one. Diseases with no code at all pair in the order they were written,
 * which is all there is to go on.
 *
 * **The same disease written twice becomes one value.** An article splits a
 * disease over lines when it has several groups of cases
 * (`肝硬変(ICD10: K746): 1症例` and `肝硬変(ICD10: K746): 9症例`), and the
 * counts are kept in the free text, not here.
 */
export function diseasesIn(ja: string, en: string): DiseaseSeed[] {
  // An annotation on its own leaves nothing to call the disease, and
  // an empty string on the value would read as a name that is blank.
  const named = (name: string | undefined): string | null =>
    name === undefined || name === "" ? null : name
  const waiting = mentionsIn(en)
  const japanese = mentionsIn(ja)
  const partner = new Map<DiseaseMention, { other: DiseaseMention, codes: string[] }>()
  const passes = [
    { matches: sameCodes, codes: (a: readonly string[]) => [...a] },
    { matches: relatedCodes, codes: finer },
  ]
  for (const pass of passes) {
    for (const one of japanese) {
      if (partner.has(one)) continue
      const at = waiting.findIndex((other) => (one.codes.length === 0 && other.codes.length === 0) || pass.matches(one.codes, other.codes))
      const other = at === -1 ? undefined : waiting.splice(at, 1)[0]
      if (other !== undefined) partner.set(one, { other, codes: pass.codes(one.codes, other.codes) })
    }
  }
  const seeds: DiseaseSeed[] = japanese.map((one) => {
    const paired = partner.get(one)
    return { codes: paired?.codes ?? one.codes, nameJa: named(one.name), nameEn: named(paired?.other.name) }
  })
  for (const rest of waiting) {
    seeds.push({ codes: rest.codes, nameJa: null, nameEn: named(rest.name) })
  }

  const held = new Map<string, DiseaseSeed>()
  for (const seed of seeds) {
    const key = `${seed.codes.join(" ")}|${seed.nameJa ?? ""}|${seed.nameEn ?? ""}`
    if (!held.has(key)) held.set(key, seed)
  }
  return [...held.values()]
}
