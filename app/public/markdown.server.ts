/**
 * Turning the markdown a document or a news item is written in into HTML.
 *
 * Site content keeps a wider dialect than research prose does: a guideline's
 * headings, numbered clauses and tables are the structure of the document
 * rather than decoration, so they are written in CommonMark plus GFM tables and
 * stored as a markdown string (`docs/data-model.md`, "サイトコンテンツ").
 *
 * **Raw HTML is not parsed.** `remark-rehype` is not given
 * `allowDangerousHtml`, so an HTML node never reaches the tree and there is
 * nothing for a sanitiser to strip. That is what makes the set of things a
 * document can render equal to the set of things markdown can express, held in
 * one place instead of two. The migration converts the HTML that v1
 * accumulated into markdown, so nothing is lost by refusing it here.
 *
 * The serialiser *is* allowed to write raw nodes, because this file puts one
 * in: the glyph a note is drawn with (`alertsFromQuotes`). **The two settings
 * are on different ends** — nothing an author writes can become a raw node, so
 * the only markup that reaches the page is markdown's or this file's.
 *
 * **Refusing it means dropping it.** An inline tag loses the tag and keeps its
 * text; a block of HTML is dropped with its text inside it. That is the right
 * default for rendering — nothing an author writes can become markup on the
 * portal's origin — but it is the wrong place to find out, so the save path
 * rejects raw HTML rather than letting an author publish text that vanishes.
 *
 * **Server only.** The result travels in the loader's payload as a string, so
 * the parser is never shipped to a reader — the text does not change after it
 * is published, and re-parsing it per reader buys nothing.
 */

import type { Element, ElementContent, Root } from "hast"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { CONTINUE, EXIT, visit } from "unist-util-visit"

import { MARKED, NOTE_KIND, type NoteKind } from "~/components/base"
import { Icon } from "~/components/icons"
import { linkHref } from "~/content/richtext"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

const HEADING = /^h([1-6])$/

function headingLevel(tagName: string): number | null {
  const match = HEADING.exec(tagName)
  const digit = match === null ? undefined : match[1]
  return digit === undefined ? null : Number(digit)
}

/**
 * The page puts the document's title in the only `<h1>` it has, so a body that
 * writes its own top-level heading would give the page two. Shifting the whole
 * body down keeps the levels in the order the author wrote them.
 */
function shiftHeadings() {
  return (tree: Root) => {
    const levels: number[] = []
    visit(tree, "element", (node: Element) => {
      const level = headingLevel(node.tagName)
      if (level !== null) levels.push(level)
    })
    if (!levels.includes(1)) return
    visit(tree, "element", (node: Element) => {
      const level = headingLevel(node.tagName)
      if (level !== null) node.tagName = `h${Math.min(level + 1, 6)}`
    })
  }
}

/**
 * A destination the page will not follow loses the attribute that would make it
 * one, so `[x](javascript:…)` renders as its text on the portal's own origin.
 * This is the same check the research pages apply to a span's URL, and for the
 * same reason: content arrives from a migration and from providers, not only
 * through the portal's save path.
 */
function safeDestinations() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const attribute = node.tagName === "a" ? "href" : node.tagName === "img" ? "src" : null
      if (attribute === null) return
      const value = node.properties[attribute]
      if (typeof value !== "string") return
      // `undefined` is how hast says an attribute is absent; the serialiser
      // leaves it out entirely.
      node.properties = { ...node.properties, [attribute]: linkHref(value) ?? undefined }
    })
  }
}

/**
 * The address a heading answers at, built from its words.
 *
 * **Words rather than a counter**: an address that survives an edit elsewhere
 * in the article is one a reader can quote. Everything that is not a letter, a
 * digit or a separator goes, which takes the numbering the guidelines carry
 * (`５．` becomes `５`) — punctuation in an address is noise, and a heading that
 * is punctuation alone has no words to name it by.
 */
function slugFor(text: string): string {
  const said = text.trim().toLowerCase().replaceAll(/\s+/g, "-").replaceAll(/[^\p{L}\p{N}_-]/gu, "")
  // A heading of punctuation alone leaves separators and nothing to read, and
  // `#---` names a place no better than `#section` does.
  return /[\p{L}\p{N}]/u.test(said) ? said : "section"
}

