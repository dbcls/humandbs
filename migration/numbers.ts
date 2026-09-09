/**
 * Reading the numbers out of v1's free-text cells.
 *
 * **v1 wrote a table into a cell.** `Total Data Volume` holds lines like
 * `GWAS: 平均 123 MB(zip)`, `Variant Number` holds `常染色体: 5,961,600 SNVs(hg19)`
 * — a label saying which number it is, the number, its unit, and a word
 * qualifying it. More than half of these cells run to several lines: 77% of the
 * variant counts and 56% of the data volumes. Held as prose none of it can be
 * filtered by, which is why v1 kept a second layer of numbers beside the text,
 * read out by a language model, and why the same fact lived in two places.
 *
 * v2 holds the whole table under one key (`NumberValue[]` in
 * `app/content/types.ts`), so what is needed here is the reading, not a second
 * home for the result.
 *
 * **What cannot be read is left as prose.** A rule that guesses is worse than
 * one that declines: the value stays a text cell, and the residue is a list
 * somebody works through. Measured over the dump the rules below read 74–99% of
 * the lines depending on the key, and every line they decline is counted.
 *
 * **This runs again at cutover, over data that has moved on.** What is here was
 * written against a dump taken at one moment; the real migration reads the
 * archive as it stands then, and every count in these comments is a count of
 * that dump rather than a property of the rules. Three things follow:
 *
 * - **The residue has to be re-read.** `input/unread-numbers.json` is produced
 *   by a run, not carried between them, and lines that were read by hand are
 *   matched by their exact text (`input/read-by-hand.json`). A line whose
 *   wording changed upstream falls back into the residue rather than being read
 *   as something it no longer says, which is the safe direction — but it means
 *   the by-hand file is a starting point at cutover, not an answer
 * - **The coverage figures have to be measured again**, because whether a rule
 *   reads 90% or 60% of a key is what decides if that key should be a number at
 *   all
 * - **Nothing here is idempotent and nothing needs to be.** The development
 *   load rebuilds from the dump every time; the cutover runs once against the
 *   real archive and is checked by hand
 */

import type { NumberValue } from "~/content/types"

/** A line as it was written, split into the four things v2 stores. */
export interface ReadNumber {
  label: string | null
  value: number
  /** As written. The catalog's canonical unit is applied by the caller. */
  unit: string | null
  note: string | null
}

/** The multipliers a Japanese count may be written with. */
const KANJI: Readonly<Record<string, number>> = { 万: 1e4, 億: 1e8, 兆: 1e12 }

/**
 * The first colon standing outside any bracket. A value carries colons of its
 * own — `bam [ref: hg19]` — and the first one anywhere would read those as
 * labels. Measured over the data volumes, the naive split misreads 74 lines.
 */
function topLevelColon(line: string): number {
  let depth = 0
  for (let at = 0; at < line.length; at += 1) {
    const ch = line[at] ?? ""
    if ("([（［".includes(ch)) depth += 1
    else if (")]）］".includes(ch)) depth = Math.max(0, depth - 1)
    else if ((ch === ":" || ch === "：") && depth === 0) return at
  }
  return -1
}

/** A number as written: digits, thousands separators, and a kanji multiplier. */
function readNumber(written: string): number | null {
  const kanji = /^([\d,]+(?:\.\d+)?)([万億兆])$/.exec(written.trim())
  if (kanji !== null) {
    const [, digits = "", mark = ""] = kanji
    return Number(digits.replace(/,/g, "")) * (KANJI[mark] ?? 1)
  }
  const plain = Number(written.trim().replace(/,/g, ""))
  return Number.isFinite(plain) && written.trim() !== "" ? plain : null
}

/** What is left of a line once the number and its unit are taken out of it. */
function noteOf(...parts: (string | undefined)[]): string | null {
  const said = parts
    .flatMap((part) => (part === undefined ? [] : [part]))
    .join(" ")
    .replace(/[（(]\s*[)）]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[、,;\s]+|[、,;\s.。]+$/g, "")
    .trim()
  // v1 writes the qualifier in brackets because it sits inside a sentence.
  // Standing on its own in a field of its own, the brackets say nothing — and
  // the field puts it in brackets again, so leaving them makes two pairs.
  const held = said.replace(/[（()）]/g, " ").replace(/\s+/g, " ").trim()
  return held === "" ? null : held
}

/**
 * The parts of the genome a count is taken over. **The one closed vocabulary
 * in these cells**: everything else a label says — a cohort, a platform, a
 * trait — is open and grows with the data, but the human genome has these
 * parts and will not grow more. v1 writes the part either before the number as
 * a label or after it in brackets, and both mean the same thing.
 */
