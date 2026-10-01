/**
 * ICD10 codes, and the two distributions the dictionary is built from.
 *
 * **A code is the key, not the label.** The disease vocabulary is a settled,
 * read-only vocabulary whose term codes are ICD10 codes; the classification
 * itself is what seeds and checks those terms, and nothing an administrator
 * does can edit them. Everything here is pure — the fetching and the rows
 * are in `vocabulary.server.ts`.
 *
 * **The tree is derived from the code, not held by the data.** A
 * four-character code belongs under the three-character one it starts with, so
 * the parent of `C349` is `C34` and nothing has to record it.
 */

/**
 * A code as written anywhere: with or without the point, in either case.
 * Three to five characters, because chapters (`II`) and blocks (`A00-A09`) are
 * not codes and are not imported.
 */
const CODE = /^[A-Z][0-9]{2}[0-9A-Z]{0,2}$/

/** The vocabulary whose term codes are ICD10 codes. */
export const ICD10_SET_CODE = "icd10"

/** How that vocabulary is named where it has to be made before the catalog is seeded. */
export const ICD10_SET_LABELS = { ja: "疾患", en: "Disease" } as const

/** One code as a distribution names it. Either title may be missing. */
export interface Icd10Entry {
  code: string
  titleEn: string | null
  titleJa: string | null
}

/**
 * A code in the form everything else uses: upper case, no point. Null when the
 * text is not shaped like a code at all — the upstream application form is a
 * free-text box that also holds `-`, `dummy` and whole sentences.
 */
export function icd10Code(raw: string): string | null {
  const code = raw.replace(/[\s.．]/g, "").toUpperCase()
  return CODE.test(code) ? code : null
}

/** The three-character code a longer one rolls up into. */
export function icd10Parent(code: string): string | null {
  return code.length > 3 ? code.slice(0, 3) : null
}

/**
 * How many codes a range may name before it stops being a disease. `C18-20`
 * (three) is a bowel cancer; `Q00-Q99` is the heading of a block, and expanding
 * it would put a hundred codes on one disease.
 */
const WIDEST_RANGE = 10

/** A range as the articles write it: `C40-41`, sometimes `F70-F79`. */
const RANGE = /^([A-Z])([0-9]{2})[-–~〜]([A-Z]?)([0-9]{2})$/

/**
 * The codes a range names, or null when it identifies something else. **The letters
 * have to agree** (`C00-D48` spans two chapters) and **the span has to be
 * narrow** — a wide one is a block heading, and **the three-character codes are
 * not consecutive**, so expanding it also invents codes the classification does
 * not have (there is no F74 between F73 and F78).
 */
function rangeIn(token: string): string[] | null {
  const found = RANGE.exec(token.toUpperCase())
  if (found === null) return null
  const [, letter, from, other, to] = found
  if (other !== "" && other !== letter) return null
  const span: string[] = []
  for (let n = Number(from); n <= Number(to); n += 1) {
    span.push(`${letter}${String(n).padStart(2, "0")}`)
  }
  return span.length > 0 && span.length < WIDEST_RANGE ? span : null
}

/**
 * The codes an ICD10 annotation names, in the order written, without repeats.
 * **What a bracket holds is dropped** — `C20 [NG80]` cites a guideline beside
 * the code, and the guideline number is shaped like nothing here.
 */
export function icd10CodesIn(raw: string): string[] {
  const codes = raw
    .replace(/\[[^\]]*\]/g, " ")
    .split(/[,、，;；/\s]+/)
    .flatMap((token) => {
      const span = rangeIn(token)
      if (span !== null) return span
      const code = icd10Code(token)
      return code === null ? [] : [code]
    })
  return [...new Set(codes)]
}

/**
 * The code the dictionary holds for what was written, found by **dropping the
 * tail until it matches**. Null when even the three-character root is unknown.
 *
 * **The five-character codes in the data are not typos.** They are ICD-10-CM,
 * which distinguishes diseases WHO's ICD-10 cannot — `K75.81` is NASH, `I45.81` is long
 * QT syndrome. Rounding them loses the distinction the code made, but not
 * the disease: the value keeps the name the article wrote.
 */
