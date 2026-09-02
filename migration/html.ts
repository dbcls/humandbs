/**
 * Turning v1's site content into markdown.
 *
 * The bodies in the CMS are markdown in name only. Joomla's editor wrote HTML
 * into them and the v1 migration carried it across untouched, so a document is
 * a mixture: markdown headings and links around `<p>`, `<strong>`, `<li>` and —
 * in the tables attached to individual research — thousands of `<td>`. v2 does
 * not parse raw HTML when it renders (`app/public/markdown.server.ts`), so the
 * mixture has to become markdown here.
 *
 * The pipeline reads both dialects and writes one: markdown in, HTML raised
 * into the same tree, then back out as markdown with GFM tables. What has no
 * markdown counterpart is deliberately dropped rather than preserved —
 * `<u>` is underlining laid over text that is already bold, and `style` on a
 * `<span>` is a font size Joomla's editor left behind.
 *
 * One thing is lost on purpose. A `rowspan` cell becomes a cell in every row it
 * used to span, because a GFM table has no spanning: a merged cell turns into a
 * repeated one. Nothing else about the table changes — the input has no nested
 * tables and no `colspan` at all.
 */

import type { Element, ElementContent, Root } from "hast"
import rehypeRaw from "rehype-raw"
import rehypeRemark from "rehype-remark"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import remarkStringify from "remark-stringify"
import { unified } from "unified"
import { visit } from "unist-util-visit"

/** Superscripts in the source are units, charges and footnote marks. */
const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ",
}

function isElement(node: ElementContent): node is Element {
  return node.type === "element"
}

function textOf(node: ElementContent): string {
  if (node.type === "text") return node.value
  if (!isElement(node)) return ""
  return node.children.map(textOf).join("")
}

/** A superscript becomes its Unicode form when every character has one. */
function foldSuperscripts() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      node.children = node.children.map((child) => {
        if (!isElement(child) || child.tagName !== "sup") return child
        const text = textOf(child)
        const folded = Array.from(text, (char) => SUPERSCRIPT[char] ?? "").join("")
        return folded.length === text.length && text !== ""
          ? { type: "text" as const, value: folded }
          : { type: "text" as const, value: text }
      })
    })
  }
}

function rowsOf(table: Element): Element[] {
  const rows: Element[] = []
  const walk = (node: Element) => {
    for (const child of node.children) {
      if (!isElement(child)) continue
      if (child.tagName === "tr") rows.push(child)
      else walk(child)
    }
  }
  walk(table)
  return rows
}

function spanOf(cell: Element, attribute: "rowSpan" | "colSpan"): number {
  const value = cell.properties[attribute]
  const parsed = typeof value === "number" ? value : Number(value ?? 1)
  return Number.isInteger(parsed) && parsed > 1 ? parsed : 1
}

/**
 * Rebuilds every row so that a spanning cell appears in each row and column it
 * covered, then strips the attributes. Done before the tree becomes markdown,
 * where the concept does not exist.
 */
function expandSpans() {
  return (tree: Root) => {
    visit(tree, "element", (table: Element) => {
      if (table.tagName !== "table") return
      const rows = rowsOf(table)
      /** Cells carried down from an earlier row, by the column they sit in. */
      const carried = new Map<number, { cell: Element, left: number }>()

      for (const row of rows) {
        const source = row.children.filter(isElement)
        const rebuilt: Element[] = []
        let column = 0
        let next = 0

        while (next < source.length || carried.has(column)) {
          const held = carried.get(column)
          if (held !== undefined) {
            rebuilt.push(structuredClone(held.cell))
            held.left -= 1
            if (held.left <= 0) carried.delete(column)
            column += 1
            continue
          }
          const cell = source[next]
          if (cell === undefined) break
          next += 1
          const rows_ = spanOf(cell, "rowSpan")
          const columns = spanOf(cell, "colSpan")
          delete cell.properties.rowSpan
          delete cell.properties.colSpan
          for (let i = 0; i < columns; i += 1) {
            rebuilt.push(i === 0 ? cell : structuredClone(cell))
            if (rows_ > 1) carried.set(column, { cell, left: rows_ - 1 })
            column += 1
          }
        }
        row.children = rebuilt
      }
    })
  }
}

/**
 * An empty paragraph. Joomla's editor wrote `<p>&nbsp;</p>` between blocks as
 * spacing, and there are thousands of them; carried across they become
 * paragraphs holding one invisible character.
 */
function dropBlankParagraphs() {
  const keep = (child: { type: string }): boolean => {
    if (child.type !== "element") return true
    const element = child as Element
    if (element.tagName !== "p") return true
    return element.children.some((c) => isElement(c) && c.tagName === "img")
      || textOf(element).replaceAll(" ", "").trim() !== ""
  }

  // The root as well as every element: a document's paragraphs are children of
  // the root, so filtering elements alone would miss all of them.
  return (tree: Root) => {
    tree.children = tree.children.filter(keep)
    visit(tree, "element", (node: Element) => {
      node.children = node.children.filter(keep)
    })
  }
}

const FENCE = /^([ \t]*):::[ \t]*(.*)$/
const ATTRIBUTE = /\s*([a-zA-Z-]+)="([^"]*)"/g