const REGIONS: Readonly<Record<string, string>> = {
  "常染色体": "常染色体",
  "autosomes": "常染色体",
  "autosomal": "常染色体",
  "X染色体": "X染色体",
  "X 染色体": "X染色体",
  "X-chromosome": "X染色体",
  "X-chromosomal": "X染色体",
  "Y染色体": "Y染色体",
  "Y 染色体": "Y染色体",
  "Y-chromosome": "Y染色体",
  "ミトコンドリア": "ミトコンドリア",
  "mitochondrial DNA": "ミトコンドリア",
  "全ゲノム": "全ゲノム",
}

function region(said: string): string | undefined {
  return REGIONS[said] ?? REGIONS[said.toLowerCase()]
}

/**
 * A region spelled the one way, and moved out of the note when that is where
 * v1 put it. **The spelling is settled here because it is a vocabulary** — the
 * dump writes the same part four ways (`X染色体`, `X 染色体`, `X-chromosome`,
 * `X-chromosomal`), and a facet cannot count one thing under four names.
 */
function named(one: ReadNumber): ReadNumber {
  if (one.label === null && one.note !== null) {
    const found = region(one.note)
    if (found !== undefined) return { ...one, label: found, note: null }
  }
  if (one.label !== null) {
    const found = region(one.label)
    if (found !== undefined) return { ...one, label: found }
  }
  return one
}

/**
 * A whole cell, line by line. An empty line says nothing and is dropped.
 *
 * **A reader answers with `null` when it could not read the line, and with an
 * empty list when it read it and there is no number in it.** The two are not
 * the same thing: the first is work for somebody, the second is a line somebody
 * has already looked at (`ReadByHand`). Collapsing them would put every line a
 * person settled back into the residue on the next run.
 */
export function readCell(
  text: string,
  line: (said: string) => ReadNumber[] | null,
): { read: ReadNumber[], declined: string[] } {
  const read: ReadNumber[] = []
  const declined: string[] = []
  for (const raw of text.split("\n")) {
    const said = raw.trim()
    if (said === "") continue
    const got = line(said)
    if (got === null) declined.push(said)
    else read.push(...got.map(named))
  }
  return { read, declined }
}

/** The label and what follows it, where a line carries one. */
function labelled(line: string): { label: string | null, rest: string } {
  const at = topLevelColon(line)
  if (at === -1) return { label: null, rest: line }
  const label = line.slice(0, at).trim()
  // **A label may hold digits.** Platform names and accessions do —
  // `HumanOmni2.5-4v1`, `JGAD000867` — and refusing those made the rest of the
  // line look like one reading with two numbers in it, which is then declined.
  // What is not a label is a reading: a number, with or without its unit.
  const reading = /^[\d,]+(?:\.\d+)?\s*[A-Za-z%×倍]*$/.test(label)
  return label === "" || reading
    ? { label: null, rest: line }
    : { label, rest: line.slice(at + 1).trim() }
}

/**
 * A number with its unit somewhere in a line, and everything else kept as the
 * note. `units` is the spelling the key admits, longest first so that `kbp`
 * wins over `bp`.
 */
/**
 * The spelling a unit is stored under, given how it was written.
 *
 * **Case is not meaning here, except where it is.** `gb` and `GB` are the same
 * unit written carelessly; `kb` and `kB` are not — one is a thousand bases and
 * the other a thousand bytes — which is why the table is per key rather than
 * global. What is matched case-insensitively is folded onto the spelling the
 * key declares; anything else is named in the key's own aliases.
 */
function unitAs(matched: string, units: readonly string[], aliases: Readonly<Record<string, string>>): string {
  const declared = units.find((one) => one.toLowerCase() === matched.toLowerCase()) ?? matched
  return aliases[matched] ?? aliases[declared] ?? declared
}

