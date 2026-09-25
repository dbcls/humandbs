/**
 * Rebuilding v2 rich text from the HTML v1 kept beside its extracted text.
 *
 * v1 flattened every line break in a research article into a single space
 * before storing `text` (`migration/richtext.ts` reads that flattened form).
 * Many leaves also kept the article's original HTML (`rawHtml`) untouched
 * beside it, which still has the `<br>`, `<p>` and table structure `text`
 * collapsed away. Where the two agree on content, the line breaks and links
 * `rawHtml` has are real and worth recovering; where they disagree,
 * `rawHtml` usually is not a stale edit but a different value altogether (an
 * older bug folded several rows of one column into a single `rawHtml`, with
 * `text` holding only the row a leaf is actually about), so a leaf that
 * disagrees is either resolved by finding its own row or left on `text`.
 *
 * Agreement is judged the way v1 itself judged it when it built these values:
 * both sides are folded down to plain content — links resolved to their
 * label, formatting dropped, whitespace collapsed — and compared as text.
 * That fold is reimplemented here rather than imported, so this module has no
 * dependency on the other repository.
 */

import type { Element, ElementContent, Root, RootContent } from "hast"
import rehypeRaw from "rehype-raw"
import { unified } from "unified"

import type { Line, RichText, Span } from "~/content/types"

import { legacyTarget } from "../app/public/urls"
import { rewriteLinks } from "./html"
import { richTextFromMarkdown } from "./richtext"

export type Lang = "ja" | "en"

/** A leaf as v1 stored it: the flattened text, and the HTML it came from. */
export interface RecoverInput {
  text: string
  rawHtml: string | null
  lang: Lang
}

/**
 * What resolving a link recovered from `rawHtml` needs beyond the link
 * itself.
 */
export interface RecoverContext {
  /**
   * Joomla article id -> that article's address in the old portal (a
   * hum-labelled segment such as `"hum0197-v3"`), for
   * `index.php?option=com_content&...&id=N` links. An id with no entry, or no
   * map supplied at all, drops the link and keeps its visible text.
   */
  articleAliases?: ReadonlyMap<string, string>
}

export type RecoverSource = "rawHtml" | "text" | "split"

export interface RecoveredRichText {
  value: RichText
  source: RecoverSource
  /** Set when a caller should list this leaf for a person to look at. */
  note?: string
}

/* -------------------------------------------------------------------- */
/* Plain-text fold, for deciding whether rawHtml and text agree           */
/* -------------------------------------------------------------------- */

const URL_RE = /https?:\/\/[^\s<>"'）】」、。]+/g
const URL_MASK_OPEN = "\u0001"
const URL_MASK_CLOSE = "\u0002"

/**
 * Folds punctuation and whitespace the way v1's crawler did, so the same
 * content written slightly differently (a full-width colon vs `": "`, a
 * non-breaking space vs a plain one) compares equal. A URL is masked out
 * first so nothing inside one is touched.
 */
function normalizeForComparison(value: string, lang: Lang): string {
  const raw = value.trim()
  if (raw === "") return ""

  const urls: string[] = []
  const masked = raw.replace(URL_RE, (m) => {
    urls.push(m)
    return `${URL_MASK_OPEN}${urls.length - 1}${URL_MASK_CLOSE}`
  })

  let out = masked
    .normalize("NFC")
    .replace(/[\u00a0\u200b\ufeff]/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
    .replace(/／/g, "/")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[‐-―]/g, "-")
    .replace(/\s*[:：]\s*/g, ": ")

  if (lang === "ja") {
    // The excluded range is where a masked URL sits mid-string; treating it
    // like whitespace here keeps a paren next to one from gaining a space it
    // would lose again once the URL is put back.
    out = out
      // eslint-disable-next-line no-control-regex -- see comment above
      .replace(/([^\s(\u0000-\u0008])\(/g, "$1 (")
      // eslint-disable-next-line no-control-regex -- see comment above
      .replace(/\)([^\s)\u0000-\u0008])/g, ") $1")
  }

  out = out.replace(/[ \t]{2,}/g, " ").trim()

  return out.replace(
    new RegExp(`${URL_MASK_OPEN}(\\d+)${URL_MASK_CLOSE}`, "g"),
    (_, i: string) => urls[Number(i)] ?? "",
  )
}

/** Undoes the backslash escapes v1 wrote into `text` for GFM-significant characters. */
function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1")
}

/**
 * Some `text` values have a corrupted escape where an underscore was
 * replaced by an index marker instead of being written back (an older bug in
 * whatever escaped it). Undoing it here, before the fold, lets the comparison
 * see the same content `rawHtml` already has correctly.
 */
