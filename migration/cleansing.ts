/**
 * Clean-ups applied to every string the content holds.
 *
 * The rules are the ones that need no judgement about a particular research, so
 * they apply to every published version and every draft alike:
 *
 * - **prose in the shape the editor saves it in.** Every line is trimmed, a line
 *   of nothing but spaces is a blank line, blank lines do not repeat and do not
 *   open or close the value (`app/content/parse.server.ts`). The old articles
 *   spaced paragraphs with lines holding a single no-break space and indented
 *   with runs of them, and both came across as characters
 * - **one character for one letter.** Full-width letters, digits and slashes
 *   become ASCII, a run of spaces holding a no-break or a full-width space
 *   becomes one space, a kana followed by a separate voicing mark (`こ` and
 *   U+3099, which a copy from some editors leaves) becomes the one letter, and
 *   the Kangxi radicals a copy out of a PDF leaves behind (`⽇` for
 *   `日`) become the ideographs they look like
 * - **brackets that close as they open.** On the Japanese side a bracket closed
 *   with the other width (`（NGS)`) is closed with the width it was opened with.
 *   Pairs that each keep one width stay as written, whichever width it is
 * - **no characters from the text's former formats**: control characters, and
 *   the backslash v1 put in front of markdown's punctuation (`reference\_accession`)
 * - **no link syntax in a value that cannot hold a link.** A title shows
 *   `[text](url)` as it is written, so only the text is kept
 * - **English punctuation in English.** Full-width brackets, colons and commas
 *   typed into the English side become their ASCII forms, with the space English
 *   puts before an opening bracket and after a closing one a word follows
 * - **one grant number per entry.** Numbers written into one entry with commas
 *   between them (`5144, 5274, 5393`) become an entry each
 * - **no instructions for the old page.** The lines under a list of dataset
 *   links telling the reader to click an ID to download are about the old page's
 *   layout, and the page draws its own links
 *
 * Identifiers, addresses and file names are not touched: they are matched
 * against other systems and against the file store as they are written.
 */

import type { Line, RichText } from "~/content/types"

export interface CleansingCounts {
  /** Prose values whose lines changed shape. */
  prose: number
  /** Strings with a full-width letter, digit or slash, a separate voicing mark, a Kangxi radical, a control character, a no-break or a full-width space. */
  characters: number
  /** Japanese values with a bracket closed with the other width. */
  brackets: number
  /** Strings with a markdown escape. */
  escapes: number
  /** Single-line values that held link syntax. */
  linkSyntax: number
  /** English strings with full-width punctuation. */
  english: number
  /** Download instruction lines removed. */
  instructions: number
  /** Character references in an article or a news body written as the character. */
  references: number
  /** Article or news bodies left as they were because a rule would have changed how they render. */
  keptBodies: number
  /** Grant number entries that held several numbers. */
  grantIds: number
}

export function noCounts(): CleansingCounts {
  return { prose: 0, characters: 0, brackets: 0, escapes: 0, linkSyntax: 0, english: 0, instructions: 0, references: 0, keptBodies: 0, grantIds: 0 }
}

/** Keys whose strings are matched elsewhere as written. */
const KEPT_AS_WRITTEN = new Set([
  "id",
  "keyId",
  "datasetId",
  "datasetIds",
  "termIds",
  "href",
  "url",
  "doi",
  "state",
  "kind",
  "fileSelection",
])

