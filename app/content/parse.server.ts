/**
 * Reading the markdown a curator typed into the tree prose is stored as.
 *
 * This is the inbound direction of `richtext.ts`, and the two are a pair: what
 * the editor shows is `toMarkdown` of the stored tree, and what it sends back
 * comes through here. **Everything the tree cannot hold is refused rather than
 * flattened.** A heading, a list, a table, emphasis, raw HTML — each of them is
 * something the author meant, and dropping it silently would publish text that
 * is not what they wrote. The migration flattens instead, because a dump cannot
 * be asked to correct itself; a person can.
 *
 * **A single newline is a line**, as it is on the way out, so a value that lists
 * things one per line survives the round trip. A blank line separates
 * paragraphs and becomes an empty line in the tree.
 *
 * GFM is switched on so that a table is seen as a table instead of arriving as
 * a paragraph full of pipes. Its literal autolinks are the one part not wanted:
 * a bare URL sitting in a value is text today, and turning it into a link would
 * change stored content the moment somebody opened a field and saved it
 * unchanged. They are told apart from real links by what the source says at the
 * node's own offset — a written link starts with `[`, an autolink with `<`.
 *
 * **Server only.** The parser is several hundred kilobytes and the save path is
 * the only caller.
 */

import type { Nodes, PhrasingContent, RootContent } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"

import type { Line, RichText, Span } from "./types"

const processor = unified().use(remarkParse).use(remarkGfm)

/**
 * What was written that prose cannot hold. The name is the whole of the answer;
 * the wording shown to the author is chosen where the screen is (`messages.ts`),
 * because this module has no language.
 */
export type RichTextSyntax
  = | "heading"
    | "list"
    | "quote"
    | "code"
    | "emphasis"
    | "table"
    | "html"
    | "image"
    | "reference"
    | "rule"
    | "footnote"
    | "unsupported"

export interface RichTextProblem {
  syntax: RichTextSyntax
  /** 1-based line of the source, so the author can find what was refused. */
  line: number
}

export type RichTextResult
  = | { ok: true, value: RichText }
    | { ok: false, problems: RichTextProblem[] }

/**
 * Every node type that is a refusal, and what to call it. Listing them rather
 * than falling through to a catch-all is what makes an author's mistake
 * nameable: "this is a table" is actionable, "this is not allowed" is not.
 */
const REFUSED: Partial<Record<Nodes["type"], RichTextSyntax>> = {
  heading: "heading",
  list: "list",
  listItem: "list",
  blockquote: "quote",
  code: "code",
  inlineCode: "code",
  emphasis: "emphasis",
  strong: "emphasis",
  delete: "emphasis",
  table: "table",
  tableRow: "table",
  tableCell: "table",
  html: "html",
  image: "image",
  imageReference: "image",
  linkReference: "reference",
  definition: "reference",
  thematicBreak: "rule",
  footnoteDefinition: "footnote",
  footnoteReference: "footnote",
}

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
  problems: RichTextProblem[]
}

function refuse(reader: Reader, syntax: RichTextSyntax, node: Nodes): void {
  reader.problems.push({ syntax, line: node.position?.start.line ?? 1 })
}

/**
 * True when the source wrote the link out, rather than GFM having recognised a
 * bare URL. The offset is the node's own start, so the character there is `[`
 * for `[text](url)` and `<` for `<url>`; a literal autolink starts with the URL
 * itself.
 */
function isWritten(reader: Reader, node: Nodes): boolean {
  const offset = node.position?.start.offset
  if (offset === undefined) return true
  const head = reader.source.charAt(offset)
  return head === "[" || head === "<"
}

/** The text of a link, which is one span however many nodes carried it. */
function linkText(nodes: PhrasingContent[], reader: Reader): string {
  const parts = nodes.map((node) => {
    const refused = REFUSED[node.type]
    if (refused !== undefined) {
      refuse(reader, refused, node)
      return ""
    }
    if (node.type === "text") return node.value
    // A line break cannot happen inside a span, and a link inside a link is not
    // a thing markdown produces.
    if (node.type === "break") return " "
    refuse(reader, "unsupported", node)
    return ""
  })
  return parts.join("").replace(/\s+/g, " ").trim()
}

function walkInline(nodes: PhrasingContent[], reader: Reader): void {
  for (const node of nodes) walk(node, reader)
}

function walk(node: RootContent, reader: Reader): void {
  const refused = REFUSED[node.type]
  if (refused !== undefined) {
    refuse(reader, refused, node)
    return
  }

  switch (node.type) {
    case "text":
      reader.into.text(node.value)
      return
    case "break":
      reader.into.endLine()
      return
    case "link":
      if (isWritten(reader, node)) reader.into.link(linkText(node.children, reader), node.url)
      else reader.into.text(linkText(node.children, reader))
      return
    case "paragraph":
      walkInline(node.children, reader)
      reader.into.endLine()
      return
    default:
      refuse(reader, "unsupported", node)
  }
}

/**
 * The tree the source says, or everything about the source that prose cannot
 * hold. **All the problems are reported, not the first one** — a field is fixed
 * once, and finding out about the table only after the heading has been dealt
 * with is two round trips for one edit.
 */
export function parseRichText(source: string): RichTextResult {
  const reader: Reader = { source, into: lines(), problems: [] }
  const root = processor.parse(source)

  root.children.forEach((child, index) => {
    if (index > 0) reader.into.blankLine()
    walk(child, reader)
  })

  if (reader.problems.length > 0) {
    return {
      ok: false,
      problems: [...reader.problems].sort((a, b) => a.line - b.line),
    }
  }
  return { ok: true, value: reader.into.finish() }
}
