/**
 * Walking prose out of the tree it is stored in.
 *
 * A `RichText` is lines of spans and nothing else (`types.ts`), so there is no
 * parser here and no sanitiser: the two outputs below are total functions of a
 * value that cannot hold a construct they would have to strip. The third output
 * is the page itself, which takes the tree and renders it — a serialiser to an
 * HTML string would only add an escaping routine to own.
 *
 * - **plain** is what the JSON API answers with and what the full-text column
 *   is built from. A line becomes a line; nothing is inserted between spans,
 *   because a span boundary is not a word boundary (`1.73m` + `²`)
 * - **markdown** is what the editor is handed back. A single newline is a line
 *   boundary in the portal's dialect, which is what makes the round trip exact
 *
 * The destination of a link is checked where it is rendered rather than where
 * it is stored. The tree closes the raw-HTML route into the page, but not the
 * one through a link's own URL, and content arrives from a migration and from
 * providers as well as through the portal's own save path.
 */

import type { Line, RichText, Span } from "./types"

/** Empty means nobody filled it in — the same reading as an empty string. */
export function isEmptyRichText(rich: RichText): boolean {
  return rich.every((line) => line.every((span) => span.text === ""))
}

export function toPlainText(rich: RichText): string {
  return rich.map((line) => line.map((span) => span.text).join("")).join("\n")
}

/**
 * Schemes a link may point at. Anything else — `javascript:`, `data:`, a
 * protocol-relative `//host` — renders as its text with no link at all, so a
 * destination written by hand cannot execute on the portal's origin.
 */
const LINK_SCHEMES = ["http://", "https://", "mailto:"]

export function linkHref(href: string): string | null {
  const trimmed = href.trim()
  const lowered = trimmed.toLowerCase()
  if (LINK_SCHEMES.some((scheme) => lowered.startsWith(scheme))) return trimmed
  // A site-absolute path, which is how the articles link to policies and files.
  // `//` is not one: it is a URL on another host with the scheme left out.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed
  // A place on the page itself. The long articles open with a contents list
  // that points at their own headings, and the headings answer at those
  // addresses (`public/markdown.server.ts`).
  if (trimmed.startsWith("#")) return trimmed
  return null
}

/**
 * Punctuation markdown reads as syntax wherever in a line it appears.
 *
 * `|` and `~` are here for the dialect's sake rather than CommonMark's: a table
 * and a strikethrough are things prose cannot hold, and the save path rejects
 * them, so text that already holds one of those characters has to come back out
 * as text. Escaping them is what makes "what this writes out, the save path
 * accepts and reads back unchanged" true for every tree.
 */
const INLINE = /[\\`*_[\]<&|~]/g

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char)
}

/**
 * An underscore between two word characters is left alone: markdown does not
 * read it as emphasis, and the published values are full of them (`PI_HAT`,
 * file names), which the editor would otherwise show back full of backslashes.
 */
function escapeText(text: string): string {
  return text.replace(INLINE, (char: string, offset: number) => {
    if (char === "_" && isWordChar(text[offset - 1]) && isWordChar(text[offset + 1])) return char
    return `\\${char}`
  })
}

/** At the start of a line these open a heading, a quote, a list or a rule. */
function escapeLineStart(text: string): string {
  return text.replace(/^([#>+\-=])/, "\\$1").replace(/^(\d+)([.)])/, "$1\\$2")
}

/**
 * Angle brackets are needed around a destination holding whitespace or
 * parentheses, and several of the published URLs hold both.
 */
function destination(href: string): string {
  return /[\s()<>]/.test(href)
    ? `<${href.replace(/[<>]/g, (char) => `\\${char}`)}>`
    : href
}

function spanMarkdown(span: Span, index: number): string {
  const text = escapeText(span.text)
  if (span.href !== undefined) return `[${text}](${destination(span.href)})`
  return index === 0 ? escapeLineStart(text) : text
}

function lineMarkdown(line: Line): string {
  return line.map(spanMarkdown).join("")
}

export function toMarkdown(rich: RichText): string {
  return rich.map(lineMarkdown).join("\n")
}
