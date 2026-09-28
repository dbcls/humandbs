/**
 * A dataset's values that name the dataset itself.
 *
 * The articles wrote one table for several datasets and told their lines apart
 * by the dataset's ID: a heading (`【JGAS000557/JGAD000678】`), a label before
 * the line (`JGAD000077：…`), the ID at the end (`Cycle/蛍光タンパク質対応表
 * （JGAD000696）`, `乳がん(JGAD000457)`). Once the table is divided, each
 * dataset keeps its own lines, and on its page the ID only repeats the page's
 * own. **The ID is taken out only where it is the dataset's own and in one of
 * those places**: an ID inside a sentence (`1,026名のWGSデータ（JGAD000220）を
 * 含む`) belongs to the sentence, and a cell that heads a line with
 * another dataset's ID (`【JGAD000366/E-GEAD-414】`) still tells two datasets
 * apart and is left whole.
 *
 * The dataset's own IDs are its labels and, for a JGA dataset, its study: the
 * articles headed a JGA dataset's lines with the study as often as with the
 * dataset, and the page names the study too.
 *
 * A number's label loses the ID at its end the same way, unless nothing would
 * be left of it or it would read the same as another number's label.
 */

import type { Line, RichText } from "~/content/types"

import type { SourceContentValue, SourceDatasetContent, SourceNumber, SourceValueSlot } from "./number-words"

export interface OwnIdContext {
  /** Every ID the dataset is known by, and the JGA studies of those. */
  own: ReadonlySet<string>
  /** Keys whose values are left as they are. */
  skippedKeys: ReadonlySet<string>
}

export interface OwnIdChange {
  keyId: string
  experiment: string | null
  lang: "ja" | "en"
  before: string
  after: string
}

/** An accession of any archive, the dataset's own or another's. */
const ACCESSION = String.raw`(?:JGA[DS]\d{6}|NHA\d{6}|[DSE]RA\d{6}|E-GEAD-\d+|E-MTAB-\d+|GS[EM]\d+|EGA[DS]\d{11}|MTBK[SC]\d+|PXD\d+|JPST\d{6}|hum\d{4}(?:\.[\w-]+)+)`
/** No more of an ID follows: `JGAD0006961` is not `JGAD000696`, nor `…mfi.v12` `…mfi.v1`. */
const END = String.raw`(?![\w-]|\.\w)`
const SEPARATOR = String.raw`\s*[/、,]\s*`