// eslint-disable-next-line no-control-regex -- the corruption this repairs is itself a pair of control characters
const CORRUPTED_UNDERSCORE = /\u0005[0-9]+\u0006/g

/** Folds v1's markdown `text` down to plain content, the way v1's own round-trip check did. */
function plainOfMarkdown(markdown: string, lang: Lang): string {
  let t = markdown
    .replace(CORRUPTED_UNDERSCORE, "_")
    .replace(/(?<!\\)\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?(?:sup|sub)>/g, "")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/(?<!\\)\*/g, "")
  t = unescapeMarkdown(t)
  t = t.replace(/\r\n?|\n/g, " ")
  return normalizeForComparison(t, lang)
}

/** Any hast node found either directly under `Root` or under an `Element`. */
type Flow = RootContent | ElementContent

const BLOCK_TAGS = new Set([
  "p", "div", "li", "ul", "ol", "table", "thead", "tbody", "tr", "td", "th",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "dl", "dt", "dd",
])

/** Folds a parsed `rawHtml` fragment down to plain content the same way `plainOfMarkdown` does. */
/**
 * A hand-written bullet at the start of a block — v1's markdown always
 * normalises one of these to `"- "` regardless of which mark was typed, so
 * the html side has to fold the same three marks away to compare equal.
 */
const HAND_WRITTEN_BULLET = /^\s*[-*・]\s+/gm

function plainOfHtml(root: Root, lang: Lang): string {
  const parts: string[] = []

  function walk(node: Flow): void {
    if (node.type === "text") {
      parts.push(node.value)
      return
    }
    if (node.type !== "element") return
    if (node.tagName === "br") {
      parts.push(" ")
      return
    }
    const isBlock = BLOCK_TAGS.has(node.tagName)
    if (isBlock) parts.push(" ")
    for (const child of node.children) walk(child)
    if (isBlock) parts.push(" ")
  }

  for (const child of root.children) walk(child)
  const joined = parts.join("").replace(HAND_WRITTEN_BULLET, "")
  return normalizeForComparison(joined.replace(/\r\n?|\n/g, " "), lang)
}

/* -------------------------------------------------------------------- */
/* Parsing rawHtml                                                       */
/* -------------------------------------------------------------------- */

/**
 * `rehype-raw`'s own node shape for a chunk of HTML still waiting to be
 * parsed. Building one by hand is how a bare HTML string is turned into a
 * hast tree without adding an HTML-parsing dependency of our own — the
 * parser is the one `rehype-raw` already has.
 */
interface RawHtmlNode {
  type: "raw"
  value: string
}

export function parseFragment(source: string): Root {
  const raw: RawHtmlNode = { type: "raw", value: source }
  const root = { type: "root", children: [raw] } as unknown as Root
  return unified().use(rehypeRaw).runSync(root)
}

function flattenText(node: Flow): string {
  if (node.type === "text") return node.value
  if (node.type !== "element") return ""
  return node.children.map(flattenText).join("")
}

/** A link's visible text, collapsed the way a label written across several inline tags reads. */
function inlineLabel(node: Element): string {
  return flattenText(node).replace(/\s+/g, " ").trim()
}

/* -------------------------------------------------------------------- */
/* Dropping the field-name heading rawHtml still has                 */
/* -------------------------------------------------------------------- */

/**
 * v1 removes a leading `<strong>目的： </strong>`-style heading from `text`
 * because it only repeats the field's own name, but leaves it in `rawHtml`.
 * Building straight from `rawHtml` would show the field name twice, so the
 * first heading-shaped run of content is dropped before anything else reads
 * the tree — both for the equality check and for the tree that gets built.
 */
const FIELD_LABEL_TAGS = new Set(["strong", "b"])
const FIELD_LABEL_MAX_LENGTH = 40

function looksLikeFieldLabel(text: string): boolean {
  const trimmed = text.trim()
  return trimmed !== "" && trimmed.length <= FIELD_LABEL_MAX_LENGTH && /[:：]$/.test(trimmed)
}

type LabelScan = "stripped" | "content" | "empty"

/** Finds the first content in document order; removes it if it is a short, colon-terminated bold run. */
function tryStripFieldLabel(nodes: Flow[]): LabelScan {
  for (const [index, node] of nodes.entries()) {
    if (node.type === "text") {
      if (node.value.trim() !== "") return "content"
      continue
    }
    if (node.type !== "element") continue
    if (FIELD_LABEL_TAGS.has(node.tagName)) {
      const text = flattenText(node)
      if (text.trim() === "") continue
      if (!looksLikeFieldLabel(text)) return "content"
      nodes.splice(index, 1)
      return "stripped"
    }
    const result = tryStripFieldLabel(node.children)
    if (result !== "empty") return result
  }
  return "empty"
}

