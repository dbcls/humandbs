/**
 * The files a portal dataset's NBDC Dataset Accession cells link, selected, and
 * the cells whose every line its file table already shows, taken out.
 *
 * The articles listed a portal dataset's files in this cell: the dataset's ID
 * linked to its data, a `Dictionary file`, at times a caption over each ID
 * (`不整脈` over `hum0014.v17.AR.v1`). The dataset's files have a table of
 * their own, with a label on each file, so a cell of nothing but those links
 * repeats the table.
 *
 * - **A file the dataset's own cell links is one of its files**, and is
 *   selected where the research's prefix holds it. A line captioned for another
 *   dataset (`GWAS: Dictionary file` in the cell of the dataset whose own line
 *   is `RHM: hum0261.v1.rhm.v1`), and a link whose words are another dataset's
 *   ID, are that dataset's and select nothing here.
 * - **A cell is taken out only where the dataset's page shows every line of it
 *   elsewhere**: the dataset's own ID, which the page shows; a link to a file
 *   the dataset selects that has a label, or whose words are the dataset's ID
 *   or the file's name; the bullets, numbers and brackets of a list; words the
 *   labels of the line's files hold (`Dictionary file（BBJ、EUR、META）`); a
 *   caption that the next line's file has as its label; the caption before a
 *   colon of the line with the dataset's own ID; and a line captioned for
 *   another dataset whose file one of the research's datasets selects. A
 *   heading alone on its line (`【GWAS】`) goes with the lines under it, so in a
 *   cell of such groups a group the page shows all of elsewhere is taken out
 *   and the others stay, where both languages are grouped the same way.
 * - A dataset of an external archive selects no files, and its cells stay.
 *
 * A footnote mark (`アトピー性皮膚炎＊`) is not read: the note it points at was
 * in the article's policy row, and a policy is a term.
 */

import type { Bilingual, DatasetContent, Line, RichText, Slot, ValueSlot } from "~/content/types"
import { inListingOrder } from "~/files/selection"

export interface NbdcCellContext {
  /** The NBDC Dataset Accession key's id. */
  keyId: string
  /** The research the datasets are of, as the old addresses name its files (`/files/hum0014/…`). */
  hum: string
  /** The labels a dataset that selects files is known by: its NHA id and its old names. Undefined for one of an external archive. */
  labelsOf: (datasetId: string) => ReadonlySet<string> | undefined
  /** Whether the research's prefix holds a file of this name. */
  stored: (name: string) => boolean
  /** The file's label, if it has one. */
  labelOf: (name: string) => Bilingual | undefined
}

type Described = DatasetContent & { datasetId: string }

/** A cell taken out, whole or a group of it, as its lines read. */
export interface DroppedCell {
  datasetId: string
  experimentId: string
  whole: boolean
  ja: string[]
  en: string[]
}

export interface NbdcOutcome<D extends Described> {
  datasets: D[]
  /** The files selected from the cells, by dataset. */
  selected: { datasetId: string, name: string }[]
  dropped: DroppedCell[]
}