function escaped(id: string): string {
  return id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

interface Shapes {
  /** Any of the dataset's IDs, wherever it is. */
  id: RegExp
  /** The heading and the label a line starts with, any number of them. */
  prefix: RegExp
  /** The bracket and the `for` a line ends with, any number of them. */
  suffix: RegExp
}

function shapesOf(own: ReadonlySet<string>): Shapes | null {
  if (own.size === 0) return null
  const id = `(?:${[...own].sort((a, b) => b.length - a.length).map(escaped).join("|")})${END}`
  const tag = `${id}(?:${SEPARATOR}${id})*`
  const one = String.raw`(?:[【\[]\s*${tag}\s*[】\]]|${tag}\s*[：:])`
  const end = String.raw`(?:[（(]\s*${tag}\s*[）)]|\sfor\s+${tag})`
  return {
    id: new RegExp(id),
    prefix: new RegExp(String.raw`^\s*(?:${one}\s*)+`),
    suffix: new RegExp(String.raw`(?:\s*${end})+\s*$`),
  }
}

const OTHER_HEADING = new RegExp(String.raw`[【\[]([^】\]]*)[】\]]`, "g")
const LEADING_LABEL = new RegExp(String.raw`^\s*((?:${ACCESSION}${END}(?:${SEPARATOR})?)+)\s*[：:]`)

/** Whether a line heads or labels itself with an ID that is not the dataset's. */
function namesAnother(line: string, own: ReadonlySet<string>): boolean {
  const accessions = (said: string) => [...said.matchAll(new RegExp(`${ACCESSION}${END}`, "g"))].map((found) => found[0])
  for (const found of line.matchAll(OTHER_HEADING)) {
    if (accessions(found[1] ?? "").some((one) => !own.has(one))) return true
  }
  const label = LEADING_LABEL.exec(line)?.[1]
  return label !== undefined && accessions(label).some((one) => !own.has(one))
}

const textOf = (line: Line) => line.map((span) => span.text).join("")

/** The line without the characters from `from` to `to`, each span keeping what is left of it. */
function cut(line: Line, from: number, to: number): Line {
  const out: Line = []
  let at = 0
  for (const span of line) {
    const start = at
    at += span.text.length
    const kept = span.text.slice(0, Math.max(0, from - start)) + span.text.slice(Math.max(0, to - start))
    if (kept !== "") out.push({ ...span, text: kept })
  }
  return out
}

/** The line without the dataset's heading, label and closing ID, or null where nothing else is on it. */
function trimmed(line: Line, shapes: Shapes): Line | null {
  let out = line
  const prefix = shapes.prefix.exec(textOf(out))
  if (prefix !== null) out = cut(out, 0, prefix[0].length)
  const said = textOf(out)
  const suffix = shapes.suffix.exec(said)
  if (suffix !== null) out = cut(out, suffix.index, said.length)
  if (out === line) return line
  return textOf(out).trim() === "" ? null : out
}

/** Empty lines at either end, and more than one in a row, left by a line taken out. */
function tidied(lines: RichText): RichText {
  const out: RichText = []
  for (const line of lines) {
    const empty = textOf(line).trim() === ""
    if (empty && (out.length === 0 || textOf(out.at(-1) ?? []).trim() === "")) continue
    out.push(line)
  }
  while (out.length > 0 && textOf(out.at(-1) ?? []).trim() === "") out.pop()
  return out
}

function withoutInText(lines: RichText, own: ReadonlySet<string>, shapes: Shapes): RichText {
  if (lines.some((line) => namesAnother(textOf(line), own))) return lines
  let taken = false
  const kept: RichText = []
  for (const line of lines) {
    const out = trimmed(line, shapes)
    if (out !== line) taken = true
    if (out !== null) kept.push(out)
  }
  return taken ? tidied(kept) : lines
}

/** Each number with the dataset's ID taken off the end of its label, where that still tells it apart. */
function withoutInLabels(values: SourceNumber[], shapes: Shapes): SourceNumber[] {
  const side = (said: string) => {
    const found = shapes.suffix.exec(said)
    return found === null ? said : said.slice(0, found.index)
  }
  const proposed = values.map((one) => (one.label === null ? null : { ja: side(one.label.ja), en: side(one.label.en) }))
  return values.map((one, at) => {
    const next = proposed[at]
    if (one.label === null || next === null || next === undefined) return one
    if (next.ja === one.label.ja && next.en === one.label.en) return one
    if ((one.label.ja !== "" && next.ja.trim() === "") || (one.label.en !== "" && next.en.trim() === "")) return one
    const same = proposed.some((other, i) => i !== at && other !== null && (other.ja === next.ja || (other.en !== "" && other.en === next.en)))
    return same ? one : { ...one, label: next }
  })
}

const linesText = (lines: RichText) => lines.map(textOf).join("\n")

interface Side {
  lang: "ja" | "en"
  was: RichText
  out: RichText
}

function settledValue(
  value: SourceContentValue,
  own: ReadonlySet<string>,
  shapes: Shapes,
  record: (lang: "ja" | "en", before: string, after: string) => void,
): SourceContentValue {
  if (value.kind === "text") {
    const sides: Side[] = []
    for (const lang of ["ja", "en"] as const) {
      const slot = value.text[lang]
      if (slot.state === "value") sides.push({ lang, was: slot.value, out: withoutInText(slot.value, own, shapes) })
    }
    const changed = sides.filter((side) => side.out !== side.was)
    if (changed.length === 0) return value
    // A side left naming the dataset would say what the other no longer does.
    if (sides.some((side) => side.out === side.was && shapes.id.test(linesText(side.was)))) return value
    const text = { ...value.text }
    for (const side of changed) {
      record(side.lang, linesText(side.was), linesText(side.out))
      text[side.lang] = { state: "value", value: side.out }
    }
    return { ...value, text }
  }
  if (value.kind === "number" && value.values.state === "value") {
    const held = value.values.value
    const out = withoutInLabels(held, shapes)
    const relabelled = out.flatMap((one, at) => {
      const was = held[at]
      return one === was || one.label === null || was?.label == null ? [] : [{ was: was.label, now: one.label }]
    })
    if (relabelled.length === 0) return value
    for (const { was, now } of relabelled) {
      record("ja", was.ja, now.ja)
      record("en", was.en, now.en)
    }
    return { ...value, values: { state: "value", value: out } }
  }
  return value
}

export function withoutOwnIds<D extends SourceDatasetContent>(content: D, context: OwnIdContext): { content: D, changes: OwnIdChange[] } {
  const shapes = shapesOf(context.own)
  if (shapes === null) return { content, changes: [] }
  const changes: OwnIdChange[] = []
  const settled = (slots: SourceValueSlot[], experiment: string | null): SourceValueSlot[] => {
    const out = slots.map((slot) => {
      if (context.skippedKeys.has(slot.keyId)) return slot
      const value = settledValue(slot.value, context.own, shapes, (lang, before, after) => {
        if (before !== after) changes.push({ keyId: slot.keyId, experiment, lang, before, after })
      })
      return value === slot.value ? slot : { ...slot, value }
    })
    return out.every((slot, at) => slot === slots[at]) ? slots : out
  }
  const values = settled(content.values, null)
  const experiments = content.experiments.map((experiment) => {
    const out = settled(experiment.values, experiment.id)
    return out === experiment.values ? experiment : { ...experiment, values: out }
  })
  if (values === content.values && experiments.every((one, at) => one === content.experiments[at])) return { content, changes }
  return { content: { ...content, values, experiments }, changes }
}