interface Prepared {
  tree: Root
  plain: string
}

function prepare(html: string, lang: Lang): Prepared {
  const tree = parseFragment(html)
  tryStripFieldLabel(tree.children)
  return { tree, plain: plainOfHtml(tree, lang) }
}

/* -------------------------------------------------------------------- */
/* Links                                                                 */
/* -------------------------------------------------------------------- */

const OLD_PORTAL_HOSTS = new Set(["humandbs.dbcls.jp", "humandbs.biosciencedbc.jp"])

function isOldPortalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return OLD_PORTAL_HOSTS.has(host) || host.startsWith("humandbs-production")
}

function queryParam(query: string, name: string): string | null {
  return new RegExp(`[?&]${name}=(\\d+)`).exec(query)?.[1] ?? null
}

/** Runs `migration/html.ts`'s own document-link rewrites on a single href. */
function documentRewrite(path: string): string {
  const wrapped = rewriteLinks(`[x](${path})`)
  return /\]\(([\s\S]*)\)$/.exec(wrapped)?.[1] ?? path
}

/**
 * Applies `resolve` to the path with an `/en` prefix taken off, then puts the
 * prefix back on the result — `legacyTarget` responds in the default locale,
 * and a link that named the English page should keep naming it.
 */
function withLocalePrefix(path: string, resolve: (bare: string) => string | null): string | null {
  const match = /^\/en(\/.*)?$/.exec(path)
  if (match === null) return resolve(path)
  const target = resolve(match[1] ?? "/")
  return target === null ? null : `/en${target}`
}

type HrefResolution
  = | { kind: "keep", href: string }
    /** A same-page anchor, or another href with no destination worth keeping. */
    | { kind: "drop" }
    /** Looked like an internal reference, but nothing here could resolve it. */
    | { kind: "unresolved" }

function resolveInternalPath(path: string, ctx: RecoverContext): HrefResolution {
  const withoutSlash = path.replace(/^\/+/, "")
  if (/^index\.php\b/i.test(withoutSlash)) {
    const id = queryParam(withoutSlash, "id")
    const alias = id === null ? undefined : ctx.articleAliases?.get(id)
    if (alias === undefined) return { kind: "unresolved" }
    const resolved = withLocalePrefix(alias.startsWith("/") ? alias : `/${alias}`, legacyTarget)
    return resolved === null ? { kind: "unresolved" } : { kind: "keep", href: resolved }
  }

  const rewritten = documentRewrite(path)
  const resolved = withLocalePrefix(rewritten, legacyTarget)
  return { kind: "keep", href: resolved ?? rewritten }
}

/**
 * Resolves one `href` from `rawHtml` to what it should point at in v2:
 * external links and files are kept, a same-page anchor is dropped, and an
 * old-portal address (Joomla's `index.php?...`, or an absolute link to the
 * portal's own domain) is rewritten to the v2 page it identifies.
 */
function resolveHref(href: string, ctx: RecoverContext): HrefResolution {
  const value = href.trim()
  if (value === "" || value.startsWith("#")) return { kind: "drop" }
  if (/^(mailto|tel|ftp):/i.test(value)) return { kind: "keep", href: value }

  if (/^https?:\/\//i.test(value)) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return { kind: "keep", href: value }
    }
    if (!isOldPortalHost(url.hostname)) return { kind: "keep", href: value }
    return resolveInternalPath(`${url.pathname}${url.search}${url.hash}`, ctx)
  }

  return resolveInternalPath(value.startsWith("/") ? value : `/${value}`, ctx)
}

/* -------------------------------------------------------------------- */
/* Building v2 rich text from a parsed tree                              */
/* -------------------------------------------------------------------- */

/**
 * Superscripts a run of text becomes when every character has a Unicode
 * superscript form (the same table `migration/html.ts` uses for site
 * content) — the only formatting this module turns into a different
 * character rather than dropping.
 */
const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ",
}

function normalizeSuperscript(text: string): string {
  const folded = Array.from(text, (char) => SUPERSCRIPT[char] ?? "").join("")
  return folded.length === text.length && text !== "" ? folded : text
}

/**
 * Collects spans into lines the same way `migration/richtext.ts` does for
 * markdown: adjacent plain spans merge, and whitespace at either end of a
 * line is layout except a non-breaking space, which is content someone typed
 * to indent a line v1's editor had no other way to indent.
 */
interface Collector {
  text: (value: string) => void
  link: (text: string, href: string) => void
  endLine: () => void
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

