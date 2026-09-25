/**
 * Line breaks put back from the old portal's articles, where v1 kept nothing
 * that still showed them.
 *
 * v1 flattened every line break of an article into a space when it stored a
 * value's text. `richtext-html.ts` recovers them from the HTML v1 kept beside
 * the text, but only where the two still agree; where they do not, the value
 * stays one long line. The articles themselves are still there, so every block
 * of them that spans more than one line — a table cell with several rows of
 * text, a paragraph broken by `<br>` — is collected, and a one-line value that
 * has the same text as one of those blocks is cut where the block's lines
 * end.
 *
 * "The same text" is compared on the characters alone: whitespace is
 * dropped and full-width forms and quote marks folded, since v1 rewrote those
 * on the way. No word is changed; only the places the lines end are taken from
 * the article. A value two different blocks would cut differently is left as
 * it is.
 */

import type { Element, ElementContent, Root } from "hast"

import type { Line, RichText, Span } from "~/content/types"

import { parseFragment } from "./richtext-html"

/** The characters two texts are compared by. */
export function folded(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, "\"")
    .replace(/[‐-―−ーｰ]/g, "-")
    .replace(/\s+/g, "")
}

const BREAKING = new Set(["p", "div", "li", "ul", "ol", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"])
const CONTAINERS = new Set(["td", "th", "p", "li", "div"])

/** The lines a piece of HTML shows, as plain text. */
function linesOf(node: Element): string[] {
  const lines: string[] = []
  let current = ""
  const flush = () => {
    const line = current.replace(/\s+/g, " ").trim()
    if (line !== "") lines.push(line)
    current = ""
  }
  const walk = (child: ElementContent) => {
    if (child.type === "text") {
      current += child.value
      return
    }
    if (child.type !== "element") return
    if (child.tagName === "br") {
      flush()
      return
    }
    const breaks = BREAKING.has(child.tagName)
    if (breaks) flush()
    for (const inner of child.children) walk(inner)
    if (breaks) flush()
  }
  for (const child of node.children) walk(child)
  flush()
  return lines
}

export type LineDictionary = Map<string, string[] | null>

/**
 * Every block of the articles that shows more than one line, by its folded
 * characters. A key two blocks would cut differently maps to null.
 */
export function lineDictionary(articles: Iterable<string>): LineDictionary {
  const dictionary: LineDictionary = new Map()
  const add = (lines: string[]) => {
    if (lines.length < 2) return
    const key = folded(lines.join(""))
    if (key === "") return
    const held = dictionary.get(key)
    if (held === undefined) dictionary.set(key, lines)
    else if (held !== null && held.map(folded).join("\n") !== lines.map(folded).join("\n")) dictionary.set(key, null)
  }
  for (const html of articles) {
    const tree = parseFragment(html)
    const visit = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue
        if (CONTAINERS.has(child.tagName)) add(linesOf(child))
        visit(child)
      }
    }
    visit(tree)
  }
  return dictionary
}

/**
 * Where in `text` each of `lines` but the last ends, by folded characters;
 * null if they do not cover it. The text is folded a prefix at a time rather
 * than a character at a time, since a character folds differently next to its
 * neighbour (a half-width kana and its voicing mark become one letter).
 */
function cutPoints(text: string, lines: readonly string[]): number[] | null {
  const cuts: number[] = []
  let wanted = ""
  let from = 0
  for (const line of lines.slice(0, -1)) {
    wanted += folded(line)
    let at = -1
    for (let i = from + 1; i <= text.length; i += 1) {
      const seen = folded(text.slice(0, i))
      if (seen === wanted) {
        at = i
        break
      }
      if (seen.length > wanted.length + 1) break
    }
    if (at === -1) return null
    cuts.push(at)
    from = at
  }
  const bounds = [0, ...cuts, text.length]
  const agrees = lines.every((line, n) => folded(text.slice(bounds[n], bounds[n + 1])) === folded(line))
  return agrees ? cuts : null
}

/** One line cut at the given character offsets, keeping each span's destination. */
function cutLine(line: Line, cuts: readonly number[]): Line[] {
  const out: Line[] = [[]]
  let offset = 0
  let next = 0
  for (const span of line) {
    let text = span.text
    let start = offset
    while (next < cuts.length && (cuts[next] ?? Infinity) < start + text.length) {
      const at = (cuts[next] ?? 0) - start
      const head = text.slice(0, at)
      if (head !== "") out[out.length - 1]?.push(withText(span, head))
      out.push([])
      text = text.slice(at)
      start += at
      next += 1
    }
    if (text !== "") out[out.length - 1]?.push(withText(span, text))
    offset += span.text.length
  }
  return out.map((spans) => trimmed(spans)).filter((spans) => spans.length > 0)
}

function withText(span: Span, text: string): Span {
  return span.href === undefined ? { text } : { text, href: span.href }
}

function trimmed(spans: Span[]): Span[] {
  const out = spans.map((span) => ({ ...span }))
  const first = out[0]
  if (first !== undefined) first.text = first.text.replace(/^\s+/, "")
  const last = out[out.length - 1]
  if (last !== undefined) last.text = last.text.replace(/\s+$/, "")
  return out.filter((span) => span.text !== "")
}

/**
 * The rich text with each one-line paragraph that an article showed on several
 * lines cut where the article's lines end. Everything else is as it was.
 */
export function restoreLineBreaks(rich: RichText, dictionary: LineDictionary): { rich: RichText, restored: number } {
  let restored = 0
  const out: RichText = []
  rich.forEach((line, i) => {
    const alone = (rich[i - 1] === undefined || rich[i - 1]?.length === 0) && (rich[i + 1] === undefined || rich[i + 1]?.length === 0)
    const text = line.map((span) => span.text).join("")
    const lines = alone && line.length > 0 ? dictionary.get(folded(text)) : undefined
    const cuts = lines === undefined || lines === null ? null : cutPoints(text, lines)
    if (cuts === null) {
      out.push(line)
      return
    }
    restored += 1
    out.push(...cutLine(line, cuts))
  })
  return { rich: out, restored }
}

function isSpan(node: unknown): node is Span {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false
  const keys = Object.keys(node)
  const record = node as Record<string, unknown>
  return typeof record.text === "string"
    && (record.href === undefined || typeof record.href === "string")
    && keys.every((key) => key === "text" || key === "href")
}

function isRichText(node: unknown): node is RichText {
  return Array.isArray(node) && node.length > 0
    && node.every((line) => Array.isArray(line) && line.every(isSpan))
    && node.some((line) => (line as unknown[]).length > 0)
}

/** Every rich text inside `content` with its line breaks put back, and how many paragraphs were cut. */
export function restoreLineBreaksIn<T>(content: T, dictionary: LineDictionary): { content: T, restored: number } {
  let restored = 0
  const walk = (node: unknown): unknown => {
    if (isRichText(node)) {
      const result = restoreLineBreaks(node, dictionary)
      restored += result.restored
      return result.rich
    }
    if (Array.isArray(node)) return node.map(walk)
    if (typeof node !== "object" || node === null) return node
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walk(value)]))
  }
  return { content: walk(content) as T, restored }
}