function textOf(node: Element): string {
  let out = ""
  visit(node, "text", (child) => {
    out += child.value
  })
  return out
}

/**
 * Every heading answers at an address of its own, and offers it when pointed at.
 *
 * **The articles already ask for this.** The FAQ opens with a contents list of
 * its own headings and the guidelines cross-reference their clauses, so without
 * the ids those links point at nothing. It is also how a reader sends somebody
 * one clause of a guideline rather than a document of 16,000px.
 *
 * The mark is out in the margin and shows on hover, so an article of nothing but
 * headings does not gain a column of `#`. It stays reachable from the keyboard —
 * it is transparent rather than absent, so focus can land on it and bring it
 * into view.
 */
const ANCHOR = [
  "absolute", "inset-y-0", "-left-6", "flex", "items-center",
  "font-normal", "text-base", "text-ink-muted", "no-underline",
  "opacity-0", "hover:text-brand", "focus-visible:opacity-100", "group-hover:opacity-100",
]

function headingAnchors(options: { label: string }) {
  return (tree: Root) => {
    const used = new Map<string, number>()
    visit(tree, "element", (node: Element) => {
      if (headingLevel(node.tagName) === null) return
      const base = slugFor(textOf(node))
      const seen = used.get(base)
      used.set(base, (seen ?? 0) + 1)
      const id = seen === undefined ? base : `${base}-${seen + 1}`
      node.properties = { ...node.properties, id, className: ["group", "relative"] }
      node.children = [
        {
          type: "element",
          tagName: "a",
          properties: { href: `#${id}`, className: ANCHOR, ariaLabel: options.label },
          children: [{ type: "text", value: "#" }],
        },
        ...node.children,
      ]
    })
  }
}

/**
 * An aside that names itself becomes the design system's note; a quotation
 * stays a quotation.
 *
 * **The naming is GitHub's**: a blockquote whose first line is `[!NOTE]` (or
 * TIP / IMPORTANT / WARNING / CAUTION) is an alert. Writing the mark rather than
 * inferring it from the `>` is what lets an article hold both — the FAQ quotes
 * 43 lines of the personal-information act, headings and all, and a statute
 * inside a "ⓘ" box says the wrong thing about what it is.
 *
 * **The word is not drawn.** A screen's note carries no label either; the glyph
 * and the colour are what say which kind it is.
 *
 * **The box and the glyph come from the parts, not from a copy of them.** The
 * classes are `MARKED` and the drawing is `Icon`, both rendered once here, so a
 * note in an article and a note on a screen cannot drift apart.
 *
 * The glyph is the one place a raw node is put into the tree, which is why the
 * serialiser is allowed to emit them. **This does not let an author's HTML
 * through**: `remark-rehype` still refuses to parse any, so a raw node can only
 * be one this file constructed.
 */
const ALERT: Record<string, NoteKind> = {
  NOTE: "plain",
  TIP: "info",
  IMPORTANT: "tip",
  WARNING: "warning",
  CAUTION: "danger",
}

/** The whole of the first line, which is how GitHub tells a mark from a sentence. */
const ALERT_LINE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i

const GLYPH: Partial<Record<NoteKind, string>> = {}
for (const kind of Object.values(ALERT)) {
  const { icon } = NOTE_KIND[kind]
  if (icon !== null) {
    GLYPH[kind] = renderToStaticMarkup(createElement(Icon, { name: icon, className: "text-base" }))
  }
}