export function icd10Resolve(written: string, known: (code: string) => boolean): string | null {
  const code = icd10Code(written)
  if (code === null) return null
  for (let length = code.length; length >= 3; length -= 1) {
    const shorter = code.slice(0, length)
    if (known(shorter)) return shorter
  }
  return null
}

/** Code order, which is the order of the characters: digits before letters. */
function byCode(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Why two ends typed for a range are not a range. **The ends have one length**:
 * `C34-C35.9` cannot say whether it names three-character codes or
 * four-character ones, and the two readings add different codes.
 */
export type Icd10RangeProblem = "not-code" | "lengths-differ" | "reversed"

export type Icd10RangeRead
  = | { state: "range", lower: string, upper: string }
    | { state: "problem", problem: Icd10RangeProblem }

/** The two ends of a range as typed, normalised as a code is (`icd10Code`). */
export function icd10Range(lowerRaw: string, upperRaw: string): Icd10RangeRead {
  const lower = icd10Code(lowerRaw)
  const upper = icd10Code(upperRaw)
  if (lower === null || upper === null || lower.length > 4 || upper.length > 4) {
    return { state: "problem", problem: "not-code" }
  }
  if (lower.length !== upper.length) return { state: "problem", problem: "lengths-differ" }
  if (byCode(lower, upper) > 0) return { state: "problem", problem: "reversed" }
  return { state: "range", lower, upper }
}

/**
 * Whether a code is one a range names: as long as its ends, and between them
 * in code order. **Only the classification's codes are asked**, so a range
 * names the codes the classification has and skips the ones it does not —
 * `C00-C80` holds no C27 to C29.
 */
export function icd10InRange(code: string, range: { lower: string, upper: string }): boolean {
  return code.length === range.lower.length && byCode(code, range.lower) >= 0 && byCode(code, range.upper) <= 0
}

/**
 * The index of each code among the classification's codes of its length, in
 * code order. **Two codes are consecutive when their indexes are**, which is not
 * the same as their digits being: there is no C27 to C29, so C26 and C30 are
 * consecutive, and so are C343 and C348.
 */
export function icd10Order(codes: Iterable<string>): Map<string, number> {
  const byLength = new Map<number, string[]>()
  for (const code of new Set(codes)) {
    const group = byLength.get(code.length) ?? []
    group.push(code)
    byLength.set(code.length, group)
  }
  const order = new Map<string, number>()
  for (const group of byLength.values()) {
    group.sort(byCode).forEach((code, at) => {
      order.set(code, at)
    })
  }
  return order
}

/** How many consecutive codes it takes to be shown as a range. */
const SHORTEST_SPAN = 3

/**
 * Codes as a disease's chip shows them: in code order, with **every run of three
 * or more consecutive codes written as its two ends** (`C10-C30`). A disease
 * added as a range holds every code in it, and listed one by one they fill the
 * line the disease's name is on.
 *
 * **Two are left as two.** Consecutive skips what the classification does not
 * have, so C26 and C30 are a run, and written `C26-C30` they read as a range
 * that whoever chose them did not have in mind.
 *
 * Three-character and four-character codes run separately, as a range's ends
 * have one length. A code without an index (`icd10Order`) stands alone.
 */
export function icd10Spans(codes: readonly string[], order: ReadonlyMap<string, number>): string[] {
  const runs: string[][] = []
  const byLength = new Map<number, string[]>()
  for (const code of new Set(codes)) {
    if (!order.has(code)) {
      runs.push([code])
      continue
    }
    const group = byLength.get(code.length) ?? []
    group.push(code)
    byLength.set(code.length, group)
  }
  const index = (code: string): number => order.get(code) ?? 0
  for (const group of byLength.values()) {
    let run: string[] = []
    for (const code of group.sort((a, b) => index(a) - index(b))) {
      const last = run.at(-1)
      if (last !== undefined && index(code) !== index(last) + 1) {
        runs.push(run)
        run = []
      }
      run.push(code)
    }
    if (run.length > 0) runs.push(run)
  }
  return runs
    .flatMap((run) => {
      const [first] = run
      const last = run.at(-1)
      return run.length >= SHORTEST_SPAN && first !== undefined && last !== undefined
        ? [{ first, text: `${first}-${last}` }]
        : run.map((code) => ({ first: code, text: code }))
    })
    .sort((a, b) => byCode(a.first, b.first))
    .map((span) => span.text)
}

/** The page of WHO's ICD-10 browser that shows a code. It writes the code with its point. */
export function icd10WhoUrl(code: string): string {
  const dotted = code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code
  return `https://icd.who.int/browse10/2019/en#/${dotted}`
}

/**
 * Whether WHO's distribution names a code. **Nothing records it, but the
 * titles show it**: a code WHO names has WHO's English title, and the import
 * gave a code it does not name the Japanese title, or the code itself, in the
 * English column (`vocabulary.server.ts` の `labelsOf`).
 */
export function icd10NamedByWho(term: { code: string, labelEn: string, labelJa: string | null }): boolean {
  return term.labelEn !== term.labelJa && term.labelEn !== term.code
}

/**
 * WHO's meta distribution: semicolon-separated, one line per code, no header.
 * Column 8 is the code without its point and column 9 its title; the columns
 * after that repeat the titles of the ancestors and index the tabulation lists,
 * and none of them is wanted.
 *
 * Lines that are not codes are skipped rather than trusted, because the format
 * is positional and a shifted line would otherwise become an entry.
 */
export function parseWhoMeta(text: string): Icd10Entry[] {
  const entries: Icd10Entry[] = []
  for (const line of text.split("\n")) {
    const fields = line.replace(/\r$/, "").split(";")
    if (fields.length < 9) continue
    const code = icd10Code(fields[7] ?? "")
    const title = (fields[8] ?? "").trim()
    if (code === null || title === "") continue
    entries.push({ code, titleEn: title, titleJa: null })
  }
  return entries
}

/**
 * The dagger and the asterisk, which e-Stat writes into the code column.
 *
 * **They are notation, not part of the code.** A dagger marks the aetiology
 * (`E14.2†`) and an asterisk the manifestation (`F00*`) of a condition the
 * classification files under two codes; the code itself is the plain one, which
 * is what WHO's distribution and every article write. Left in, 451 of the rows
 * fail the shape test and lose their Japanese title while keeping the English
 * one — a code named in one language only, for no reason in the data.
 */
const ESTAT_MARKS = /[†*]/g

/**
 * The Japanese statistical classification as e-Stat exports it: a CSV whose
 * first line is the classification's own name, then a header, then one row per
 * item. Chapters and blocks share the column with the codes and are dropped by
 * the same shape test.
 */
export function parseEstatCsv(text: string): Icd10Entry[] {
  const entries: Icd10Entry[] = []
  for (const row of parseCsv(text)) {
    if (row.length < 2) continue
    const code = icd10Code((row[0] ?? "").replace(ESTAT_MARKS, ""))
    const title = (row[1] ?? "").trim()
    if (code === null || title === "") continue
    entries.push({ code, titleEn: null, titleJa: title })
  }
  return entries
}

/**
 * The two distributions as one dictionary. **A code held by only one of them
 * keeps the title it has** — they follow different versions of the
 * classification (2019 and 2013), so a row with one side missing is expected.
 * Earlier entries win, so the caller decides which distribution is authoritative
 * for a title by the order it passes them in.
 */
export function mergeEntries(...groups: readonly Icd10Entry[][]): Icd10Entry[] {
  const held = new Map<string, Icd10Entry>()
  for (const group of groups) {
    for (const entry of group) {
      const one = held.get(entry.code)
      if (one === undefined) {
        held.set(entry.code, { ...entry })
        continue
      }
      one.titleEn ??= entry.titleEn
      one.titleJa ??= entry.titleJa
    }
  }
  return [...held.values()].sort((a, b) => byCode(a.code, b.code))
}

/** Rows of a CSV, with quoted fields that may hold commas and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const endField = () => {
    row.push(field.replace(/\r$/, ""))
    field = ""
  }
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i)
    if (quoted) {
      if (c !== "\"") {
        field += c
      } else if (text.charAt(i + 1) === "\"") {
        field += "\""
        i += 1
      } else {
        quoted = false
      }
      continue
    }
    if (c === "\"") {
      quoted = true
    } else if (c === ",") {
      endField()
    } else if (c === "\n") {
      endField()
      rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== "" || row.length > 0) {
    endField()
    rows.push(row)
  }
  return rows
}
