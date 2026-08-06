/**
 * Reading the text v1 holds into the tree v2 holds.
 *
 * v1 stored prose as markdown, so this is where that markdown stops being a
 * string. What v2 can hold is lines and links (`app/content/types.ts`), and
 * everything else the source carries is flattened rather than refused: a
 * heading, a list item and a paragraph all become lines, emphasis and code
 * become their own text, and `<sup>2</sup>` becomes `2`. The save path is the
 * other direction and refuses instead — a curator who wrote a table has to be
 * told, whereas the dump is what it is.
 *
 * **A single newline is a line.** markdown reads one as a space, but the
 * published values use it to list things (`JGAD000004: 375.31 GB` on one line,
 * the next dataset on the next), and the tree has no other way to say that.
 * A blank line between blocks stays a blank line.
 */

import type { Nodes, PhrasingContent } from "mdast"
import remarkParse from "remark-parse"
import { unified } from "unified"

import type { Line, RichText, Span } from "~/content/types"

const processor = unified().use(remarkParse)

/** The only raw HTML that carries meaning the tree can hold. */
const LINE_BREAK = /^<br\s*\/?>$/i
const TAG = /<[^>]*>/g

interface Collector {
  text: (value: string) => void
  link: (text: string, href: string) => void
  endLine: () => void
  blankLine: () => void
  finish: () => RichText
}

function collector(): Collector {
  const lines: Line[] = []
  let current: Span[] = []

  function push(span: Span): void {
    const last = current.at(-1)
    if (span.href === undefined && last?.href === undefined && last !== undefined) {
      current[current.length - 1] = { text: last.text + span.text }
      return
    }
    current.push(span)
  }

  /** Whitespace at either end of a line is layout, not content. */
  function trimmed(): Line {
    return current
      .map((span, index) => {
        const start = index === 0 ? span.text.replace(/^\s+/, "") : span.text
        const text = index === current.length - 1 ? start.replace(/\s+$/, "") : start
        return { ...span, text }
      })
      .filter((span) => span.text !== "")
  }

  function endLine(): void {
    const line = trimmed()
    current = []
    if (line.length > 0) lines.push(line)
  }

  return {
    text(value) {
      value.split("\n").forEach((part, index) => {
        if (index > 0) endLine()
        if (part !== "") push({ text: part })
      })
    },
    link(text, href) {
      if (text !== "") push({ text, href })
    },
    endLine,
    blankLine() {
      endLine()
      if (lines.length > 0 && lines.at(-1)?.length !== 0) lines.push([])
    },
    finish() {
      endLine()
      while (lines.at(-1)?.length === 0) lines.pop()
      return lines
    },
  }
}

/** The text of a link, which is one span however the source decorated it. */
function inlineText(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text" || node.type === "inlineCode") return node.value
      if (node.type === "image") return node.alt ?? ""
      if (node.type === "html") return node.value.replace(TAG, "")
      if ("children" in node) return inlineText(node.children)
      return ""
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}

function html(value: string, into: Collector): void {
  if (LINE_BREAK.test(value.trim())) {
    into.endLine()
    return
  }
  into.text(value.replace(TAG, ""))
}

function walkAll(nodes: Nodes[], into: Collector, separate: boolean): void {
  for (const node of nodes) {
    if (separate) into.blankLine()
    walk(node, into)
  }
}

function walk(node: Nodes, into: Collector): void {
  switch (node.type) {
    case "text":
    case "inlineCode":
      into.text(node.value)
      return
    case "html":
      html(node.value, into)
      return
    case "image":
      into.text(node.alt ?? "")
      return
    case "link":
      // A link written with no text of its own shows its destination, which is
      // what v1 did with the same case.
      into.link(inlineText(node.children) || node.url, node.url)
      return
    case "break":
      into.endLine()
      return
    case "code":
      into.text(node.value)
      into.endLine()
      return
    case "paragraph":
    case "heading":
      walkAll(node.children, into, false)
      into.endLine()
      return
    case "thematicBreak":
    case "definition":
      return
    case "root":
    case "blockquote":
      // Only these separate what they hold with a blank line. List items and
      // the lines of one item follow each other directly.
      walkAll(node.children, into, true)
      return
    default:
      if ("children" in node) walkAll(node.children, into, false)
      else if ("value" in node) into.text(node.value)
  }
}

export function richTextFromMarkdown(source: string): RichText {
  if (source.trim() === "") return []
  const into = collector()
  walk(processor.parse(source), into)
  return into.finish()
}

/**
 * A v1 field that was never markdown — the crawler stored it as the plain
 * string it read. Parsing it would read punctuation as syntax that nobody wrote.
 */
export function richTextFromPlain(value: string): RichText {
  const into = collector()
  into.text(value)
  return into.finish()
}
