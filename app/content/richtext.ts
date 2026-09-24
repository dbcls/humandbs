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
 * The four characters that would come back as something other than themselves.
 *
 * **Only what the save path reads is escaped.** A backslash would swallow the
 * character after it, `[` and `<` open a written link, and `&` opens an entity;
 * everything else markdown could read — emphasis, a heading, a list, a table —
 * the save path keeps as the characters written (`parse.server.ts`), so a
 * stored `*` or `#` goes out bare and comes back a `*` or `#`. Escaping those
 * too would show an author their own `**bold**` back as `\\*\\*bold\\*\\*`.
 */
const INLINE = /[\\[\]<&]/g

function escapeText(text: string): string {
  return text.replace(INLINE, (char: string) => `\\${char}`)
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

function spanMarkdown(span: Span): string {
  const text = escapeText(span.text)
  return span.href === undefined ? text : `[${text}](${destination(span.href)})`
}

/**
 * A line's spans joined. **A `!` right before a link is escaped**: joined bare,
 * `!` and `[` open an image, which the save path does not keep as a link, and
 * the link would come back as its own markdown written out as text.
 */
function lineMarkdown(line: Line): string {
  return line.map((span, at) => {
    const written = spanMarkdown(span)
    const beforeLink = line[at + 1]?.href !== undefined
    return beforeLink && written.endsWith("!") ? `${written.slice(0, -1)}\\!` : written
  }).join("")
}

/**
 * What opens a block at the head of a line: a quote, a heading, a list item, a
 * fence. The group is the one character whose escape makes it plain text.
 */
const BLOCK_OPENER = /^(?:(>)|(#)(?=#{0,5}(?:\s|$))|([-+*])(?=\s)|\d{1,9}([.)])(?=\s)|(`)(?=``)|(~)(?=~~))/

/**
 * A line that holds a link **does not open with a block**: read as a quote or
 * a list, the line is kept as the characters it was written with
 * (`parse.server.ts`), and its links with it. The opening mark is escaped so
 * the line reads as the text and links the tree holds. A line with no link
 * goes out bare — it comes back as the same characters either way.
 */
function plainLine(markdown: string, line: Line): string {
  if (!line.some((span) => span.href !== undefined)) return markdown
  const opener = BLOCK_OPENER.exec(markdown)
  if (opener === null) return markdown
  const mark = (opener.slice(1) as (string | undefined)[]).find((group) => group !== undefined) ?? ""
  const at = opener[0].lastIndexOf(mark)
  return `${markdown.slice(0, at)}\\${markdown.slice(at)}`
}

export function toMarkdown(rich: RichText): string {
  return rich.map((line) => plainLine(lineMarkdown(line), line)).join("\n")
}
