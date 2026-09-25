/**
 * Where two versions of one text part ways, as runs of text each side keeps,
 * drops or adds.
 *
 * **The unit is a word in English and a character in Japanese** — a run of
 * letters and digits is one piece, and anything else (a kana, a kanji, a
 * space, an indicator) is a piece on its own. Compared by character, an English
 * sentence lights up a letter at a time; compared by space-separated words, a
 * Japanese sentence has none and changes whole.
 *
 * **A short run the two share between two changes is merged into them.** A
 * common particle or a lone space left shown between a deletion and an
 * insertion splits one rewrite into two, and the reader has to put it back
 * together.
 */

export type DiffKind = "same" | "del" | "ins"

export interface DiffPart {
  kind: DiffKind
  text: string
}

/**
 * Past this many cells the table is not built and the two texts are reported
 * as one replacement. Two whole descriptions of a thousand characters each fit
 * well inside it; what does not is not worth a pause to compare piece by piece.
 */
const MAX_CELLS = 4_000_000

/** Shared runs of fewer pieces than this between two changes are merged into them. */
const MERGE_BELOW = 3

/** A run of letters and digits that are not Japanese, or any one character. */
const PIECE = /(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])[\p{L}\p{N}_])+|[\s\S]/gu

export function pieces(text: string): string[] {
  return text.match(PIECE) ?? []
}

export function diffText(before: string, after: string): DiffPart[] {
  const a = pieces(before)
  const b = pieces(after)

  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (
    tail < a.length - head && tail < b.length - head
    && a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail += 1

  const middleA = a.slice(head, a.length - tail)
  const middleB = b.slice(head, b.length - tail)

  const parts: DiffPart[] = []
  push(parts, "same", a.slice(0, head).join(""))
  for (const part of mergeShortRuns(middle(middleA, middleB))) push(parts, part.kind, part.text)
  push(parts, "same", a.slice(a.length - tail).join(""))
  return parts
}

/**
 * A text split into sentences, each keeping what ends it — the full stop, the
 * spaces after an English one, the line break — so that the pieces put back
 * together are the text.
 *
 * **The cut is where a reader stops**: after 「。」「！」「？」, after `.` `!` `?`
 * followed by a space, and at a line break. A number like `1.5` or an
 * abbreviation's dot with no space after it does not end one.
 */
export function sentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  let at = 0
  while (at < text.length) {
    const here = text.charAt(at)
    const next = text.charAt(at + 1)
    let end = -1
    if ("。！？".includes(here)) end = at + 1
    else if (here === "\n") end = at + 1
    else if (".!?".includes(here) && (next === "" || /\s/.test(next))) end = at + 1
    if (end === -1) {
      at += 1
      continue
    }
    // What follows the stop — more of the same indicators, the spaces, the line
    // breaks — belongs to the sentence it closes.
    while (end < text.length && /[\s。！？.!?]/.test(text.charAt(end))) end += 1
    out.push(text.slice(start, end))
    start = end
    at = end
  }
  if (start < text.length) out.push(text.slice(start))
  return out
}

/**
 * One line of a comparison of two passages: a sentence both keep, or a place
 * where they part — a sentence rewritten (both sides, compared piece by
 * piece), or one only one side has.
 */
export type SentenceRow
  = | { kind: "same", text: string }
    | { kind: "changed", before: string | null, after: string | null, parts: DiffPart[] | null }

/**
 * Two passages side by side, a sentence to a line.
 *
 * **Sentences are matched whole first, and only the ones left over are
 * compared piece by piece.** Compared as one run of characters, a paragraph in
 * which one sentence moved marks the whole paragraph; and a sentence that
 * stayed put is what lets the reader find their place on both sides. **What is
 * left between two kept sentences is paired in order** — the first sentence
 * dropped against the first one added — and the rest is shown on one side only.
 */
