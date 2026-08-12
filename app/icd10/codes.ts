/**
 * ICD10 codes, and the two distributions the dictionary is built from.
 *
 * **A code is the key, not the label.** The disease vocabulary is an ordinary
 * editable vocabulary whose term codes happen to be ICD10 codes; the
 * classification itself is a dictionary beside it that seeds and checks those
 * terms without ever writing them (docs/data-model.md の「ICD10」). Everything
 * here is pure — the fetching and the rows are in `dictionary.server.ts`.
 *
 * **The tree is derived from the code, not carried by the data.** A
 * four-character code belongs under the three-character one it starts with, so
 * the parent of `C349` is `C34` and nothing has to record it.
 */

/**
 * A code as written anywhere: with or without the point, in either case.
 * Three to five characters, because chapters (`II`) and blocks (`A00-A09`) are
 * not codes and are not taken in.
 */
const CODE = /^[A-Z][0-9]{2}[0-9A-Z]{0,2}$/

/** The vocabulary whose term codes are ICD10 codes. */
export const ICD10_SET_CODE = "icd10"

/** One entry of the dictionary. Either title may be missing. */
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

/** The codes a free-text field names, in the order written, without repeats. */
export function icd10CodesIn(raw: string): string[] {
  const codes = raw
    .split(/[,、;；/\s]+/)
    .flatMap((token) => {
      const code = icd10Code(token)
      return code === null ? [] : [code]
    })
  return [...new Set(codes)]
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
 * The Japanese statistical classification as e-Stat exports it: a CSV whose
 * first line is the classification's own name, then a header, then one row per
 * item. Chapters and blocks share the column with the codes and are dropped by
 * the same shape test.
 */
export function parseEstatCsv(text: string): Icd10Entry[] {
  const entries: Icd10Entry[] = []
  for (const row of parseCsv(text)) {
    if (row.length < 2) continue
    const code = icd10Code(row[0] ?? "")
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
  return [...held.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
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
