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
 * in: the glyph a note is drawn with (`notesFromQuotes`). **The two settings
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
import { visit } from "unist-util-visit"

import { MARKED, NOTE_KIND } from "~/components/base"
import { Icon } from "~/components/icons"
import { linkHref } from "~/content/richtext"

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
 * A blockquote in site content is an aside, not a quotation — "this document
 * has been superseded", "violators are listed here" — so it is drawn as the
 * design system's note (`components/base.tsx`) rather than as an indented
 * paragraph with a rule.
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
const NOTE = NOTE_KIND.info
const GLYPH = renderToStaticMarkup(createElement(Icon, { name: NOTE.icon, className: "text-base" }))

function notesFromQuotes() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "blockquote") return
      const only = node.children.filter((child) => child.type !== "text" || child.value.trim() !== "")
      // A one-paragraph aside loses the paragraph, so that the note's own
      // padding is the only space around the words. Longer ones keep theirs,
      // with the outermost margins taken off.
      const inside: ElementContent[] = only.length === 1 && only[0]?.type === "element"
        && only[0].tagName === "p"
        ? only[0].children
        : node.children
      node.tagName = "div"
      // The note carries its own distance to the paragraphs around it. Left to a
      // `.markdown div` rule it would land on the body inside the box as well,
      // and one line of text would sit in a box three times its height.
      node.properties = { className: [MARKED.box, "my-4 bg-white", NOTE.className] }
      node.children = [
        {
          type: "element",
          tagName: "span",
          properties: { className: [MARKED.icon] },
          children: [{ type: "raw", value: GLYPH } as unknown as ElementContent],
        },
        {
          type: "element",
          tagName: "div",
          properties: { className: [MARKED.body, "[&>:first-child]:mt-0", "[&>:last-child]:mb-0"] },
          children: inside,
        },
      ]
    })
  }
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(shiftHeadings)
  .use(safeDestinations)
  .use(notesFromQuotes)
  .use(rehypeStringify, { allowDangerousHtml: true })

export function renderMarkdown(source: string): string {
  if (source.trim() === "") return ""
  return String(processor.processSync(source))
}