function withUnit(
  whole: string,
  units: readonly string[],
  label: string | null,
  aliases: Readonly<Record<string, string>> = {},
): ReadNumber[] {
  const { said: rest, spread: moves } = withoutSpread(whole)
  const spelled = [...units].sort((a, b) => b.length - a.length)
    .map((one) => one.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")
  const found = new RegExp(
    String.raw`([\d,]+(?:\.\d+)?[万億兆]?)\s*(${spelled})(?![A-Za-z0-9])`,
    "i",
  ).exec(rest)
  if (found === null) return []
  const value = readNumber(found[1] ?? "")
  if (value === null) return []
  const before = rest.slice(0, found.index)
  const after = rest.slice(found.index + found[0].length)
  const unit = found[2] === undefined ? null : unitAs(found[2], units, aliases)
  return [{ label, value, unit, note: noteOf(before, after, moves ?? undefined) }]
}

/**
 * A spread written after the value — `28.70 ± 4.16`. The number is the first
 * one; what follows the sign says how much it moves, which is a remark about
 * the number rather than a second number.
 */
function withoutSpread(rest: string): { said: string, spread: string | null } {
  const at = /\s*[±].*$/.exec(rest)
  return at === null ? { said: rest, spread: null } : { said: rest.slice(0, at.index), spread: at[0].trim() }
}

/** A bare number, for a key whose unit is the key itself. */
function withoutUnit(whole: string, label: string | null): ReadNumber[] {
  const { said: rest, spread: moves } = withoutSpread(whole)
  const found = /([\d,]+(?:\.\d+)?[万億兆]?)/.exec(rest)
  if (found === null) return []
  const value = readNumber(found[1] ?? "")
  if (value === null) return []
  return [{
    label,
    value,
    unit: null,
    note: noteOf(rest.slice(0, found.index), rest.slice(found.index + found[0].length), moves ?? undefined),
  }]
}

/**
 * Whether a line holds more than one number, which this file declines rather
 * than picking one of them. Two shapes: a range (`0.9-1.3 GB`) and a sum
 * (`73 TB(fastq)＋49 TB(bam)`). Both are one fact written as two, and reducing
 * either to a single number invents a value nobody wrote.
 */
function several(rest: string, units: readonly string[]): boolean {
  if (/[\d.]\s*[-〜～~]\s*[\d.]/.test(rest)) return true
  if (/[\d.）)]\s*[＋+]\s*[\d.\s]/.test(rest)) return true
  const spelled = [...units].map((one) => one.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  if (spelled === "") return false
  const all = rest.match(new RegExp(String.raw`[\d,.]+\s*(?:${spelled})(?![A-Za-z0-9])`, "gi"))
  return (all?.length ?? 0) > 1
}

/** Where a run of characters sits outside every bracket. */
function outside(line: string, at: number): boolean {
  let depth = 0
  for (let i = 0; i < at; i += 1) {
    const ch = line[i] ?? ""
    if ("([（［".includes(ch)) depth += 1
    else if (")]）］".includes(ch)) depth = Math.max(0, depth - 1)
  }
  return depth === 0
}

/** The parts of a line separated by one of `marks`, brackets kept whole. */
function topLevelSplit(line: string, marks: RegExp): string[] {
  const parts: string[] = []
  let from = 0
  for (const found of line.matchAll(marks)) {
    const at = found.index
    if (!outside(line, at)) continue
    parts.push(line.slice(from, at))
    from = at + found[0].length
  }
  parts.push(line.slice(from))
  return parts.map((part) => part.trim()).filter((part) => part !== "")
}

/**
 * Two readings written as one line. v1 uses three shapes and they mean
 * different things, so each is read into the rows it stands for:
 *
 * - `常染色体: 31.8x、X染色体: 28.0x` — two labelled facts sharing a line
 * - `61,608,817 variants(常染色体: 59,387,070、X染色体: 2,221,747)` — a total and
 *   what it is made of. All three are kept: a reader looking for the total and
 *   one looking for the part are both asking something the cell answers
 * - `101 bp もしくは 93 bp` — two readings neither of which is the value
 *
 * What is **not** split is a range or a sum (`0.9-1.3 GB`, `73 TB＋49 TB`).
 * Those are one fact written as two numbers, and either half of them alone is a
 * value nobody wrote.
 */
/**
 * The marks that separate two readings sharing a line. **A comma is only one of
 * them when it does not sit between digits** — it is also the thousands
 * separator, and splitting `2,443,177` on it turns one number into three.
 */
const SHARING = /[、,](?![0-9])|(?<![0-9])[、,]|\s*もしくは\s*|\s*または\s*|\s+or\s+/g

/** A total with its parts in brackets: `61,608,817 variants(常染色体: 59,387,070…)`. */
const BREAKDOWN = /^(.*?)[（(]([^（()）]*[:：][^（()）]*)[)）]\s*$/

function spread(
  said: string,
  units: readonly string[],
  one: (part: string, label: string | null) => ReadNumber[],
): ReadNumber[] | null {
  // Split before reading a label, not after: `HiSeq 2500: 31.8x、NovaSeq: 28.0x`
  // carries a label per part, and taking the first one for the whole line would
  // leave the rest looking like one reading with two numbers in it.
  const shared = topLevelSplit(said, SHARING)
  if (shared.length > 1) {
    const each = shared.flatMap((part) => {
      const held = labelled(part)
      return one(held.rest, held.label)
    })
    if (each.length === shared.length) return each
  }

  const { label, rest } = labelled(said)

  // A sum is not one number written oddly — it is the parts, added up by
  // whoever wrote it. `73 TB(fastq)＋49 TB(bam、vcf)` is the two rows it looks
  // like. Where only the last part carries a unit (`2.4＋1.4 TB`), the unit is
  // the line's and the earlier parts borrow it.
  const added = topLevelSplit(rest, /[＋+](?=[\s\d])/g)
  if (added.length > 1) {
    const trailing = /([A-Za-z%×倍]+)\s*[（(][^)）]*[)）]\s*$|([A-Za-z%×倍]+)\s*$/
      .exec(added[added.length - 1] ?? "")
    const borrowed = trailing?.[1] ?? trailing?.[2] ?? ""
    const each = added.flatMap((part) => {
      const held = labelled(part)
      const whole = /[A-Za-z%×倍]/.test(held.rest) || borrowed === ""
        ? held.rest
        : `${held.rest} ${borrowed}`
      return one(whole, held.label ?? label)
    })
    if (each.length === added.length) return each
  }

  const composite = BREAKDOWN.exec(rest)
  if (composite !== null) {
    const parts = topLevelSplit(composite[2] ?? "", SHARING).flatMap((part) => {
      const held = labelled(part)
      return held.label === null ? [] : one(held.rest, held.label)
    })
    // The total and what it is made of are both kept: a reader looking for one
    // and a reader looking for the other are each asking what the cell answers.
    if (parts.length > 1) return [...one(composite[1] ?? "", label), ...parts]
  }

  if (several(rest, units)) return null
  const held = one(rest, label)
  return held.length === 0 ? null : held
}

