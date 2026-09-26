/**
 * Splitting an experiment block several datasets share into each dataset's
 * own copy.
 *
 * **A v1 table is sometimes written once for a whole group of datasets, and
 * the group is merged back together with the accession that owns each row
 * (`JGAD000001: value`, `【JGAS000009】value`, a bare `[JGAD000001](url)`
 * line, or the study an accession's own JGAS resolves to).** The block itself
 * — header and every cell — is identical wherever it is pinned; only which
 * lines belong to which dataset differs, and that is what this module reads
 * back out.
 *
 * This is a generalisation of `ownLines`/`kept` in `build.ts`, which already
 * splits the `ID:` form by checking every dataset's own experiments against
 * every other's. That check needs the whole dump in memory to work; this one
 * needs only the one block and the siblings that have it; it is not called
 * from `build.ts` yet.
 *
 * Every function here is pure — no dump, no filesystem, no network. The
 * caller supplies the block's cells, the dataset labels that have it, and
 * the JGAS→JGAD correspondence; the JGAS→JGAD map itself is built from rows
 * read elsewhere (`jgadsByStudy`), because reading `jga_dataset_study.tsv` is
 * `upstream.ts`'s job, not this module's.
 *
 * **A caption with no marker of its own cannot be told apart from a genuinely
 * shared note.** A line naming no dataset is always read as shared, even
 * where the source really pairs it with the very next line — a disease name
 * on its own line followed by that one dataset's accession, repeated once per
 * dataset. This module tracks what a line has, not where it sits, so such a
 * pairing is invisible to it. `hum0014`'s master accession list is built
 * exactly this way, so its cells are divided by hand rather than by a
 * general rule.
 */

export type Language = "ja" | "en"

/** A cell the way `kept` already reads one: the extracted text, not the HTML it came from. */
export interface BlockCellText {
  ja: string
  en: string
}

/** One experiment block's cells, keyed by the v1 source key. */
export type BlockData = Readonly<Record<string, BlockCellText>>

/** One language of a cell as `EsExperiment.data` holds it: the extracted text, and the HTML this module ignores. */
interface EsCellText {
  text?: string | null
  rawHtml?: string | null
}

/** The block's cells as `EsExperiment.data` holds them, reduced to the plain text this module reads. */
export function blockDataFromEs(
  data: Readonly<Record<string, { ja?: EsCellText | null, en?: EsCellText | null }>> | null | undefined,
): BlockData {
  const out: Record<string, BlockCellText> = {}
  for (const [key, cell] of Object.entries(data ?? {})) {
    out[key] = { ja: cell.ja?.text ?? "", en: cell.en?.text ?? "" }
  }
  return out
}

/**
 * The reverse of `jga_dataset_study.tsv`: every JGAD registered under one
 * JGAS. A study covers more than one dataset whenever a research splits one
 * cohort into several category datasets, which is the ordinary case for the
 * blocks this resolves.
 */
export function jgadsByStudy(pairs: readonly (readonly [dataset: string, study: string])[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [dataset, study] of pairs) {
    const held = out.get(study)
    if (held) held.push(dataset)
    else out.set(study, [dataset])
  }
  return out
}

/**
 * One dataset's copy of a cell the reviewer needs to look at. The value is
 * the block's own, unsplit text — every dataset in the block gets an entry
 * with the same value, because nothing here decided who the line belongs to.
 */
export interface ReviewItem {
  dataset: string
  /** Every dataset of the block the cell sits in, which a division must cover. */
  block: string[]
  key: string
  lang: Language
  value: string
  reason: string
}

/**
 * A cell somebody divided, by `handKey`: each dataset of the block and the
 * text that is its own. It is found by everything that makes the cell what it
 * is, so a division written for one text never lands on another.
 */
export type HandSplits = ReadonlyMap<string, ReadonlyMap<string, string>>

export function handKey(block: readonly string[], key: string, lang: Language, value: string): string {
  return JSON.stringify([[...block].sort(), key, lang, value])
}

export interface SplitStats {
  /** Cells cleanly divided: every line either names no dataset or names exactly one, and every dataset got one. */
  split: number
  /** Cells with no line naming any of the block's own datasets: the same text for everyone. */
  shared: number
  /** Cells left whole for every dataset and reported in `review`. */
  review: number
  /** Cells divided by hand rather than by the rules. */
  hand: number
}

export interface SplitResult {
  /** Each dataset's own copy of the block, one entry per label passed in. */
  perDataset: Map<string, BlockData>
  stats: SplitStats
  review: ReviewItem[]
}

const WORD_CHAR = /[\p{L}\p{N}]/u

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch)
}

/** Whether `label` occurs in `line` as a whole token rather than as part of a longer one. */
function mentions(line: string, label: string): boolean {
  if (label === "") return false
  let from = 0
  for (;;) {
    const at = line.indexOf(label, from)
    if (at === -1) return false
    if (!isWordChar(line[at - 1]) && !isWordChar(line[at + label.length])) return true
    from = at + 1
  }
}

