/**
 * Reading the markdown a curator typed into the tree prose is stored as.
 *
 * This is the inbound direction of `richtext.ts`, and the two are a pair: what
 * the editor shows is `toMarkdown` of the stored tree, and what it sends back
 * comes through here. **The tree holds lines, text and written links, and
 * everything else stays as the characters that were typed.** A heading, a
 * list, a table, emphasis, raw HTML — none of them is refused, and none is
 * flattened into the words it wraps: `**bold**` is stored as `**bold**`, so
 * the page beside the form shows the asterisks and the author sees that the
 * dialect does not read them. Nothing is lost and nothing is executed — raw
 * HTML is text, and text is drawn escaped.
 *
 * **A single newline is a line**, as it is on the way out, so a value that lists
 * things one per line survives the round trip. A blank line is a blank line in
 * the tree, and only where one was written.
 *
 * **Plain CommonMark, without GFM.** A table, a strikethrough and a footnote
 * are characters here whether or not a parser names them, and GFM's literal
 * autolinks would turn a bare URL sitting in a value into a link nobody wrote
 * the moment the field was saved unchanged.
 *
 * **Server only.** The parser is several hundred kilobytes and the save path is
 * the only caller.
 */

import type { Nodes, PhrasingContent, RootContent } from "mdast"
import remarkParse from "remark-parse"
import { unified } from "unified"

import type { Line, RichText, Span } from "./types"

const processor = unified().use(remarkParse)

/**
 * Lines being built up. Whitespace at either end of a line is layout rather
 * than content, so it is dropped here — which is also what makes the tree
 * round-trippable, since markdown has no way to hold a line that starts with a
 * space.
 */
interface Lines {
  text: (value: string) => void
  link: (text: string, href: string) => void
  endLine: () => void
  blankLine: () => void
  finish: () => RichText
}

function lines(): Lines {
  const built: Line[] = []
  let current: Span[] = []

  function push(span: Span): void {
    const last = current.at(-1)
    if (span.href === undefined && last !== undefined && last.href === undefined) {
      current[current.length - 1] = { text: last.text + span.text }
      return
    }
    current.push(span)
  }

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
    if (line.length > 0) built.push(line)
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
      if (built.length > 0 && built.at(-1)?.length !== 0) built.push([])
    },
    finish() {
      endLine()
      while (built.at(-1)?.length === 0) built.pop()
      return built
    },
  }
}

interface Reader {
  source: string
  into: Lines
}

/**
 * The characters a node was written with, as the characters they stand for.
 *
 * **A backslash before punctuation is markdown's own escape and not a
 * character the author meant** — it is what `toMarkdown` writes in front of
 * `[`, `<`, `&` and `\\` so that a stored value comes back as itself, and a
 * stored `# [a](b)` has to survive the trip through the heading the parser
 * reads it as. Removed here the way a text node has it removed by the
 * parser, so that what is kept as written is the same whether or not the
 * parser named it.
 */
function written(reader: Reader, node: Nodes): string {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (start === undefined || end === undefined) return ""
  return reader.source.slice(start, end).replace(/\\([!-/:-@[-`{-~])/g, "$1")
}

/** The text of a link, which is one span however many nodes it was split across. */
function linkText(nodes: PhrasingContent[], reader: Reader): string {
  const parts = nodes.map((node) => {
    if (node.type === "text") return node.value
    // A line break cannot happen inside a span, and a link inside a link is not
    // a thing markdown produces.
    if (node.type === "break") return " "
    return written(reader, node)
  })
  return parts.join("").replace(/\s+/g, " ").trim()
}

function walk(node: RootContent, reader: Reader): void {
  switch (node.type) {
    case "text":
      reader.into.text(node.value)
      return
    case "break":
      reader.into.endLine()
      return
    case "link":
      reader.into.link(linkText(node.children, reader), node.url)
      return
    case "paragraph":
      for (const child of node.children) walk(child, reader)
      reader.into.endLine()
      return
    default:
      // **Everything else is the characters it was written with.** The node is
      // not walked: a link inside emphasis is part of what the emphasis was
      // written as, and comes back as those characters too.
      reader.into.text(written(reader, node))
  }
}

/**
 * The tree the source describes. Every source has one.
 *
 * **Each line is read on its own.** The tree is lines, and a construct that
 * spans lines in markdown would pass one line's reading into the next: a line
 * opening with `>` continues as a quote through the line under it, and the
 * link on that line then comes back as the characters it was written with. A
 * line read alone keeps its own links whatever the line above began with.
 */
export function parseRichText(source: string): RichText {
  const into = lines()
  for (const line of source.split(/\r?\n/)) {
    if (line.trim() === "") {
      into.blankLine()
      continue
    }
    const reader: Reader = { source: line, into }
    for (const child of processor.parse(line).children) walk(child, reader)
    into.endLine()
  }
  return into.finish()
}