const STATES = new Set(["value", "unknown", "not-applicable"])

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
/** A run of spaces holding a no-break or a full-width space: the old pages' indents and alignment. */
const WIDE_SPACES = / *[\u00a0\u3000][\u00a0\u3000 ]*/g
const FULL_WIDTH_ALNUM = /[０-９Ａ-Ｚａ-ｚ／]/g
const RADICALS = /[⺀-⻿⼀-⿟]/g
/** A kana and the combining voicing mark after it. */
const SEPARATE_VOICING = /[\u3041-\u30ff][\u3099\u309a]/g
const MARKDOWN_ESCAPE = /\\([_*[\]#`.>])/g
const LINK_SYNTAX = /\[([^\]]+)\]\((?:https?:\/\/|\/)[^)\s]*\)/g
const FULL_WIDTH_PUNCTUATION = /[：，、\u3000]/g
const ASCII_OF: Record<string, string> = { "：": ": ", "，": ", ", "、": ", ", "\u3000": " " }
/** What may stand before an opening bracket without a space: the start, a space, or another opening bracket. */
const OPENS_TIGHT = /[\s(（[［「]/

/**
 * A line that only tells the reader to click a link above it. Every variant is a
 * whole line in brackets; a line with any other words is kept.
 */
const INSTRUCTIONS = [
  /^[(（](?:データ|GWAS統計情報)のダウンロードは(?:上記|各).*クリック.*[)）]$/,
  /^\((?:Click|click) (?:the |each ).*(?:download).*\)$/,
]

/** One string with the character rules applied. */
export function cleanseCharacters(text: string, counts: CleansingCounts): string {
  const characters = text
    .replace(CONTROL, "")
    .replace(WIDE_SPACES, " ")
    .replace(FULL_WIDTH_ALNUM, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(SEPARATE_VOICING, (kana) => kana.normalize("NFC"))
    .replace(RADICALS, (c) => c.normalize("NFKC"))
  if (characters !== text) counts.characters += 1
  const unescaped = characters.replace(MARKDOWN_ESCAPE, "$1")
  if (unescaped !== characters) counts.escapes += 1
  return unescaped
}

/** An English string with its full-width punctuation made ASCII. */
export function cleanseEnglish(text: string, counts: CleansingCounts): string {
  const ascii = text
    .replace(/（/g, (_, at: number, whole: string) => (at === 0 || OPENS_TIGHT.test(whole[at - 1] ?? "") ? "(" : " ("))
    .replace(/）/g, (_, at: number, whole: string) => (/[A-Za-z0-9]/.test(whole[at + 1] ?? "") ? ") " : ")"))
    .replace(FULL_WIDTH_PUNCTUATION, (c) => ASCII_OF[c] ?? c)
    .replace(/ {2,}/g, " ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")")
  if (ascii !== text) counts.english += 1
  return ascii
}

const OPENING = new Set(["(", "（"])
const CLOSING = new Set([")", "）"])
const WIDTH_OF_OPENING: Record<string, { close: string }> = { "(": { close: ")" }, "（": { close: "）" } }

/**
 * Where each bracket closed with the other width sits in `text`, and the
 * bracket it should be. A closing bracket with nothing open is left alone.
 */
function misclosed(text: string): Map<number, string> {
  const open: string[] = []
  const found = new Map<number, string>()
  Array.from(text).forEach((char, at) => {
    if (OPENING.has(char)) open.push(char)
    else if (CLOSING.has(char)) {
      const opening = open.pop()
      const close = opening === undefined ? undefined : WIDTH_OF_OPENING[opening]?.close
      if (close !== undefined && close !== char) found.set(at, close)
    }
  })
  return found
}

/** A Japanese string with every bracket closed with the width it was opened with. */
export function pairedBrackets(text: string, counts: CleansingCounts): string {
  const found = misclosed(text)
  if (found.size === 0) return text
  counts.brackets += 1
  return Array.from(text, (char, at) => found.get(at) ?? char).join("")
}

/** The same for prose, where a pair may open in one span and close in the next (a link inside brackets). */
function pairedBracketsRich(rich: RichText, counts: CleansingCounts): RichText {
  const out = rich.map((line) => {
    const found = misclosed(line.map((span) => span.text).join(""))
    if (found.size === 0) return line
    let offset = 0
    return line.map((span) => {
      const chars = Array.from(span.text)
      const text = chars.map((char, at) => found.get(offset + at) ?? char).join("")
      offset += chars.length
      return { ...span, text }
    })
  })
  if (out.some((line, at) => line !== rich[at])) counts.brackets += 1
  return out
}

function isInstruction(line: Line): boolean {
  if (line.some((span) => span.href !== undefined)) return false
  const text = line.map((span) => span.text).join("").trim()
  return INSTRUCTIONS.some((pattern) => pattern.test(text))
}

function trimLine(line: Line): Line {
  const spans = line.filter((span) => span.text !== "").map((span) => ({ ...span }))
  // A span that is all spaces leaves the next one at the edge, so trimming
  // goes on until a span keeps something.
  while (spans.length > 0) {
    const first = spans[0] as Line[number]
    first.text = first.text.replace(/^\s+/, "")
    if (first.text !== "") break
    spans.shift()
  }
  while (spans.length > 0) {
    const last = spans[spans.length - 1] as Line[number]
    last.text = last.text.replace(/\s+$/, "")
    if (last.text !== "") break
    spans.pop()
  }
  return spans
}

/** Prose in the shape the editor saves it in, without the old page's instructions. */
export function cleanseRich(rich: RichText, counts: CleansingCounts): RichText {
  const lines: Line[] = []
  for (const line of rich) {
    if (isInstruction(line)) {
      counts.instructions += 1
      continue
    }
    const trimmed = trimLine(line)
    if (trimmed.length === 0) {
      if (lines.length > 0 && lines.at(-1)?.length !== 0) lines.push([])
      continue
    }
    lines.push(trimmed)
  }
  while (lines.at(-1)?.length === 0) lines.pop()
  if (JSON.stringify(lines) !== JSON.stringify(rich)) counts.prose += 1
  return lines
}

function isRichText(node: unknown): node is RichText {
  return Array.isArray(node) && node.length > 0 && node.every((line) =>
    Array.isArray(line) && line.every((span) =>
      typeof span === "object" && span !== null && typeof (span as { text?: unknown }).text === "string"))
}

function isSlot(node: unknown): node is { state: string, value?: unknown } {
  return typeof node === "object" && node !== null && !Array.isArray(node)
    && STATES.has((node as { state?: unknown }).state as string)
}

/** A string or a list of strings: what a key kept as written holds. `url` also names a pair of link lists. */
function isWritten(node: unknown): boolean {
  return typeof node === "string" || (Array.isArray(node) && node.every((one) => typeof one === "string"))
}

/** `{ ja, en }` where both sides are slots: a translated pair. */
function isTranslated(node: object): node is { ja: unknown, en: unknown } {
  const pair = node as { ja?: unknown, en?: unknown }
  return isSlot(pair.ja) && isSlot(pair.en)
}

/** The content with every rule applied, and how many values each rule changed. */
export function cleanseContent<T>(content: T): { content: T, counts: CleansingCounts } {
  const counts = noCounts()
  const walk = (node: unknown, english: boolean): unknown => {
    if (typeof node === "string") {
      const cleaned = cleanseCharacters(node, counts)
      return english ? cleanseEnglish(cleaned, counts) : pairedBrackets(cleaned, counts)
    }
    if (isRichText(node)) {
      const spans = node.map((line) => line.map((span) => ({
        ...span,
        text: english ? walk(span.text, english) as string : cleanseCharacters(span.text, counts),
      })))
      return cleanseRich(english ? spans : pairedBracketsRich(spans, counts), counts)
    }
    if (Array.isArray(node)) return node.map((one) => walk(one, english))
    if (typeof node !== "object" || node === null) return node
    if (isSlot(node) && typeof node.value === "string") {
      const text = walk(node.value, english) as string
      const plain = text.replace(LINK_SYNTAX, "$1")
      if (plain !== text) counts.linkSyntax += 1
      return { ...node, value: plain }
    }
    const grant = node as { grantIds?: unknown }
    if (Array.isArray(grant.grantIds) && grant.grantIds.every((one) => typeof one === "string")) {
      const walked = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walk(value, english)])) as { grantIds: string[] }
      return { ...walked, grantIds: splitGrantIds(walked.grantIds, counts) }
    }
    if (isTranslated(node)) {
      return { ...node, ja: walk(node.ja, false), en: walk(node.en, true) }
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) =>
      [key, KEPT_AS_WRITTEN.has(key) && isWritten(value) ? value : walk(value, english)]))
  }
  return { content: walk(content, false) as T, counts }
}