/**
 * What a callout's kind is called in each notation. v1 named it in an attribute
 * and v2 spells it GitHub's way, so the conversion is a rename rather than a
 * decision — the kind the author chose survives, and the box it draws is v2's.
 *
 * **A fence with no attribute is `info`**, because that is what v1 drew for one
 * (`getCalloutType` reads `rawType ?? "info"`), and so is a kind v1 did not
 * know, which fell through to the same default.
 */
const CALLOUT_KIND: Record<string, string> = {
  info: "TIP",
  tip: "IMPORTANT",
  warning: "WARNING",
  error: "CAUTION",
  plain: "NOTE",
}

const CALLOUT_DEFAULT = "TIP"

/**
 * v1 extended markdown with `:::callout` and `:::button` fences. v2 writes the
 * aside GitHub's way instead, so a callout becomes a named alert. `:::button` is
 * not handled — it only ever appears on the three pages that are screens now,
 * so meeting one means something else changed and should stop the run rather
 * than end up in a body as literal text.
 *
 * The fences are written every way a hand-written fence can be: `:::callout`
 * and `::: callout`, with and without attributes, at the left margin and
 * indented three or four spaces inside a numbered clause. The indent has to
 * survive, or a blockquote inside a list item becomes one after it.
 *
 * **An attribute other than `type` stops the run.** v1's callout took a title as
 * well, and none of the fences in the dump carries one; stripping quietly is how
 * a body would arrive in v2 with a line of it missing.
 */
function foldCallouts(source: string): string {
  const out: string[] = []
  let indent: string | null = null

  for (const line of source.split("\n")) {
    const fence = FENCE.exec(line)
    if (fence !== null) {
      const [, fenceIndent = "", rest = ""] = fence
      if (rest.trim() === "") {
        if (indent === null) throw new Error(`unopened markdown directive: ${line.trim()}`)
        indent = null
        continue
      }
      const name = rest.trim().split(/[\s]/)[0] ?? ""
      if (name !== "callout") throw new Error(`unhandled markdown directive: ${line.trim()}`)
      indent = fenceIndent
      const after = rest.trim().slice(name.length)
      let kind = CALLOUT_DEFAULT
      for (const [, key = "", value = ""] of after.matchAll(ATTRIBUTE)) {
        if (key !== "type") throw new Error(`unhandled callout attribute: ${key}`)
        kind = CALLOUT_KIND[value.toLowerCase()] ?? CALLOUT_DEFAULT
      }
      // The mark that makes this an alert rather than a quotation. v1 had
      // already told the two apart — what it fenced is an aside, and what it
      // left as a blockquote is a quotation (the FAQ quotes the
      // personal-information act at length) — so the distinction survives the
      // conversion instead of being re-decided by hand afterwards.
      out.push(`${indent}> [!${kind}]`, `${indent}>`)
      // A fence may carry the first line of its own content after the name, and
      // one of them carries the whole callout and its closing fence as well.
      let inline = after.replaceAll(ATTRIBUTE, "").trim()
      const closesItself = inline.endsWith(":::")
      if (closesItself) inline = inline.slice(0, -3).trimEnd()
      if (inline !== "") out.push(`${indent}> ${inline}`)
      if (closesItself) indent = null
      continue
    }

    if (indent === null || line.trim() === "") {
      out.push(indent === null ? line : `${indent}>`)
      continue
    }
    const stripped = line.startsWith(indent) ? line.slice(indent.length) : line.trimStart()
    out.push(`${indent}> ${stripped}`)
  }

  if (indent !== null) throw new Error("unclosed markdown directive")
  return out.join("\n")
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(foldSuperscripts)
  .use(dropBlankParagraphs)
  .use(expandSpans)
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify, { bullet: "-", emphasis: "*", strong: "*", fence: "`", rule: "-" })

/**
 * Two things the serialiser does to an alert's mark, undone.
 *
 * It escapes the `[`, because a `[…]` could be a reference link; and the mark
 * and the line under it are one paragraph with a soft break in it, which it
 * writes back as a single line. The mark is therefore opened as a paragraph of
 * its own (`foldCallouts` puts a blank quoted line after it) and closed up
 * again here, which leaves the form GitHub writes.
 *
 * Safe as a text substitution because `[!` appears nowhere in the input.
 */
const ESCAPED_MARK = /\\(\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)])\n[ \t]*>\n/g
const ESCAPED_BRACKET = /\\(\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)])/g

export function htmlToMarkdown(source: string): string {
  if (source.trim() === "") return ""
  return String(processor.processSync(foldCallouts(source)))
    .trim()
    .replaceAll(ESCAPED_MARK, "$1\n")
    .replaceAll(ESCAPED_BRACKET, "$1")
}

/**
 * Two rewrites the addresses need.
 *
 * v1 served article assets from `/public-files/`; v2 serves everything from the
 * `common/` box under `/files/` (`docs/data-model.md`, "ファイル"). Relative
 * paths are left alone — `files/images/x.png` was already broken in v1, and
 * guessing at what it meant is a decision, not a rewrite.
 *
 * And Japanese has no prefix in v2, so a link written as `/ja/…` would reach
 * its page through a redirect. The bodies are per locale, so `/en/…` is already
 * right on the English side and is left alone.
 */
export function rewriteLinks(markdown: string): string {
  return markdown
    .replaceAll("/public-files/", "/files/common/")
    .replaceAll("](/ja/", "](/")
}