export function diffSentences(before: string, after: string): SentenceRow[] {
  const a = sentences(before)
  const b = sentences(after)
  const rows: SentenceRow[] = []
  let lost: string[] = []
  let gained: string[] = []
  const flush = () => {
    const count = Math.max(lost.length, gained.length)
    for (let at = 0; at < count; at += 1) {
      const one = lost[at] ?? null
      const other = gained[at] ?? null
      rows.push({ kind: "changed", before: one, after: other, parts: one !== null && other !== null ? diffText(one, other) : null })
    }
    lost = []
    gained = []
  }
  for (const part of lcs(a, b)) {
    if (part.kind === "same") {
      flush()
      rows.push({ kind: "same", text: part.text })
    } else if (part.kind === "del") lost.push(part.text)
    else gained.push(part.text)
  }
  flush()
  return rows
}

/** What the earlier text reads as: what it kept and what it lost. */
export function beforeParts(parts: readonly DiffPart[]): DiffPart[] {
  return parts.filter((part) => part.kind !== "ins")
}

/** What the later text reads as: what it kept and what it gained. */
export function afterParts(parts: readonly DiffPart[]): DiffPart[] {
  return parts.filter((part) => part.kind !== "del")
}

function middle(a: readonly string[], b: readonly string[]): DiffPart[] {
  if (a.length === 0 && b.length === 0) return []
  if (a.length * b.length > MAX_CELLS) {
    const whole: DiffPart[] = []
    push(whole, "del", a.join(""))
    push(whole, "ins", b.join(""))
    return whole
  }
  const parts: DiffPart[] = []
  for (const part of lcs(a, b)) push(parts, part.kind, part.text)
  return parts
}

/**
 * The longest common run of two lists, walked out as one part per item, in
 * order: items both keep, items only the first has, items only the second has.
 */
function lcs(a: readonly string[], b: readonly string[]): DiffPart[] {
  // The length of the longest common run of pieces from each position on.
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  const at = (i: number, j: number) => table[i * width + j] ?? 0
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }

  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const one = a[i]
    const other = b[j]
    if (one !== undefined && one === other) {
      parts.push({ kind: "same", text: one })
      i += 1
      j += 1
    } else if (one !== undefined && (other === undefined || at(i + 1, j) >= at(i, j + 1))) {
      parts.push({ kind: "del", text: one })
      i += 1
    } else if (other !== undefined) {
      parts.push({ kind: "ins", text: other })
      j += 1
    }
  }
  return parts
}

/**
 * Merges a short shared run shown between changes into them: the run is
 * dropped from the one side and added to the other, so each side still reads
 * as its own text.
 */
function mergeShortRuns(parts: readonly DiffPart[]): DiffPart[] {
  let current = regroup(parts)
  for (;;) {
    const at = current.findIndex((part, index) =>
      part.kind === "same"
      && pieces(part.text).length < MERGE_BELOW
      && index > 0 && index < current.length - 1)
    if (at === -1) return current
    const next: DiffPart[] = []
    for (const [index, part] of current.entries()) {
      if (index !== at) {
        push(next, part.kind, part.text)
        continue
      }
      push(next, "del", part.text)
      push(next, "ins", part.text)
    }
    current = regroup(next)
  }
}

/**
 * Within each stretch between two shared runs, the deletions come first and the
 * insertions after, so that a merge does not leave the stretch interleaved.
 */
function regroup(parts: readonly DiffPart[]): DiffPart[] {
  const out: DiffPart[] = []
  let del = ""
  let ins = ""
  const flush = () => {
    push(out, "del", del)
    push(out, "ins", ins)
    del = ""
    ins = ""
  }
  for (const part of parts) {
    if (part.kind === "same") {
      flush()
      push(out, "same", part.text)
    } else if (part.kind === "del") del += part.text
    else ins += part.text
  }
  flush()
  return out
}

function push(parts: DiffPart[], kind: DiffKind, text: string) {
  if (text === "") return
  const last = parts.at(-1)
  if (last?.kind === kind) last.text += text
  else parts.push({ kind, text })
}
