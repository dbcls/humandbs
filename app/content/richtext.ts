/**
 * Walking prose out of the tree it is stored in.
 *
 * A `RichText` is lines of spans and nothing else (`types.ts`), so there is no
 * parser here and no sanitiser: the two outputs below are total functions of a
 * value that cannot hold a construct they would have to strip. The third output
 * is the page itself, which takes the tree and renders it — a serialiser to an
 * HTML string would only add an escaping routine to own.
 *
 * - **plain** is what the JSON API responds with and what the full-text column
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
const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"])

/**
 * Characters a browser strips or reinterprets before it follows a link: it
 * drops tabs and newlines anywhere in the address and reads `\` as `/` in an
 * http(s) one, so `/\evil.example` and `/<TAB>/evil.example` are both
 * `//evil.example` — another host — by the time they are followed. No
 * destination the text needs holds one, so a link holding one is not a link.
 */
// eslint-disable-next-line no-control-regex
const REINTERPRETED = /[\u0000-\u001f\u007f\\]/

/** Any origin will do; a site path is checked by whether it keeps it. */
const SITE = "https://site.invalid"

/**
 * The destination as the page may render it, or null when it may not be one.
 *
 * **What is checked is where a browser would go**, not what the string starts
 * with: the value is resolved the way the browser resolves it (WHATWG URL) and
 * the answer is judged. A site path has to resolve on the site's own origin
 * and to a path that is not itself a host (`//…`).
 */
export function linkHref(href: string): string | null {
  const trimmed = href.trim()
  if (trimmed === "" || REINTERPRETED.test(trimmed)) return null
  // A place on the page itself. The long articles open with a contents list
  // that points at their own headings, and the headings answer at those
  // addresses (`public/markdown.server.ts`).
  if (trimmed.startsWith("#")) return trimmed
  let url: URL
  try {
    url = new URL(trimmed, SITE)
  } catch {
    return null
  }
  // A site-absolute path, which is how the articles link to policies and files.
  // `//` is not one: it is a URL on another host with the scheme left out.
  if (trimmed.startsWith("/")) {
    const sameSite = url.origin === SITE && !trimmed.startsWith("//") && !url.pathname.startsWith("//")
    return sameSite ? trimmed : null
  }
  // Anything else has to name its scheme: a bare `example.com` is a relative
  // path whose meaning changes with the page it is on.
  const written = /^[a-z][a-z0-9+.-]*:/i.exec(trimmed)?.[0].toLowerCase()
  if (written === undefined || written !== url.protocol || !LINK_PROTOCOLS.has(url.protocol)) return null
  if (url.protocol !== "mailto:" && (url.hostname === "" || !/^https?:\/\//i.test(trimmed))) return null
  return trimmed
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
 * (`parse.server.ts`), and its links with it. The opening marker is escaped so
 * the line reads as the text and links the tree holds. A line with no link
 * goes out bare — it comes back as the same characters either way.
 */
function plainLine(markdown: string, line: Line): string {
  if (!line.some((span) => span.href !== undefined)) return markdown
  const opener = BLOCK_OPENER.exec(markdown)
  if (opener === null) return markdown
  const marker = (opener.slice(1) as (string | undefined)[]).find((group) => group !== undefined) ?? ""
  const at = opener[0].lastIndexOf(marker)
  return `${markdown.slice(0, at)}\\${markdown.slice(at)}`
}

export function toMarkdown(rich: RichText): string {
  return rich.map((line) => plainLine(lineMarkdown(line), line)).join("\n")
}