const FILE_ADDRESS = /^\/files\/([^/]+)\/(?:.*\/)?([^/?#]+)(?:[?#].*)?$/

/** The name of the research's file a link points at, or null for any other address. */
function fileOf(href: string | undefined, hum: string): string | null {
  const found = href === undefined ? null : FILE_ADDRESS.exec(href)
  if (found?.[1] !== hum) return null
  const name = found[2] ?? ""
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

const textOf = (line: Line) => line.map((span) => span.text).join("")
const isBlank = (line: Line) => textOf(line).trim() === ""

/** A heading alone on its line, in lenticular brackets or the square ones the English page writes. */
const HEADING_ALONE = /^\s*(?:【[^】]*】|\[[^\]]*\])\s*$/
const isHeading = (line: Line) => line.every((span) => span.href === undefined) && HEADING_ALONE.test(textOf(line))

/** The words before a colon that start a line (`RHM:`), where the line starts with words. */
const CAPTION = /^\s*([^:：[\]【】]{1,20}?)\s*[:：]/
function captionOf(line: Line): string | null {
  const [first] = line
  if (first === undefined || first.href !== undefined) return null
  return CAPTION.exec(first.text)?.[1] ?? null
}

const FOOTNOTE = /[＊*]/g
const NUMBERING = /^\s*(?:\d+\s*[.．)）]|[(（]\d+[)）])/
const SEPARATORS = /^[\s・\-–—:：、,，/／()（）[\]［］.．]*$/
const WORDS = /[^\s・\-–—:：、,，/／()（）[\]［］.．]+/g

const plain = (text: string) => text.replace(FOOTNOTE, "").trim()

/** What the reading of one dataset's cells needs. */
interface Reading {
  own: ReadonlySet<string>
  /** The IDs of the other datasets the cells are read beside. */
  others: ReadonlySet<string>
  hum: string
  labelOf: (name: string) => Bilingual | undefined
}

/** The caption of the line with the dataset's own ID (`RHM` of `RHM: hum0261.v1.rhm.v1`), if a line has one. */
function ownCaption(lines: RichText, own: ReadonlySet<string>): string | null {
  for (const line of lines) {
    const caption = captionOf(line)
    if (caption === null) continue
    const rest = textOf(line).slice(textOf(line).search(/[:：]/) + 1)
    if ([...own].some((label) => mentions(rest, label))) return caption
  }
  return null
}

function mentions(text: string, label: string): boolean {
  let from = 0
  for (;;) {
    const at = text.indexOf(label, from)
    if (at === -1) return false
    const before = text[at - 1]
    const after = text[at + label.length]
    if (!isWordChar(before) && !isWordChar(after)) return true
    from = at + 1
  }
}

const WORD_CHAR = /[\p{L}\p{N}_]/u
const isWordChar = (ch: string | undefined) => ch !== undefined && WORD_CHAR.test(ch)

/** Whether a line is captioned for another dataset than the one the cell's own ID line is captioned for. */
function captionedElsewhere(line: Line, mine: string | null): boolean {
  const caption = captionOf(line)
  return mine !== null && caption !== null && caption !== mine
}

/** The files a dataset's cells link that it would select, in the order the cells link them. */
function linkedFiles(cells: readonly RichText[], reading: Reading): string[] {
  const names: string[] = []
  for (const lines of cells) {
    const mine = ownCaption(lines, reading.own)
    for (const line of lines) {
      if (captionedElsewhere(line, mine)) continue
      for (const span of line) {
        const name = fileOf(span.href, reading.hum)
        if (name === null || reading.others.has(span.text.trim())) continue
        names.push(name)
      }
    }
  }
  return names
}

/** The words left of a line once the dataset's own IDs, a caption and the marks of a list are taken away. */
function leftWords(line: Line, own: ReadonlySet<string>, caption: boolean): string {
  let words = line.filter((span) => span.href === undefined).map((span) => span.text).join("")
  if (caption) words = words.replace(CAPTION, "")
  for (const label of [...own].toSorted((a, b) => b.length - a.length)) words = words.split(label).join("")
  return plain(words).replace(NUMBERING, "")
}

/**
 * Whether the file table already shows what a line holds. `selectedHere` is the dataset's
 * selection, `selectedAnywhere` that of any of the research's datasets, for a
 * line captioned for another dataset.
 */
function shownElsewhere(
  lines: RichText,
  at: number,
  mine: string | null,
  reading: Reading,
  selectedHere: ReadonlySet<string>,
  selectedAnywhere: ReadonlySet<string>,
): boolean {
  const line = lines[at] ?? []
  const elsewhere = captionedElsewhere(line, mine)
  const selected = elsewhere ? selectedAnywhere : selectedHere
  const labels: Bilingual[] = []
  for (const span of line) {
    if (span.href === undefined) continue
    const name = fileOf(span.href, reading.hum)
    if (name === null || !selected.has(name)) return false
    const label = reading.labelOf(name)
    const words = span.text.trim()
    if (label === undefined && !reading.own.has(words) && words !== name) return false
    if (label !== undefined) labels.push(label)
  }
  const left = leftWords(line, reading.own, captionOf(line) !== null && (elsewhere || captionOf(line) === mine))
  if (SEPARATORS.test(left)) return true
  if (labels.length > 0) {
    const held = labels.flatMap((label) => [label.ja, label.en])
    return [...left.matchAll(WORDS)].every(([word]) => held.some((label) => label.includes(word)))
  }
  // A caption alone on its line, over the line of the file it names.
  const next = lines.slice(at + 1).find((one) => !isBlank(one))
  const files = (next ?? []).flatMap((span) => {
    const name = fileOf(span.href, reading.hum)
    return name === null ? [] : [name]
  })
  if (files.length !== 1 || !selectedHere.has(files[0] ?? "")) return false
  const label = reading.labelOf(files[0] ?? "")
  return label !== undefined && (plain(label.ja) === left || plain(label.en) === left)
}

/** A cell's lines in groups under the headings alone on their lines; the lines above the first heading are a group of their own. */
function groupsOf(lines: RichText): RichText[] {
  const groups: RichText[] = [[]]
  for (const line of lines) {
    if (isHeading(line)) groups.push([])
    groups.at(-1)?.push(line)
  }
  return groups.filter((group) => group.length > 0)
}

/** Each group of a cell and whether the file table already shows all of it. */
function readCell(
  lines: RichText,
  reading: Reading,
  selectedHere: ReadonlySet<string>,
  selectedAnywhere: ReadonlySet<string>,
): { group: RichText, shown: boolean }[] {
  const mine = ownCaption(lines, reading.own)
  return groupsOf(lines).map((group) => ({
    group,
    shown: group.every((line, at) => isBlank(line) || isHeading(line) || shownElsewhere(group, at, mine, reading, selectedHere, selectedAnywhere)),
  }))
}

/** Lines without the blank lines a taken group leaves side by side or at an edge. */
function tidy(lines: RichText): RichText {
  const out: RichText = []
  for (const line of lines) {
    if (!isBlank(line) || (out.length > 0 && !isBlank(out.at(-1) ?? []))) out.push(isBlank(line) ? [] : line)
  }
  while (out.length > 0 && isBlank(out.at(-1) ?? [])) out.pop()
  return out
}

const valueLines = (slot: Slot<RichText>): RichText | null => (slot.state === "value" ? slot.value : null)

/** A research's datasets (of one version or one draft) with the files their cells link selected and the cells their file tables show taken out. */
export function settleNbdcCells<D extends Described>(datasets: readonly D[], ctx: NbdcCellContext): NbdcOutcome<D> {
  const selected: NbdcOutcome<D>["selected"] = []
  const dropped: NbdcOutcome<D>["dropped"] = []
  const readingOf = (one: D): Reading | null => {
    const own = ctx.labelsOf(one.datasetId)
    if (own === undefined) return null
    const others = new Set(datasets.filter((other) => other !== one).flatMap((other) => [...(ctx.labelsOf(other.datasetId) ?? [])]))
    return { own, others, hum: ctx.hum, labelOf: ctx.labelOf }
  }
  const cellsOf = (one: D): RichText[] => one.experiments.flatMap((experiment) => experiment.values.flatMap((slot) => {
    if (slot.keyId !== ctx.keyId || slot.value.kind !== "text") return []
    const { text } = slot.value
    return [valueLines(text.ja), valueLines(text.en)].filter((lines) => lines !== null)
  }))

  const selections = datasets.map((one) => {
    const reading = readingOf(one)
    if (reading === null) return one.fileSelection
    const held = new Set(one.fileSelection)
    const added = [...new Set(linkedFiles(cellsOf(one), reading))].filter((name) => !held.has(name) && ctx.stored(name))
    for (const name of added) selected.push({ datasetId: one.datasetId, name })
    return inListingOrder([...one.fileSelection, ...added])
  })
  const selectedAnywhere = new Set(selections.flat())

  const settled = datasets.map((one, i) => {
    const reading = readingOf(one)
    const selection = selections[i] ?? one.fileSelection
    if (reading === null) return one
    const selectedHere = new Set(selection)
    const experiments = one.experiments.map((experiment) => {
      const values = experiment.values.flatMap((slot): ValueSlot[] => {
        if (slot.keyId !== ctx.keyId || slot.value.kind !== "text") return [slot]
        const { text } = slot.value
        const ja = valueLines(text.ja)
        const en = valueLines(text.en)
        if (ja === null || en === null) return [slot]
        const read = { ja: readCell(ja, reading, selectedHere, selectedAnywhere), en: readCell(en, reading, selectedHere, selectedAnywhere) }
        const all = [...read.ja, ...read.en]
        if (all.every((one) => one.shown)) {
          dropped.push({ datasetId: one.datasetId, experimentId: experiment.id, whole: true, ja: ja.map(textOf), en: en.map(textOf) })
          return []
        }
        const pattern = (groups: { shown: boolean }[]) => groups.map((group) => group.shown).join()
        const grouped = read.ja.length > 1 && pattern(read.ja) === pattern(read.en)
        if (!grouped || !all.some((group) => group.shown)) return [slot]
        const kept = (groups: { group: RichText, shown: boolean }[]) => tidy(groups.filter((group) => !group.shown).flatMap((group) => group.group))
        const gone = (groups: { group: RichText, shown: boolean }[]) => groups.filter((group) => group.shown).flatMap((group) => group.group).map(textOf)
        dropped.push({ datasetId: one.datasetId, experimentId: experiment.id, whole: false, ja: gone(read.ja), en: gone(read.en) })
        return [{ ...slot, value: { kind: "text", text: { ja: { state: "value", value: kept(read.ja) }, en: { state: "value", value: kept(read.en) } } } }]
      })
      return values.length === experiment.values.length && values.every((slot, at) => slot === experiment.values[at]) ? experiment : { ...experiment, values }
    })
    return { ...one, fileSelection: selection, experiments }
  })
  return { datasets: settled, selected, dropped }
}