/** What a blockquote holds once its mark is taken off, or null if it has none. */
function alertBody(node: Element): { kind: NoteKind, inside: ElementContent[] } | null {
  const said = node.children.filter((child) => child.type !== "text" || child.value.trim() !== "")
  const head = said[0]
  if (head?.type !== "element" || head.tagName !== "p") return null
  const mark = head.children[0]
  if (mark?.type !== "text") return null
  // **The mark is the first line of the paragraph, not the whole of it.** A soft
  // break inside a paragraph is a newline in the text rather than an element, so
  // `> [!NOTE]` followed by a line of prose arrives as one text node.
  const eol = mark.value.indexOf("\n")
  const named = ALERT_LINE.exec((eol === -1 ? mark.value : mark.value.slice(0, eol)).trim())
  if (named?.[1] === undefined) return null
  const kind = ALERT[named[1].toUpperCase()]
  if (kind === undefined) return null

  // What follows the mark is the first paragraph of the note; a mark on its own
  // leaves that paragraph empty.
  const said_ = eol === -1 ? "" : mark.value.slice(eol + 1)
  const rest: ElementContent[] = said_ === ""
    ? head.children.slice(1)
    : [{ type: "text", value: said_ }, ...head.children.slice(1)]
  while (rest[0]?.type === "element" && rest[0].tagName === "br") rest.shift()
  const blocks = rest.length === 0
    ? said.slice(1)
    : [{ ...head, children: rest }, ...said.slice(1)]

  // A one-paragraph aside loses the paragraph, so that the note's own padding
  // is the only space around the words. Longer ones keep theirs, with the
  // outermost margins taken off.
  const only = blocks[0]
  const inside = blocks.length === 1 && only?.type === "element" && only.tagName === "p"
    ? only.children
    : blocks
  return { kind, inside }
}

function alertsFromQuotes() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "blockquote") return
      const alert = alertBody(node)
      if (alert === null) return
      const glyph = GLYPH[alert.kind]
      node.tagName = "div"
      // The note carries its own distance to the paragraphs around it. Left to a
      // `.markdown div` rule it would land on the body inside the box as well,
      // and one line of text would sit in a box three times its height.
      node.properties = { className: [MARKED.box, "my-4 bg-white", NOTE_KIND[alert.kind].className] }
      node.children = [
        ...(glyph === undefined
          ? []
          : [{
              type: "element" as const,
              tagName: "span",
              properties: { className: [MARKED.icon] },
              children: [{ type: "raw", value: glyph } as unknown as ElementContent],
            }]),
        {
          type: "element",
          tagName: "div",
          properties: { className: [MARKED.body, "[&>:first-child]:mt-0", "[&>:last-child]:mb-0"] },
          children: alert.inside,
        },
      ]
    })
  }
}

/**
 * One per language, because the anchor a heading carries has a name and names
 * are words. The pipeline is otherwise the same, and both are built once.
 */
const PROCESSOR: Record<Locale, ReturnType<typeof buildProcessor>> = {
  ja: buildProcessor("ja"),
  en: buildProcessor("en"),
}

function buildProcessor(locale: Locale) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(shiftHeadings)
    .use(safeDestinations)
    .use(headingAnchors, { label: messagesFor(locale).headingLink })
    .use(alertsFromQuotes)
    .use(rehypeStringify, { allowDangerousHtml: true })
}

export function renderMarkdown(source: string, locale: Locale): string {
  if (source.trim() === "") return ""
  return String(PROCESSOR[locale].processSync(source))
}

/** Where a block ends, so the last word of one does not run into the next. */
const BLOCK = new Set([
  "paragraph", "heading", "listItem", "tableCell", "blockquote", "code", "break", "thematicBreak",
])

const text = unified().use(remarkParse).use(remarkGfm)

/**
 * The opening of an article as plain words, for a listing that shows a line or
 * two of what each entry is about.
 *
 * **Parsed rather than trimmed with a regular expression.** The bodies came
 * from Joomla through a conversion, so they carry links, tables and headings;
 * cutting the string would show `[…](…)` and `|---|` to the reader. Walking the
 * tree takes the words and nothing else.
 *
 * **Cut generously.** The reader sees one or two lines of it, but how many
 * characters that is depends on the width and the language, so the screen
 * clamps the lines and this only stops a whole guideline travelling in a
 * listing's payload.
 */
export function leadingText(source: string, most = 200): string {
  if (source.trim() === "") return ""
  let out = ""
  visit(text.parse(source), (node) => {
    if (node.type === "text" || node.type === "inlineCode") out += node.value
    else if (BLOCK.has(node.type)) out += " "
    return out.length > most * 2 ? EXIT : CONTINUE
  })
  const said = out.replace(/\s+/g, " ").trim()
  return said.length > most ? `${said.slice(0, most)}…` : said
}