/**
 * JGA's own dataset and study numbers, long form folded to the six digits the
 * `label_pin` table uses (`citedLabel` in `build.ts` folds the same way). A token this
 * does not match — a typo'd prefix such as `JGA000429` missing its `D` — is
 * invisible here, and the line it sits on is read as naming nothing rather
 * than being misread as naming the wrong thing.
 */
const JGA_TOKEN = /\bJGA([DS])(\d{6,})\b/g

/**
 * Every other archive accession v1 tables cite beside a JGA number. None of
 * these resolve through a study; recognising them is only for telling "this
 * line names something outside the block" from "this line names nothing".
 */
const OTHER_ACCESSION = /\b(?:DRA\d{6,9}|E-GEA[DS]-?\d+|NHA\d{6}|GSE\d+)\b/g

function jgaToken(letter: string, digits: string): string {
  return `JGA${letter}${digits.slice(-6)}`
}

function theOnly<T>(set: ReadonlySet<T>): T {
  for (const item of set) return item
  throw new Error("expected exactly one element")
}

type LineOwner
  = | { kind: "shared" }
    /** Names exactly one of the block's own datasets, directly or through a study. */
    | { kind: "owned", dataset: string }
    /** Names only accession(s) outside the block — recorded, if anywhere, under whatever that identifies. */
    | { kind: "foreign" }
    /** Names more than one dataset, or a study spanning more than one — not this module's call to make. */
    | { kind: "unsettled", reason: string }

function lineOwner(
  line: string,
  datasets: ReadonlySet<string>,
  jgasToJgad: ReadonlyMap<string, readonly string[]>,
): LineOwner {
  const owners = new Set<string>()
  let foreign = false
  let studySpansSeveral = false

  for (const label of datasets) {
    if (mentions(line, label)) owners.add(label)
  }

  for (const m of line.matchAll(JGA_TOKEN)) {
    const token = jgaToken(m[1] ?? "", m[2] ?? "")
    // A long form (`JGAD00000000276`) names the dataset the direct pass could not see.
    if (datasets.has(token)) {
      owners.add(token)
      continue
    }
    const studyOf = jgasToJgad.get(token)
    if (studyOf === undefined) {
      foreign = true
      continue
    }
    const inBlock = studyOf.filter((d) => datasets.has(d))
    if (inBlock.length === 0) foreign = true
    else if (inBlock.length === 1) owners.add(theOnly(new Set(inBlock)))
    else studySpansSeveral = true
  }

  for (const m of line.matchAll(OTHER_ACCESSION)) {
    if (!datasets.has(m[0])) foreign = true
  }

  if (studySpansSeveral) {
    return { kind: "unsettled", reason: "この行の JGAS が block 内の複数 dataset にまたがる" }
  }
  if (owners.size >= 2) {
    return { kind: "unsettled", reason: "この行が block 内の複数 dataset を指定している" }
  }
  if (owners.size === 1) return { kind: "owned", dataset: theOnly(owners) }
  return foreign ? { kind: "foreign" } : { kind: "shared" }
}

/**
 * The cells that list a table's datasets an item each, a caption line and then
 * the line with the dataset's link (`不整脈` over `hum0014.v17.AR.v1`), under
 * group headings where the table has them (`血糖・脂質関連`). **Here a line
 * naming no dataset belongs to the lines under it**: a caption goes with the
 * dataset line below it, and a heading goes once every line under it has.
 * Elsewhere a line naming no dataset is shared, since a heading over several
 * datasets' lines (`腫瘍組織:` over `JGAD000001: 10`) is a fact about each of them.
 */
const CAPTIONED_KEYS = new Set(["NBDC Dataset Accession"])

/**
 * Which lines of a captioned cell stay, given which dataset lines do. A line
 * naming no dataset directly above a dataset line is its caption and stays with
 * it; one above a caption or another heading is a heading, and stays while any
 * dataset line under it does, up to the next heading that starts a new group.
 */
function withCaptions(lines: readonly string[], owners: readonly LineOwner[], keeps: readonly boolean[]): boolean[] {
  const n = lines.length
  const isData = (i: number) => owners[i]?.kind === "owned" || owners[i]?.kind === "foreign"
  const isText = (i: number) => owners[i]?.kind === "shared" && (lines[i] ?? "").trim() !== ""
  const caption = lines.map((_line, i) => isText(i) && i + 1 < n && isData(i + 1))
  const heading = new Array<boolean>(n).fill(false)
  for (let i = n - 2; i >= 0; i -= 1) {
    heading[i] = isText(i) && !caption[i] && (caption[i + 1] === true || heading[i + 1] === true)
  }
  const out = [...keeps]
  for (let i = 0; i < n; i += 1) {
    if (caption[i]) out[i] = keeps[i + 1] === true
    if (!heading[i]) continue
    let j = i + 1
    while (j < n && heading[j]) j += 1
    let kept = false
    for (; j < n && !(heading[j] && !heading[j - 1]); j += 1) {
      if (isData(j) && keeps[j]) kept = true
    }
    out[i] = kept
  }
  return out
}

type CellOutcome
  = | { kind: "shared" | "split" | "hand", perDataset: ReadonlyMap<string, string> }
    | { kind: "review", perDataset: ReadonlyMap<string, string>, reason: string }