/** The reader for a key that writes its numbers with a unit. */
export function numbersWithUnit(
  units: readonly string[],
  aliases: Readonly<Record<string, string>> = {},
) {
  return (said: string): ReadNumber[] | null =>
    spread(said, units, (part, label) => withUnit(part, units, label, aliases))
}

/**
 * The reader for a key that counts things. The unit is the key — a gene number
 * is a number of genes — so a bare figure is a value rather than a line that
 * declined to say what it measures.
 */
export function counts(units: readonly string[] = []) {
  return (said: string): ReadNumber[] | null =>
    spread(said, units, (part, label) => {
      const withOne = units.length === 0 ? [] : withUnit(part, units, label)
      return withOne.length > 0 ? withOne : withoutUnit(part, label)
    })
}

/** What the catalog stores, once the unit a line was written in is converted. */
export function storedNumber(
  read: ReadNumber,
  converted: number,
  canonical: string | null,
): NumberValue {
  return {
    label: read.label,
    value: converted,
    unit: canonical,
    inputValue: read.value,
    inputUnit: read.unit,
    note: read.note,
  }
}

/**
 * The lines somebody read by hand, kept by the exact words they were read from.
 *
 * **The key is the text itself, not a position.** A run rebuilds from the dump,
 * so there is no row to point at; and matching on the words means a line whose
 * wording changed upstream falls back into the residue rather than being read
 * as something it no longer says. At cutover that is the safe direction, and it
 * is also why this file is a starting point there rather than an answer.
 *
 * An entry with nothing in `read` is not missing — it is a line somebody looked
 * at and decided holds no number. Recording that is what keeps it out of the
 * residue on the next run.
 */
export interface ReadByHand {
  sourceKey: string
  line: string
  read: ReadNumber[]
  /** Why it was read that way, or why it could not be. */
  why: string
}

export function byHand(entries: readonly ReadByHand[]): Map<string, ReadNumber[]> {
  return new Map(entries.map((one) => [`${one.sourceKey}\u0000${one.line.trim()}`, one.read]))
}

/**
 * A reader that consults what was read by hand before applying its rules.
 * **By hand wins**: somebody looked at the line, and a rule that disagrees with
 * a person who read it is a rule that is wrong about that line.
 */
export function withHandReadings(
  sourceKey: string,
  read: (said: string) => ReadNumber[] | null,
  hand: ReadonlyMap<string, ReadNumber[]>,
): (said: string) => ReadNumber[] | null {
  return (said) => hand.get(`${sourceKey}\u0000${said.trim()}`) ?? read(said)
}