  function trimmed(): Line {
    return current
      .map((span, index) => {
        const start = index === 0 ? span.text.replace(/^[^\S\u00a0]+/, "") : span.text
        const text = index === current.length - 1 ? start.replace(/[^\S\u00a0]+$/, "") : start
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
    finish() {
      endLine()
      return lines
    },
  }
}

function walkChildren(nodes: Flow[], into: Collector, ctx: RecoverContext): number {
  return nodes.reduce((dropped, child) => dropped + walkNode(child, into, ctx), 0)
}

/** Walks one node into `into`, returning how many links it dropped for lack of a v2 destination. */
function walkNode(node: Flow, into: Collector, ctx: RecoverContext): number {
  if (node.type === "text") {
    into.text(node.value)
    return 0
  }
  if (node.type !== "element") return 0

  const tag = node.tagName

  if (tag === "br") {
    into.endLine()
    return 0
  }
  if (tag === "sup") {
    into.text(normalizeSuperscript(flattenText(node)))
    return 0
  }
  if (tag === "sub") {
    into.text(flattenText(node))
    return 0
  }
  if (tag === "a") {
    const hrefAttribute = node.properties.href
    if (typeof hrefAttribute !== "string") return walkChildren(node.children, into, ctx)

    const resolution = resolveHref(hrefAttribute, ctx)
    if (resolution.kind === "keep") {
      const label = inlineLabel(node)
      into.link(label || resolution.href, resolution.href)
      return 0
    }
    const penalty = resolution.kind === "unresolved" ? 1 : 0
    return penalty + walkChildren(node.children, into, ctx)
  }
  if (BLOCK_TAGS.has(tag)) {
    into.endLine()
    const dropped = walkChildren(node.children, into, ctx)
    into.endLine()
    return dropped
  }
  // Formatting with no representation in v2 rich text (emphasis, spans,
  // headings' own tag) — its content is shown on its own, unwrapped.
  return walkChildren(node.children, into, ctx)
}

interface Built {
  value: RichText
  note?: string
}

function build(tree: Root, ctx: RecoverContext): Built {
  const into = collector()
  const dropped = walkChildren(tree.children, into, ctx)
  const value = into.finish()
  return dropped === 0
    ? { value }
    : { value, note: `dropped ${dropped} link(s) with no resolvable v2 destination` }
}

function withSource(built: Built, source: "rawHtml" | "split"): RecoveredRichText {
  return built.note === undefined
    ? { value: built.value, source }
    : { value: built.value, source, note: built.note }
}

/* -------------------------------------------------------------------- */
/* Entry point                                                           */
/* -------------------------------------------------------------------- */

/**
 * Recovers a v2 rich text from a v1 `{text, rawHtml}` leaf.
 *
 * `rawHtml` is used whenever it reports the same thing `text` does: either the
 * whole value agrees, or — where an older bug packed several rows into one
 * `rawHtml` — exactly one of its `"\n"`-separated rows agrees. Otherwise the
 * leaf falls back to parsing `text` as markdown, the way `migration/build.ts`
 * already does, and the result has a note so a caller can list it for a
 * person to check.
 */
export function recoverRichText(input: RecoverInput, ctx: RecoverContext = {}): RecoveredRichText {
  const { text, rawHtml, lang } = input
  const targetPlain = plainOfMarkdown(text, lang)

  if (rawHtml === null || rawHtml.trim() === "") {
    return { value: richTextFromMarkdown(text), source: "text" }
  }

  const whole = prepare(rawHtml, lang)
  if (whole.plain === targetPlain) {
    return withSource(build(whole.tree, ctx), "rawHtml")
  }

  const rows = rawHtml.split("\n").map((row) => row.trim()).filter((row) => row !== "")
  if (rows.length > 1) {
    const matches = rows
      .map((row, index) => ({ index, ...prepare(row, lang) }))
      .filter((row) => row.plain === targetPlain)

    const [match] = matches
    if (matches.length === 1 && match !== undefined) {
      const built = withSource(build(match.tree, ctx), "split")
      const rowNote = `recovered row ${match.index + 1} of ${rows.length} in a multi-row rawHtml value`
      return {
        ...built,
        note: built.note === undefined ? rowNote : `${rowNote}; ${built.note}`,
      }
    }

    return {
      value: richTextFromMarkdown(text),
      source: "text",
      note: matches.length === 0
        ? `no row of a ${rows.length}-row rawHtml value matched \`text\`; kept \`text\``
        : `${matches.length} rows of a ${rows.length}-row rawHtml value matched \`text\`; kept \`text\``,
    }
  }

  return {
    value: richTextFromMarkdown(text),
    source: "text",
    note: "rawHtml did not match `text`; kept `text`",
  }
}