/**
 * One cell (one language of one key), split among the datasets that share
 * the block it sits in.
 *
 * A line stays for every dataset unless it identifies one — `readLine` in
 * `build.ts` calls this "about" — in which case it stays only for the
 * dataset(s) it identifies among the block's own (and, in a cell that captions
 * each dataset's line, the caption above it: `CAPTIONED_KEYS`). **A line naming an accession
 * that is not one of the block's own datasets is dropped for all of them**:
 * whatever it is about is not any of this block's datasets, so it is not this
 * block's line to keep, and keeping it on a sibling would attribute someone
 * else's fact to that sibling. This differs from `ownLines`' rule, which only
 * drops a line once it has verified the dataset it identifies has the same
 * line itself — a check this function cannot make with one block alone — but
 * the risk being guarded against is the same: never let a fact end up filed
 * under a dataset it was not about.
 */
function splitCellText(
  text: string,
  datasetLabels: readonly string[],
  datasets: ReadonlySet<string>,
  jgasToJgad: ReadonlyMap<string, readonly string[]>,
  captioned = false,
): CellOutcome {
  const lines = text.split("\n")
  const owners = lines.map((line) => lineOwner(line, datasets, jgasToJgad))

  const unsettled = owners.find((o) => o.kind === "unsettled")
  if (unsettled?.kind === "unsettled") {
    return {
      kind: "review",
      reason: unsettled.reason,
      perDataset: new Map(datasetLabels.map((label) => [label, text])),
    }
  }

  const covered = new Set(owners.flatMap((o) => (o.kind === "owned" ? [o.dataset] : [])))

  if (covered.size > 0 && covered.size < datasetLabels.length) {
    const missing = datasetLabels.filter((label) => !covered.has(label))
    return {
      kind: "review",
      reason: `block 内 ${String(datasetLabels.length)} dataset のうち ${String(missing.length)} 件 `
        + `(${missing.join(", ")}) にこの key の行が無い`,
      perDataset: new Map(datasetLabels.map((label) => [label, text])),
    }
  }

  const perDataset = new Map(datasetLabels.map((label) => {
    const keeps = lines.map((_line, i) => {
      const owner = owners[i]
      return owner?.kind === "shared" || (owner?.kind === "owned" && owner.dataset === label)
    })
    return [label, lines.filter((_line, i) => (captioned ? withCaptions(lines, owners, keeps) : keeps)[i]).join("\n")] as const
  }))
  return { kind: covered.size === 0 ? "shared" : "split", perDataset }
}

/**
 * The division somebody wrote for this cell, if any. **It must name exactly the
 * block's datasets**: one it leaves out would silently keep the whole text, and
 * one it adds would never be read.
 */
function handSplit(
  byHand: HandSplits,
  labels: readonly string[],
  key: string,
  lang: Language,
  value: string,
): CellOutcome | null {
  const written = byHand.get(handKey(labels, key, lang, value))
  if (written === undefined) return null
  const named = [...written.keys()].sort()
  const expected = [...labels].sort()
  if (JSON.stringify(named) !== JSON.stringify(expected)) {
    throw new Error(`the division of ${key} (${lang}) names ${named.join(", ")} for a block of ${expected.join(", ")}`)
  }
  return { kind: "hand", perDataset: written }
}

/**
 * Split one experiment block into each dataset's own copy.
 *
 * Every key and every language is decided on its own: `ja` may split cleanly
 * while `en` needs a reviewer, and the result holds whichever each cell
 * reached. A block that never identifies any of its own datasets — one that
 * is simply shared — needs no special case: every one of its cells comes back
 * `shared`, which is a plain copy already.
 */
export function splitSharedBlock(
  data: BlockData,
  datasetLabels: readonly string[],
  jgasToJgad: ReadonlyMap<string, readonly string[]>,
  byHand: HandSplits = new Map(),
): SplitResult {
  const labels = [...new Set(datasetLabels)]
  const datasets = new Set(labels)
  const stats: SplitStats = { split: 0, shared: 0, review: 0, hand: 0 }
  const review: ReviewItem[] = []
  const perDataset = new Map<string, Record<string, BlockCellText>>(labels.map((label) => [label, {}]))

  for (const [key, cell] of Object.entries(data)) {
    for (const lang of ["ja", "en"] as const) {
      const outcome = handSplit(byHand, labels, key, lang, cell[lang])
        ?? splitCellText(cell[lang], labels, datasets, jgasToJgad, CAPTIONED_KEYS.has(key))
      stats[outcome.kind] += 1
      if (outcome.kind === "review") {
        for (const label of labels) {
          review.push({ dataset: label, block: [...labels].sort(), key, lang, value: cell[lang], reason: outcome.reason })
        }
      }
      for (const label of labels) {
        const record = perDataset.get(label)
        if (record === undefined) continue
        const existing = record[key] ?? { ja: "", en: "" }
        record[key] = { ...existing, [lang]: outcome.perDataset.get(label) ?? cell[lang] }
      }
    }
  }

  return {
    perDataset: new Map([...perDataset].map(([label, record]) => [label, record as BlockData])),
    stats,
    review,
  }
}