/** Several grant numbers in one entry: identifiers and nothing else between the commas. */
const SEVERAL_NUMBERS = /^[A-Za-z0-9-]+(?:\s*[,、，]\s*[A-Za-z0-9-]+)+$/

/** Grant numbers with an entry each. */
export function splitGrantIds(ids: readonly string[], counts: CleansingCounts): string[] {
  return ids.flatMap((id) => {
    const trimmed = id.trim()
    if (!SEVERAL_NUMBERS.test(trimmed)) return [id]
    counts.grantIds += 1
    return trimmed.split(/\s*[,、，]\s*/)
  })
}

const REFERENCE = /&#(?:x([0-9a-fA-F]+)|(\d+));/g

function letters(text: string): string {
  return text
    .replace(CONTROL, "")
    .replace(/\u3000/g, " ")
    .replace(FULL_WIDTH_ALNUM, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(SEPARATE_VOICING, (kana) => kana.normalize("NFC"))
    .replace(RADICALS, (c) => c.normalize("NFKC"))
}

/**
 * An article or news body with its characters cleaned, rendering as it did.
 *
 * The bodies are markdown written by a conversion from HTML, and the conversion
 * wrote the character beside an emphasis marker as a reference (`***活用***&#x3057;`)
 * wherever it could not tell whether the plain character would still close the
 * emphasis. **Each reference is written as the character only where the body
 * renders the same with it**, which `render` — the page's own renderer — decides;
 * the rest stay references, which the page shows as the character anyway.
 *
 * The character rules change what is shown by design, so for them the same
 * holds with the rule applied to the rendering too: a full-width digit that
 * would start a numbered list once it is ASCII keeps the body as it was.
 * Markdown's escapes are the body's own syntax here and are kept.
 */
export function cleanseMarkdown(source: string, render: (markdown: string) => string, counts: CleansingCounts): string {
  const rendered = render(source)
  let body = source
  for (const found of [...source.matchAll(REFERENCE)].reverse()) {
    const code = Number.parseInt(found[1] ?? found[2] ?? "", found[1] === undefined ? 10 : 16)
    const at = found.index
    const tried = body.slice(0, at) + String.fromCodePoint(code) + body.slice(at + found[0].length)
    if (render(tried) !== rendered) continue
    body = tried
    counts.references += 1
  }
  const cleaned = letters(body)
  if (cleaned === body) return body
  if (render(cleaned) !== letters(rendered)) {
    counts.keptBodies += 1
    return body
  }
  counts.characters += 1
  return cleaned
}
